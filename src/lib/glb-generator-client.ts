// Browser-compatible GLB generator
// Creates a plate with food texture for AR placement

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

const SEG = 64;

interface Mesh {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

// Flat disc — only top face (for textured food top)
function createDisc(radius: number, y: number): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Center vertex
  positions.push(0, y, 0);
  normals.push(0, 1, 0);
  uvs.push(0.5, 0.5);

  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    positions.push(x, y, z);
    normals.push(0, 1, 0);
    uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
  }

  for (let i = 0; i < SEG; i++) {
    indices.push(0, 1 + i, 1 + ((i + 1) % SEG));
  }

  return { positions, normals, uvs, indices };
}

// Cylinder with top, bottom, and sides — NO texture on sides
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
  const topCenter = 0;
  positions.push(0, yTop, 0);
  normals.push(0, 1, 0);
  uvs.push(0.5, 0.5);

  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    positions.push(Math.cos(a) * radius, yTop, Math.sin(a) * radius);
    normals.push(0, 1, 0);
    uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
  }
  for (let i = 0; i < SEG; i++) {
    indices.push(topCenter, topCenter + 1 + i, topCenter + 1 + ((i + 1) % SEG));
  }

  // --- Bottom face ---
  const botCenter = positions.length / 3;
  positions.push(0, yBase, 0);
  normals.push(0, -1, 0);
  uvs.push(0.5, 0.5);

  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    positions.push(Math.cos(a) * radius, yBase, Math.sin(a) * radius);
    normals.push(0, -1, 0);
    uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
  }
  for (let i = 0; i < SEG; i++) {
    indices.push(botCenter, botCenter + 1 + ((i + 1) % SEG), botCenter + 1 + i);
  }

  // --- Sides ---
  const sideBase = positions.length / 3;
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const nx = Math.cos(a);
    const nz = Math.sin(a);
    const u = i / SEG;

    positions.push(nx * radius, yTop, nz * radius);
    normals.push(nx, 0, nz);
    uvs.push(u, 1);

    positions.push(nx * radius, yBase, nz * radius);
    normals.push(nx, 0, nz);
    uvs.push(u, 0);
  }
  for (let i = 0; i < SEG; i++) {
    const a = sideBase + i * 2;
    indices.push(a, a + 1, a + 2);
    indices.push(a + 2, a + 1, a + 3);
  }

  return { positions, normals, uvs, indices };
}

