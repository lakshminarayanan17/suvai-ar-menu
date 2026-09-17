// Photo → 3D via Tencent's Hunyuan3D Gradio Spaces on Hugging Face (free ZeroGPU).
// Talks the Gradio 4 queue protocol directly: /upload → /queue/join → /queue/data (SSE).
//
// ZeroGPU quota is per Hugging Face account: ~2 min/day anonymous (not enough for one
// textured dish, which requests ~135 s), 5 min/day with a free token, 40 min/day on PRO.

import { GenerateOptions, GenerateResult, ModelProvider, QuotaError } from "./types";

interface SpaceSpec {
  id: string; // "owner/name"
  // The Space's `generation_all` handler has a hidden leading input: a caption
  // textbox on 2 / 2mv, a gr.State on 2.1. Both must be sent positionally.
  leading: "caption" | "state";
  multiView: boolean;
}

const SPACES: Record<string, SpaceSpec> = {
  "tencent/Hunyuan3D-2": { id: "tencent/Hunyuan3D-2", leading: "caption", multiView: false }, // 135 s GPU
  "tencent/Hunyuan3D-2mv": { id: "tencent/Hunyuan3D-2mv", leading: "caption", multiView: true }, // 135 s GPU
  // PBR textures, but requests 270 s of GPU per run — ZeroGPU only allows that for PRO
  // accounts, so it's opt-in via HUNYUAN_SPACES=tencent/Hunyuan3D-2.1,tencent/Hunyuan3D-2
  "tencent/Hunyuan3D-2.1": { id: "tencent/Hunyuan3D-2.1", leading: "state", multiView: false },
};

const DEFAULT_SINGLE = ["tencent/Hunyuan3D-2"];
const DEFAULT_MULTI = ["tencent/Hunyuan3D-2mv", "tencent/Hunyuan3D-2"];

function spaceList(env: string | undefined, fallback: string[]): SpaceSpec[] {
  const ids = env ? env.split(",").map((s) => s.trim()).filter(Boolean) : fallback;
  return ids.map((id) => SPACES[id] ?? { id, leading: "caption", multiView: false });
}

const spaceHost = (id: string) => `https://${id.toLowerCase().replace("/", "-").replace(/\./g, "-")}.hf.space`;

type FileData = { path: string; url?: string; orig_name?: string; mime_type?: string; size?: number; meta: { _type: "gradio.FileData" } };

interface QueueMessage {
  msg: string;
  rank?: number;
  queue_size?: number;
  rank_eta?: number | null;
  eta?: number | null;
  success?: boolean;
  output?: { data?: unknown[]; error?: string | null };
}

async function fetchJwt(spaceId: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(`https://huggingface.co/api/spaces/${spaceId}/jwt`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return ((await res.json()) as { token?: string }).token ?? null;
  } catch {
    return null;
  }
}

