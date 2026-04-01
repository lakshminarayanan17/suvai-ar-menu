// Browser-compatible GLB generator
// Creates a plate with food texture for model-viewer AR

export async function generatePlateGLBFromUrl(
  imageDataUrl: string
): Promise<string> {
  const base64Match = imageDataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!base64Match) throw new Error("Invalid image data URL");

  const mimeType = `image/${base64Match[1]}`;
  const raw = atob(base64Match[2]);
  const imageBytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) imageBytes[i] = raw.charCodeAt(i);

  const glbBytes = buildGLB(imageBytes, mimeType);
  const blob = new Blob([glbBytes], { type: "model/gltf-binary" });
  return URL.createObjectURL(blob);
}

// ---- Geometry helpers ----

const SEG = 64; // circle segments

interface Mesh {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

// Creates a solid cylinder with top, bottom, and sides
function createCylinder(
  radius: number,
  height: number,
  yBase: number
): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const yTop = yBase + height;

  // --- Top face ---
  const topCenterIdx = 0;
  positions.push(0, yTop, 0);
  normals.push(0, 1, 0);
  uvs.push(0.5, 0.5);

  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    positions.push(x, yTop, z);
    normals.push(0, 1, 0);
    uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
  }

  for (let i = 0; i < SEG; i++) {
    indices.push(topCenterIdx, topCenterIdx + 1 + i, topCenterIdx + 1 + ((i + 1) % SEG));
  }

  // --- Bottom face ---
  const botCenterIdx = positions.length / 3;
  positions.push(0, yBase, 0);
  normals.push(0, -1, 0);
  uvs.push(0.5, 0.5);

  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    positions.push(x, yBase, z);
    normals.push(0, -1, 0);
    uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
  }

  for (let i = 0; i < SEG; i++) {
    // Reverse winding for bottom
    indices.push(botCenterIdx, botCenterIdx + 1 + ((i + 1) % SEG), botCenterIdx + 1 + i);
  }

  // --- Side faces ---
  const sideBase = positions.length / 3;
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const x = Math.cos(a);
    const z = Math.sin(a);
    const u = i / SEG;

    // Top ring vertex
    positions.push(x * radius, yTop, z * radius);
    normals.push(x, 0, z);
    uvs.push(u, 1);

    // Bottom ring vertex
    positions.push(x * radius, yBase, z * radius);
    normals.push(x, 0, z);
    uvs.push(u, 0);
  }

  for (let i = 0; i < SEG; i++) {
    const a = sideBase + i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c);
    indices.push(c, b, d);
  }

  return { positions, normals, uvs, indices };
}

function computeBounds(positions: number[]) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let j = 0; j < 3; j++) {
      min[j] = Math.min(min[j], positions[i + j]);
      max[j] = Math.max(max[j], positions[i + j]);
    }
  }
  return { min, max };
}

// ---- GLB Builder ----

