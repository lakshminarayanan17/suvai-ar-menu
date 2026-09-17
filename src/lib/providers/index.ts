import { ModelProvider } from "./types";
import { trellisProvider } from "./trellis";
import { hunyuanProvider } from "./hunyuan";
import { meshyProvider } from "./meshy";

export type { GenerateOptions, GenerateResult, ModelProvider } from "./types";
export { QuotaError } from "./types";

// MODEL_PROVIDER=trellis (default, free via Hugging Face) | hunyuan (free, Spaces currently broken) | meshy (paid, needs MESHY_API_KEY)
export function getModelProvider(): ModelProvider {
  const name = (process.env.MODEL_PROVIDER ?? "trellis").toLowerCase();
  if (name === "meshy") return meshyProvider;
  if (name === "hunyuan") return hunyuanProvider;
  return trellisProvider;
}
