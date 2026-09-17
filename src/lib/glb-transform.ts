// Minimal GLB (binary glTF 2.0) editor: rescales and re-centers a model without
// decoding geometry. Generators output meshes in arbitrary units centred at the
// origin; AR needs real-world metres with the base sitting on the surface.

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

interface GltfNode {
  mesh?: number;
  children?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  matrix?: number[];
  name?: string;
}

interface GltfDoc {
  asset: { version: string; generator?: string };
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: GltfNode[];
  meshes?: { primitives: { attributes: Record<string, number> }[] }[];
  accessors?: { min?: number[]; max?: number[] }[];
  [k: string]: unknown;
}

function parseGlb(buf: ArrayBuffer): { json: GltfDoc; bin: Uint8Array | null } {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== GLB_MAGIC) throw new Error("Not a GLB file");
  const totalLength = dv.getUint32(8, true);
  let offset = 12;
  let json: GltfDoc | null = null;
  let bin: Uint8Array | null = null;
  while (offset < totalLength) {
    const chunkLength = dv.getUint32(offset, true);
    const chunkType = dv.getUint32(offset + 4, true);
    const chunk = new Uint8Array(buf, offset + 8, chunkLength);
    if (chunkType === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(chunk));
    else if (chunkType === CHUNK_BIN) bin = chunk;
    offset += 8 + chunkLength;
  }
  if (!json) throw new Error("GLB has no JSON chunk");
  return { json, bin };
}

function serializeGlb(json: GltfDoc, bin: Uint8Array | null): ArrayBuffer {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const binPad = bin ? (4 - (bin.length % 4)) % 4 : 0;
  const total = 12 + 8 + jsonBytes.length + jsonPad + (bin ? 8 + bin.length + binPad : 0);
  const out = new ArrayBuffer(total);
  const dv = new DataView(out);
  const u8 = new Uint8Array(out);
  dv.setUint32(0, GLB_MAGIC, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  let o = 12;
  dv.setUint32(o, jsonBytes.length + jsonPad, true);
  dv.setUint32(o + 4, CHUNK_JSON, true);
  u8.set(jsonBytes, o + 8);
  u8.fill(0x20, o + 8 + jsonBytes.length, o + 8 + jsonBytes.length + jsonPad);
  o += 8 + jsonBytes.length + jsonPad;
  if (bin) {
    dv.setUint32(o, bin.length + binPad, true);
    dv.setUint32(o + 4, CHUNK_BIN, true);
    u8.set(bin, o + 8);
  }
  return out;
}

// World-space AABB of the default scene, walking node transforms (TRS only —
// generators don't emit `matrix`, but we handle it defensively as identity).
function sceneBounds(json: GltfDoc): { min: number[]; max: number[] } | null {
  const nodes = json.nodes ?? [];
  const meshes = json.meshes ?? [];
  const accessors = json.accessors ?? [];
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? nodes.map((_, i) => i);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  const visit = (idx: number, parentScale: number[], parentTrans: number[]) => {
    const n = nodes[idx];
    if (!n) return;
    const s = n.scale ?? [1, 1, 1];
    const t = n.translation ?? [0, 0, 0];
    const scale = [parentScale[0] * s[0], parentScale[1] * s[1], parentScale[2] * s[2]];
    const trans = [
      parentTrans[0] + parentScale[0] * t[0],
      parentTrans[1] + parentScale[1] * t[1],
      parentTrans[2] + parentScale[2] * t[2],
    ];
    if (n.mesh != null) {
      for (const prim of meshes[n.mesh]?.primitives ?? []) {
        const acc = accessors[prim.attributes.POSITION];
        if (!acc?.min || !acc?.max) continue;
        for (let a = 0; a < 3; a++) {
          const lo = acc.min[a] * scale[a] + trans[a];
          const hi = acc.max[a] * scale[a] + trans[a];
          min[a] = Math.min(min[a], lo, hi);
          max[a] = Math.max(max[a], lo, hi);
        }
      }
    }
    for (const c of n.children ?? []) visit(c, scale, trans);
  };
  for (const r of roots) visit(r, [1, 1, 1], [0, 0, 0]);
  return Number.isFinite(min[0]) ? { min, max } : null;
}

/**
 * Rescales the model so its largest horizontal extent equals `targetWidthMetres`,
 * centres it on X/Z and drops its lowest point to Y=0. Done by wrapping the
 * scene in a single new root node, so the original hierarchy is untouched.
 */
export function normalizeGlbForAR(input: ArrayBuffer, targetWidthMetres = 0.28): ArrayBuffer {
  const { json, bin } = parseGlb(input);
  const bounds = sceneBounds(json);
  if (!bounds) return input;

  const size = bounds.max.map((v, i) => v - bounds.min[i]);
  const footprint = Math.max(size[0], size[2], 1e-6);
  const s = targetWidthMetres / footprint;
  const cx = (bounds.min[0] + bounds.max[0]) / 2;
  const cz = (bounds.min[2] + bounds.max[2]) / 2;

  json.nodes = json.nodes ?? [];
  json.scenes = json.scenes?.length ? json.scenes : [{ nodes: json.nodes.map((_, i) => i) }];
  const sceneIdx = json.scene ?? 0;
  const oldRoots = json.scenes[sceneIdx].nodes ?? [];
  const rootIdx = json.nodes.length;
  json.nodes.push({
    name: "SuvaiARRoot",
    children: oldRoots,
    scale: [s, s, s],
    translation: [-cx * s, -bounds.min[1] * s, -cz * s],
  });
  json.scenes[sceneIdx].nodes = [rootIdx];
  json.asset.generator = `${json.asset.generator ?? "unknown"} + suvai-normalize`;
  return serializeGlb(json, bin);
}

export function glbStats(input: ArrayBuffer): { bytes: number; bounds: { min: number[]; max: number[] } | null } {
  const { json } = parseGlb(input);
  return { bytes: input.byteLength, bounds: sceneBounds(json) };
}
