// Photo → 3D via Microsoft's TRELLIS.2 Gradio Space on Hugging Face (free ZeroGPU).
// Gradio 6 protocol (/gradio_api prefix) with a session-scoped pipeline:
//   start_session → preprocess_image → image_to_3d → extract_glb
// The 3D state lives server-side in the session, so every call must share one session_hash.

import { GenerateOptions, GenerateResult, ModelProvider, QuotaError } from "./types";

const SPACE_ID = process.env.TRELLIS_SPACE ?? "microsoft/TRELLIS.2";
// A plate-sized dish doesn't need 300k triangles (≈10 MB); 80k keeps the GLB ~3 MB
// for mobile AR with no visible loss. Textures stay 2K — they're only ~1 MB as WebP.
const DECIMATION_TARGET = Number(process.env.TRELLIS_DECIMATION ?? 80_000);
const TEXTURE_SIZE = Number(process.env.TRELLIS_TEXTURE_SIZE ?? 2048);
const host = (id: string) => `https://${id.toLowerCase().replace("/", "-").replace(/\./g, "-")}.hf.space`;

type FileData = { path: string; url?: string; orig_name?: string; mime_type?: string | null; size?: number | null; meta: { _type: "gradio.FileData" } };

interface QueueMessage {
  msg: string;
  rank?: number;
  rank_eta?: number | null;
  success?: boolean;
  message?: string;
  output?: { data?: unknown[]; error?: string | null };
}

async function fetchJwt(spaceId: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(`https://huggingface.co/api/spaces/${spaceId}/jwt`, { headers: { Authorization: `Bearer ${token}` } });
    return res.ok ? (((await res.json()) as { token?: string }).token ?? null) : null;
  } catch {
    return null;
  }
}

class TrellisSession {
  private base = host(SPACE_ID);
  private headers: Record<string, string> = {};
  private sign = "";
  private session = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  private fn: Record<string, number> = {};

  constructor(private signal?: AbortSignal, private onProgress?: (s: string) => void) {}

  async init() {
    const token = process.env.HF_TOKEN;
    if (token) {
      this.headers.Authorization = `Bearer ${token}`;
      const jwt = await fetchJwt(SPACE_ID, token);
      if (jwt) this.sign = `__sign=${encodeURIComponent(jwt)}`;
    }
    const res = await fetch(this.url("/config"), { headers: this.headers, signal: this.signal });
    if (!res.ok) throw new Error(`TRELLIS.2 Space is not reachable (${res.status})`);
    const cfg = (await res.json()) as { dependencies: { api_name?: string }[] };
    cfg.dependencies.forEach((d, i) => { if (d.api_name) this.fn[d.api_name] = i; });
    for (const name of ["start_session", "preprocess_image", "image_to_3d", "extract_glb"]) {
      if (this.fn[name] == null) throw new Error(`TRELLIS.2 Space has no ${name} endpoint (API changed)`);
    }
  }

  private url(path: string, query?: string) {
    const q = [query, this.sign].filter(Boolean).join("&");
    return `${this.base}${path}${q ? `?${q}` : ""}`;
  }

  async upload(blob: Blob, name: string): Promise<FileData> {
    const form = new FormData();
    form.append("files", blob, name);
    const res = await fetch(this.url("/gradio_api/upload", `upload_id=${this.session}`), { method: "POST", body: form, headers: this.headers, signal: this.signal });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    const [path] = (await res.json()) as string[];
    return { path, orig_name: name, mime_type: blob.type, size: blob.size, meta: { _type: "gradio.FileData" } };
  }

  async call(apiName: string, data: unknown[], label: string): Promise<unknown[]> {
    const join = await fetch(this.url("/gradio_api/queue/join"), {
      method: "POST",
      headers: { ...this.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ data, fn_index: this.fn[apiName], session_hash: this.session, trigger_id: null, event_data: null }),
      signal: this.signal,
    });
    if (!join.ok) throw new Error(`${label}: queue join failed (${join.status})`);

    const stream = await fetch(this.url("/gradio_api/queue/data", `session_hash=${this.session}`), { headers: this.headers, signal: this.signal });
    if (!stream.ok || !stream.body) throw new Error(`${label}: queue stream failed (${stream.status})`);

    const reader = stream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let lastQueueNote = "";
    try {
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
          if (msg.msg === "estimation" && (msg.rank ?? 0) > 0) {
            const note = `${label} — ${msg.rank} ahead in the GPU queue`;
            if (note !== lastQueueNote) { lastQueueNote = note; this.onProgress?.(note); }
          } else if (msg.msg === "process_starts") {
            this.onProgress?.(label);
          } else if (msg.msg === "process_completed") {
            const err = msg.output?.error;
            if (msg.success === false || err) {
              const text = typeof err === "string" ? err.replace(/^'|'$/g, "") : `${label} failed`;
              if (/ZeroGPU quota/i.test(text)) throw new QuotaError(text);
              throw new Error(text);
            }
            return msg.output?.data ?? [];
          } else if (msg.msg === "unexpected_error") {
            throw new Error(`${label}: ${msg.message ?? "unexpected error"}`);
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }
    throw new Error(`${label}: stream ended without a result`);
  }
}

export const trellisProvider: ModelProvider = {
  name: "trellis",
  async generate({ photos, timeoutMs = 270_000, onProgress, signal: outer }: GenerateOptions): Promise<GenerateResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const signal = outer ?? controller.signal;
    try {
      const s = new TrellisSession(signal, onProgress);
      await s.init();

      onProgress?.("Uploading photo");
      const res = await fetch(photos.front, { signal });
      if (!res.ok) throw new Error(`Could not fetch photo (${res.status})`);
      const type = res.headers.get("content-type") ?? "image/jpeg";
      const blob = new Blob([await res.arrayBuffer()], { type });
      const upload = await s.upload(blob, type.includes("png") ? "photo.png" : "photo.jpg");

      await s.call("start_session", [], "Starting session");
      const [preprocessed] = await s.call("preprocess_image", [upload], "Removing background");

      // Defaults from the Space UI; resolution 1024 balances detail vs. GPU time.
      await s.call(
        "image_to_3d",
        [preprocessed, 0, "1024", 7.5, 0.7, 12, 5.0, 7.5, 0.5, 12, 3.0, 1.0, 0.0, 12, 3.0],
        "Building the 3D model"
      );

      // [state, decimation_target, texture_size] — state is filled from the session
      const out = await s.call("extract_glb", [null, DECIMATION_TARGET, TEXTURE_SIZE], "Baking textures");
      const file = out.find((o): o is FileData & { url: string } => !!o && typeof o === "object" && typeof (o as FileData).url === "string");
      if (!file) throw new Error("TRELLIS.2 returned no GLB");

      onProgress?.("Downloading model");
      const glbRes = await fetch(file.url, { signal });
      if (!glbRes.ok) throw new Error(`Could not download model (${glbRes.status})`);
      return { glb: await glbRes.arrayBuffer(), provider: `trellis:${SPACE_ID}` };
    } catch (err) {
      if (signal.aborted) throw new Error("Timed out waiting for a free GPU — try again in a few minutes");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  },
};