function buildGLB(imageBytes: Uint8Array, mimeType: string): ArrayBuffer {
  // Create geometry
  // Plate outer ring: 30cm diameter, 1.5cm tall
  const plateOuter = createCylinder(0.15, 0.015, 0);
  // Plate inner: 24cm diameter, sits slightly above, 0.5cm
  const plateInner = createCylinder(0.12, 0.005, 0.015);
  // Food mound: 18cm diameter, 3cm tall dome on plate
  const food = createCylinder(0.09, 0.03, 0.02);

  const meshes = [plateOuter, plateInner, food];

  // Pack all mesh data into a single binary buffer
  // Layout per mesh: positions | normals | uvs | indices (each 4-byte aligned)
  const bufferViews: { byteOffset: number; byteLength: number; target: number }[] = [];
  const accessors: Record<string, unknown>[] = [];
  let totalBinSize = 0;

  for (let m = 0; m < meshes.length; m++) {
    const mesh = meshes[m];
    const vertCount = mesh.positions.length / 3;
    const idxCount = mesh.indices.length;
    const bounds = computeBounds(mesh.positions);

    const posBytes = vertCount * 3 * 4;
    const normBytes = vertCount * 3 * 4;
    const uvBytes = vertCount * 2 * 4;
    const idxBytes = idxCount * 2;
    const idxPad = (4 - (idxBytes % 4)) % 4;

    // Positions
    bufferViews.push({ byteOffset: totalBinSize, byteLength: posBytes, target: 34962 });
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: 5126,
      count: vertCount,
      type: "VEC3",
      max: bounds.max,
      min: bounds.min,
    });
    totalBinSize += posBytes;

    // Normals
    bufferViews.push({ byteOffset: totalBinSize, byteLength: normBytes, target: 34962 });
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: 5126,
      count: vertCount,
      type: "VEC3",
    });
    totalBinSize += normBytes;

    // UVs
    bufferViews.push({ byteOffset: totalBinSize, byteLength: uvBytes, target: 34962 });
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: 5126,
      count: vertCount,
      type: "VEC2",
    });
    totalBinSize += uvBytes;

    // Indices
    bufferViews.push({ byteOffset: totalBinSize, byteLength: idxBytes + idxPad, target: 34963 });
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: 5123,
      count: idxCount,
      type: "SCALAR",
    });
    totalBinSize += idxBytes + idxPad;
  }

  // Image bufferView (no target)
  const imageViewIndex = bufferViews.length;
  bufferViews.push({ byteOffset: totalBinSize, byteLength: imageBytes.byteLength, target: 0 });
  totalBinSize += imageBytes.byteLength;

  // Pad total to 4 bytes
  const binPad = (4 - (totalBinSize % 4)) % 4;
  const paddedBinSize = totalBinSize + binPad;

  // Build glTF JSON
  const gltf = {
    asset: { version: "2.0", generator: "Suvai AR Menu" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "FoodPlate", mesh: 0 }],
    meshes: [
      {
        primitives: meshes.map((_, i) => ({
          attributes: {
            POSITION: i * 4,
            NORMAL: i * 4 + 1,
            TEXCOORD_0: i * 4 + 2,
          },
          indices: i * 4 + 3,
          material: i,
        })),
      },
    ],
    materials: [
      {
        name: "PlateOuter",
        pbrMetallicRoughness: {
          baseColorFactor: [0.76, 0.52, 0.3, 1.0],
          metallicFactor: 0.1,
          roughnessFactor: 0.6,
        },
      },
      {
        name: "PlateInner",
        pbrMetallicRoughness: {
          baseColorFactor: [0.96, 0.94, 0.90, 1.0],
          metallicFactor: 0.05,
          roughnessFactor: 0.8,
        },
      },
      {
        name: "Food",
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          metallicFactor: 0.0,
          roughnessFactor: 0.9,
        },
      },
    ],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [
      { magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 },
    ],
    images: [{ bufferView: imageViewIndex, mimeType }],
    accessors,
    bufferViews: bufferViews.map((bv) =>
      bv.target
        ? { buffer: 0, byteOffset: bv.byteOffset, byteLength: bv.byteLength, target: bv.target }
        : { buffer: 0, byteOffset: bv.byteOffset, byteLength: bv.byteLength }
    ),
    buffers: [{ byteLength: paddedBinSize }],
  };

  const gltfStr = JSON.stringify(gltf);
  const gltfBytes = new TextEncoder().encode(gltfStr);
  const gltfPad = (4 - (gltfBytes.byteLength % 4)) % 4;
  const paddedGltfLen = gltfBytes.byteLength + gltfPad;

  // Assemble GLB
  const glbSize = 12 + 8 + paddedGltfLen + 8 + paddedBinSize;
  const out = new ArrayBuffer(glbSize);
  const dv = new DataView(out);
  const u8 = new Uint8Array(out);
  let off = 0;

  // Header
  dv.setUint32(off, 0x46546c67, true); off += 4; // glTF
  dv.setUint32(off, 2, true); off += 4;           // version
  dv.setUint32(off, glbSize, true); off += 4;     // length

  // JSON chunk
  dv.setUint32(off, paddedGltfLen, true); off += 4;
  dv.setUint32(off, 0x4e4f534a, true); off += 4; // JSON
  u8.set(gltfBytes, off); off += gltfBytes.byteLength;
  for (let i = 0; i < gltfPad; i++) u8[off++] = 0x20;

  // BIN chunk header
  dv.setUint32(off, paddedBinSize, true); off += 4;
  dv.setUint32(off, 0x004e4942, true); off += 4; // BIN\0

  // Write mesh binary data
  for (const mesh of meshes) {
    // Positions
    for (const v of mesh.positions) { dv.setFloat32(off, v, true); off += 4; }
    // Normals
    for (const v of mesh.normals) { dv.setFloat32(off, v, true); off += 4; }
    // UVs
    for (const v of mesh.uvs) { dv.setFloat32(off, v, true); off += 4; }
    // Indices
    for (const idx of mesh.indices) { dv.setUint16(off, idx, true); off += 2; }
    // Pad indices to 4 bytes
    const idxPad = (4 - ((mesh.indices.length * 2) % 4)) % 4;
    for (let i = 0; i < idxPad; i++) u8[off++] = 0;
  }

  // Image data
  u8.set(imageBytes, off); off += imageBytes.byteLength;

  // Padding
  for (let i = 0; i < binPad; i++) u8[off++] = 0;

  return out;
}
