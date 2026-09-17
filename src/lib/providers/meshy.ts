// Photo → 3D via Meshy (https://docs.meshy.ai). Paid API with a free monthly
// credit allowance; used when MESHY_API_KEY is set and MODEL_PROVIDER=meshy.

import { GenerateOptions, GenerateResult, ModelProvider, QuotaError } from "./types";

const API = "https://api.meshy.ai/openapi/v1";

interface MeshyTask {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED";
  progress?: number;
  model_urls?: { glb?: string; usdz?: string };
  task_error?: { message?: string };
}

async function meshyFetch(path: string, init?: RequestInit): Promise<Response> {
  const key = process.env.MESHY_API_KEY;
  if (!key) throw new Error("MESHY_API_KEY is not set");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  });
  if (res.status === 402 || res.status === 429) {
    throw new QuotaError("Meshy credits exhausted or rate limited");
  }
  if (!res.ok) throw new Error(`Meshy ${path} failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return res;
}

export const meshyProvider: ModelProvider = {
  name: "meshy",
  async generate({ photos, timeoutMs = 270_000, onProgress, signal }: GenerateOptions): Promise<GenerateResult> {
    const views = [photos.front, photos.back, photos.left, photos.right].filter((u): u is string => !!u);
    const multi = views.length > 1;
    const endpoint = multi ? "/multi-image-to-3d" : "/image-to-3d";
    const body = multi
      ? { image_urls: views, ai_model: "latest", should_texture: true, enable_pbr: true, texture_resolution: "2k", target_formats: ["glb"] }
      : { image_url: views[0], ai_model: "latest", should_texture: true, enable_pbr: true, texture_resolution: "2k", target_formats: ["glb"], should_remesh: true, target_polycount: 60000 };

    onProgress?.("Submitting to Meshy");
    const { result: taskId } = (await (await meshyFetch(endpoint, { method: "POST", body: JSON.stringify(body), signal })).json()) as { result: string };

    const deadline = Date.now() + timeoutMs;
    let task: MeshyTask;
    for (;;) {
      if (signal?.aborted || Date.now() > deadline) throw new Error("Timed out waiting for Meshy");
      await new Promise((r) => setTimeout(r, 5000));
      task = (await (await meshyFetch(`${endpoint}/${taskId}`, { signal })).json()) as MeshyTask;
      if (task.status === "SUCCEEDED") break;
      if (task.status === "FAILED" || task.status === "CANCELED") throw new Error(task.task_error?.message || `Meshy task ${task.status.toLowerCase()}`);
      onProgress?.(task.status === "PENDING" ? "Queued at Meshy" : `Building the 3D model (${task.progress ?? 0}%)`);
    }

    const glbUrl = task.model_urls?.glb;
    if (!glbUrl) throw new Error("Meshy returned no GLB");
    onProgress?.("Downloading model");
    const res = await fetch(glbUrl, { signal });
    if (!res.ok) throw new Error(`Could not download model (${res.status})`);
    return { glb: await res.arrayBuffer(), provider: "meshy" };
  },
};