// Thin rim (side wall only) — for food edge
function createRim(
  radius: number,
  height: number,
  yBase: number
): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const yTop = yBase + height;

  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const nx = Math.cos(a);
    const nz = Math.sin(a);
    const u = i / SEG;

    positions.push(nx * radius, yTop, nz * radius);
    normals.push(nx, 0, nz);
    uvs.push(u, 1);

    positions.push(nx * radius, yBase, nz * radius);
    normals.push(nx, 0, nz);
    uvs.push(u, 0);
  }
  for (let i = 0; i < SEG; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2);
    indices.push(a + 2, a + 1, a + 3);
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
  // All geometry starts at y=0 (bottom of plate sits on surface)
  //
  // Plate outer ring:  r=0.15, h=0.012, y=0       (terracotta)
  // Plate inner disc:  r=0.12, h=0.004, y=0.012    (cream/white)
  // Food edge rim:     r=0.09, h=0.008, y=0.016    (dark brown — sides only)
  // Food top disc:     r=0.09, y=0.024              (textured — top only)

  const plateOuter = createCylinder(0.15, 0.012, 0);
  const plateInner = createCylinder(0.12, 0.004, 0.012);
  const foodRim = createRim(0.09, 0.008, 0.016);
  const foodTop = createDisc(0.09, 0.024);

  // 4 meshes → 4 primitives → 4 materials
  const meshes = [plateOuter, plateInner, foodRim, foodTop];

  const bufferViews: { byteOffset: number; byteLength: number; target: number }[] = [];
  const accessors: Record<string, unknown>[] = [];
  let totalBinSize = 0;

  for (const mesh of meshes) {
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
      componentType: 5126, count: vertCount, type: "VEC3",
      max: bounds.max, min: bounds.min,
    });
    totalBinSize += posBytes;

    // Normals
    bufferViews.push({ byteOffset: totalBinSize, byteLength: normBytes, target: 34962 });
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: 5126, count: vertCount, type: "VEC3",
    });
    totalBinSize += normBytes;

    // UVs
    bufferViews.push({ byteOffset: totalBinSize, byteLength: uvBytes, target: 34962 });
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: 5126, count: vertCount, type: "VEC2",
    });
    totalBinSize += uvBytes;

    // Indices
    bufferViews.push({ byteOffset: totalBinSize, byteLength: idxBytes + idxPad, target: 34963 });
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: 5123, count: idxCount, type: "SCALAR",
    });
    totalBinSize += idxBytes + idxPad;
  }

  // Image bufferView
  const imageViewIndex = bufferViews.length;
  bufferViews.push({ byteOffset: totalBinSize, byteLength: imageBytes.byteLength, target: 0 });
  totalBinSize += imageBytes.byteLength;

  const binPad = (4 - (totalBinSize % 4)) % 4;
  const paddedBinSize = totalBinSize + binPad;

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
      // 0: Plate outer — terracotta
      {
        name: "PlateOuter",
        pbrMetallicRoughness: {
          baseColorFactor: [0.72, 0.48, 0.28, 1.0],
          metallicFactor: 0.05,
          roughnessFactor: 0.7,
        },
      },
      // 1: Plate inner — cream white
      {
        name: "PlateInner",
        pbrMetallicRoughness: {
          baseColorFactor: [0.95, 0.93, 0.89, 1.0],
          metallicFactor: 0.02,
          roughnessFactor: 0.85,
        },
      },
      // 2: Food rim/edge — dark brown (no texture!)
      {
        name: "FoodEdge",
        pbrMetallicRoughness: {
          baseColorFactor: [0.45, 0.30, 0.15, 1.0],
          metallicFactor: 0.0,
          roughnessFactor: 0.95,
        },
      },
      // 3: Food top — TEXTURED with the dish image
      {
        name: "FoodTop",
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

  const glbSize = 12 + 8 + paddedGltfLen + 8 + paddedBinSize;
  const out = new ArrayBuffer(glbSize);
  const dv = new DataView(out);
  const u8 = new Uint8Array(out);
  let off = 0;

  // Header
  dv.setUint32(off, 0x46546c67, true); off += 4;
  dv.setUint32(off, 2, true); off += 4;
  dv.setUint32(off, glbSize, true); off += 4;

  // JSON chunk
  dv.setUint32(off, paddedGltfLen, true); off += 4;
  dv.setUint32(off, 0x4e4f534a, true); off += 4;
  u8.set(gltfBytes, off); off += gltfBytes.byteLength;
  for (let i = 0; i < gltfPad; i++) u8[off++] = 0x20;

  // BIN chunk
  dv.setUint32(off, paddedBinSize, true); off += 4;
  dv.setUint32(off, 0x004e4942, true); off += 4;

  // Write mesh data
  for (const mesh of meshes) {
    for (const v of mesh.positions) { dv.setFloat32(off, v, true); off += 4; }
    for (const v of mesh.normals) { dv.setFloat32(off, v, true); off += 4; }
    for (const v of mesh.uvs) { dv.setFloat32(off, v, true); off += 4; }
    for (const idx of mesh.indices) { dv.setUint16(off, idx, true); off += 2; }
    const idxPad = (4 - ((mesh.indices.length * 2) % 4)) % 4;
    for (let i = 0; i < idxPad; i++) u8[off++] = 0;
  }

  // Image data
  u8.set(imageBytes, off); off += imageBytes.byteLength;
  for (let i = 0; i < binPad; i++) u8[off++] = 0;

  return out;
}
