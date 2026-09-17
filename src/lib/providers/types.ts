import { DishPhotos } from "@/types/menu";

export interface GenerateOptions {
  photos: DishPhotos; // public image URLs
  // Wall-clock budget for queueing + inference
  timeoutMs?: number;
  onProgress?: (stage: string) => void;
  signal?: AbortSignal;
}

export interface GenerateResult {
  glb: ArrayBuffer;
  provider: string; // e.g. "hunyuan:tencent/Hunyuan3D-2"
}

export interface ModelProvider {
  name: string;
  generate(opts: GenerateOptions): Promise<GenerateResult>;
}

export class QuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaError";
  }
}