async function fetchPhoto(url: string): Promise<{ blob: Blob; name: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch photo (${res.status})`);
  const type = res.headers.get("content-type") ?? "image/jpeg";
  const ext = type.includes("png") ? "png" : "jpg";
  return { blob: new Blob([await res.arrayBuffer()], { type }), name: `photo.${ext}` };
}

class GradioSpace {
  private host: string;
  private headers: Record<string, string> = {};
  private sign = "";

  constructor(private spec: SpaceSpec, private token?: string) {
    this.host = spaceHost(spec.id);
    if (token) this.headers.Authorization = `Bearer ${token}`;
  }

  async init() {
    if (this.token) {
      const jwt = await fetchJwt(this.spec.id, this.token);
      if (jwt) this.sign = `__sign=${encodeURIComponent(jwt)}`;
    }
  }

  private url(path: string, query?: string) {
    const q = [query, this.sign].filter(Boolean).join("&");
    return `${this.host}${path}${q ? `?${q}` : ""}`;
  }

  async upload(photo: { blob: Blob; name: string }, sessionHash: string, signal?: AbortSignal): Promise<FileData> {
    const form = new FormData();
    form.append("files", photo.blob, photo.name);
    const res = await fetch(this.url("/upload", `upload_id=${sessionHash}`), { method: "POST", body: form, headers: this.headers, signal });
    if (!res.ok) throw new Error(`Upload to ${this.spec.id} failed (${res.status})`);
    const [path] = (await res.json()) as string[];
    return { path, orig_name: photo.name, mime_type: photo.blob.type, size: photo.blob.size, meta: { _type: "gradio.FileData" } };
  }

  async fnIndex(apiName: string): Promise<number> {
    const res = await fetch(this.url("/config"), { headers: this.headers });
    if (!res.ok) throw new Error(`Space ${this.spec.id} is not reachable (${res.status})`);
    const cfg = (await res.json()) as { dependencies: { api_name?: string }[] };
    const idx = cfg.dependencies.findIndex((d) => d.api_name === apiName);
    if (idx === -1) throw new Error(`Space ${this.spec.id} has no ${apiName} endpoint`);
    return idx;
  }

  async run(fnIndex: number, data: unknown[], sessionHash: string, onMessage: (m: QueueMessage) => void, signal?: AbortSignal): Promise<unknown[]> {
    const join = await fetch(this.url("/queue/join"), {
      method: "POST",
      headers: { ...this.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ data, fn_index: fnIndex, session_hash: sessionHash, trigger_id: null, event_data: null }),
      signal,
    });
    if (!join.ok) throw new Error(`Queue join failed (${join.status})`);

    const stream = await fetch(this.url("/queue/data", `session_hash=${sessionHash}`), { headers: this.headers, signal });
    if (!stream.ok || !stream.body) throw new Error(`Queue stream failed (${stream.status})`);

    const reader = stream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const msg = JSON.parse(line.slice(5)) as QueueMessage;
        if (msg.msg === "heartbeat") continue;
        onMessage(msg);
        if (msg.msg === "process_completed") {
          reader.cancel().catch(() => {});
          const err = msg.output?.error;
          if (msg.success === false || err) {
            const text = typeof err === "string" ? err.replace(/^'|'$/g, "") : "The 3D generator failed";
            if (/ZeroGPU quota/i.test(text)) throw new QuotaError(text);
            throw new Error(text);
          }
          return msg.output?.data ?? [];
        }
        if (msg.msg === "unexpected_error") throw new Error(String((msg as { message?: string }).message ?? "Unexpected error"));
      }
    }
    throw new Error("Generator stream ended without a result");
  }
}

function describe(m: QueueMessage): string | null {
  if (m.msg === "estimation") {
    const ahead = m.rank ?? 0;
    const eta = m.rank_eta ? ` (~${Math.round(m.rank_eta)}s)` : "";
    return ahead > 0 ? `Waiting for a free GPU — ${ahead} ahead${eta}` : `Waiting for a free GPU${eta}`;
  }
  if (m.msg === "process_starts") return "Building the 3D model";
  return null;
}

async function generateWithSpace(spec: SpaceSpec, opts: GenerateOptions): Promise<ArrayBuffer> {
  const token = process.env.HF_TOKEN;
  const space = new GradioSpace(spec, token);
  await space.init();
  const session = crypto.randomUUID().replace(/-/g, "").slice(0, 12);

  opts.onProgress?.("Uploading photos");
  const views = spec.multiView
    ? ([opts.photos.front, opts.photos.back, opts.photos.left, opts.photos.right] as const)
    : ([opts.photos.front] as const);
  const uploaded = await Promise.all(views.map((u) => (u ? fetchPhoto(u).then((p) => space.upload(p, session, opts.signal)) : null)));

  const image = spec.multiView ? null : uploaded[0];
  const [front, back, left, right] = spec.multiView ? uploaded : [null, null, null, null];
  const args: unknown[] = [
    spec.leading === "caption" ? "" : null,
    image, front ?? null, back ?? null, left ?? null, right ?? null,
    5, // steps — "Turbo", the Space's recommended preset
    5.0, // guidance
    1234, // seed (randomised below)
    256, // octree resolution
    true, // remove background
    8000, // num_chunks
    true, // randomize seed
  ];

  const fn = await space.fnIndex("generation_all");
  const outputs = await space.run(fn, args, session, (m) => { const s = describe(m); if (s) opts.onProgress?.(s); }, opts.signal);

  // Outputs: [white_mesh, textured_mesh, html preview, mesh stats, seed]
  const files = outputs.filter((o): o is FileData & { url: string } => !!o && typeof o === "object" && typeof (o as FileData).url === "string");
  const textured = files.find((f) => (f.orig_name ?? f.path).includes("textured")) ?? files[files.length - 1];
  if (!textured) throw new Error("Generator returned no model file");

  opts.onProgress?.("Downloading model");
  const res = await fetch(textured.url, { signal: opts.signal });
  if (!res.ok) throw new Error(`Could not download model (${res.status})`);
  return res.arrayBuffer();
}

export const hunyuanProvider: ModelProvider = {
  name: "hunyuan",
  async generate(opts) {
    const multi = !!(opts.photos.back || opts.photos.left || opts.photos.right);
    const candidates = multi
      ? spaceList(process.env.HUNYUAN_MV_SPACES, DEFAULT_MULTI)
      : spaceList(process.env.HUNYUAN_SPACES, DEFAULT_SINGLE);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 270_000);
    const signal = opts.signal ?? controller.signal;

    let lastErr: Error | null = null;
    try {
      for (const spec of candidates) {
        try {
          const glb = await generateWithSpace(spec, { ...opts, signal });
          return { glb, provider: `hunyuan:${spec.id}` };
        } catch (err) {
          lastErr = err instanceof Error ? err : new Error(String(err));
          // Quota is per account, so every Space will refuse — don't burn more time
          if (lastErr instanceof QuotaError || signal.aborted) break;
          console.warn(`[hunyuan] ${spec.id} failed, trying next:`, lastErr.message);
        }
      }
    } finally {
      clearTimeout(timer);
    }
    if (signal.aborted) throw new Error("Timed out waiting for a free GPU — try again in a few minutes");
    throw lastErr ?? new Error("No generator available");
  },
};
