// Browser-compatible GLB generator
// Creates a food-first 3D model: large food dome on a subtle plate

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

const SEG = 32;
const DOME_RINGS = 12;

interface Mesh {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

// ---- Geometry Builders ----

// Thin subtle plate — just a flat disc with a slight rim
function createPlate(radius: number, rimWidth: number, thickness: number): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const outerR = radius + rimWidth;

  // Top face — full circle
  positions.push(0, thickness, 0);
  normals.push(0, 1, 0);
  uvs.push(0.5, 0.5);
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    positions.push(Math.cos(a) * outerR, thickness, Math.sin(a) * outerR);
    normals.push(0, 1, 0);
    uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
  }
  for (let i = 0; i < SEG; i++) {
    indices.push(0, 1 + i, 1 + ((i + 1) % SEG));
  }

  // Outer edge (side wall)
  const sideBase = positions.length / 3;
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const nx = Math.cos(a), nz = Math.sin(a);
    positions.push(nx * outerR, thickness, nz * outerR);
    normals.push(nx, 0, nz);
    uvs.push(i / SEG, 1);
    positions.push(nx * outerR, 0, nz * outerR);
    normals.push(nx, 0, nz);
    uvs.push(i / SEG, 0);
  }
  for (let i = 0; i < SEG; i++) {
    const a = sideBase + i * 2;
    indices.push(a, a + 1, a + 2);
    indices.push(a + 2, a + 1, a + 3);
  }

  // Bottom face
  const botBase = positions.length / 3;
  positions.push(0, 0, 0);
  normals.push(0, -1, 0);
  uvs.push(0.5, 0.5);
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    positions.push(Math.cos(a) * outerR, 0, Math.sin(a) * outerR);
    normals.push(0, -1, 0);
    uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
  }
  for (let i = 0; i < SEG; i++) {
    indices.push(botBase, botBase + 1 + ((i + 1) % SEG), botBase + 1 + i);
  }

  return { positions, normals, uvs, indices };
}

// Food dome — the main visual. Gentle hemisphere with food image on top.
function createFoodDome(radius: number, height: number, yBase: number): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let lat = 0; lat <= DOME_RINGS; lat++) {
    // Use a power curve for a gentler, more natural dome profile
    const t = lat / DOME_RINGS;
    const latAngle = t * (Math.PI / 2);
    const cosLat = Math.cos(latAngle);
    const sinLat = Math.sin(latAngle);
    const y = yBase + sinLat * height;
    const ringR = cosLat * radius;

    for (let lon = 0; lon <= SEG; lon++) {
      const lonAngle = (lon / SEG) * Math.PI * 2;
      const x = Math.cos(lonAngle) * ringR;
      const z = Math.sin(lonAngle) * ringR;
      positions.push(x, y, z);

      // Normal
      const nx = Math.cos(lonAngle) * cosLat;
      const ny = sinLat * (radius / height);
      const nz = Math.sin(lonAngle) * cosLat;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      normals.push(nx / len, ny / len, nz / len);

      // UV: project food image from above onto dome
      const u = 0.5 + Math.cos(lonAngle) * cosLat * 0.5;
      const v = 0.5 + Math.sin(lonAngle) * cosLat * 0.5;
      uvs.push(u, v);
    }
  }

  for (let lat = 0; lat < DOME_RINGS; lat++) {
    for (let lon = 0; lon < SEG; lon++) {
      const a = lat * (SEG + 1) + lon;
      const b = a + SEG + 1;
      indices.push(a, b, a + 1);
      indices.push(a + 1, b, b + 1);
    }
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
  // Food-first proportions:
  // Food dome: r=0.12m (24cm diameter), h=0.04m (4cm tall) — THE STAR
  // Plate:     r=0.13m + 0.01m rim, 0.004m thick — subtle background

  const plate = createPlate(0.13, 0.01, 0.004);
  const foodDome = createFoodDome(0.12, 0.04, 0.004);

  const meshes = [plate, foodDome];

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

    bufferViews.push({ byteOffset: totalBinSize, byteLength: posBytes, target: 34962 });
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: 5126, count: vertCount, type: "VEC3",
      max: bounds.max, min: bounds.min,
    });
    totalBinSize += posBytes;

    bufferViews.push({ byteOffset: totalBinSize, byteLength: normBytes, target: 34962 });
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: 5126, count: vertCount, type: "VEC3",
    });
    totalBinSize += normBytes;

    bufferViews.push({ byteOffset: totalBinSize, byteLength: uvBytes, target: 34962 });
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: 5126, count: vertCount, type: "VEC2",
    });
    totalBinSize += uvBytes;

    bufferViews.push({ byteOffset: totalBinSize, byteLength: idxBytes + idxPad, target: 34963 });
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: 5123, count: idxCount, type: "SCALAR",
    });
    totalBinSize += idxBytes + idxPad;
  }

  // Image
  const imageViewIdx = bufferViews.length;
  bufferViews.push({ byteOffset: totalBinSize, byteLength: imageBytes.byteLength, target: 0 });
  totalBinSize += imageBytes.byteLength;

  const binPad = (4 - (totalBinSize % 4)) % 4;
  const paddedBinSize = totalBinSize + binPad;

  const gltf = {
    asset: { version: "2.0", generator: "Suvai AR Menu" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "FoodPlate", mesh: 0 }],
    meshes: [{
      primitives: [
        {
          attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
          indices: 3,
          material: 0,
        },
        {
          attributes: { POSITION: 4, NORMAL: 5, TEXCOORD_0: 6 },
          indices: 7,
          material: 1,
        },
      ],
    }],
    materials: [
      // Plate — subtle white ceramic
      {
        name: "Plate",
        pbrMetallicRoughness: {
          baseColorFactor: [0.94, 0.92, 0.89, 1.0],
          metallicFactor: 0.02,
          roughnessFactor: 0.55,
        },
      },
      // Food — textured with dish image, no metallic, slightly rough
      {
        name: "Food",
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          metallicFactor: 0.0,
          roughnessFactor: 0.5,
        },
        doubleSided: true,
      },
    ],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
    images: [{ bufferView: imageViewIdx, mimeType }],
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

  // GLB header
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

  for (const mesh of meshes) {
    for (const v of mesh.positions) { dv.setFloat32(off, v, true); off += 4; }
    for (const v of mesh.normals) { dv.setFloat32(off, v, true); off += 4; }
    for (const v of mesh.uvs) { dv.setFloat32(off, v, true); off += 4; }
    for (const idx of mesh.indices) { dv.setUint16(off, idx, true); off += 2; }
    const idxPad = (4 - ((mesh.indices.length * 2) % 4)) % 4;
    for (let i = 0; i < idxPad; i++) u8[off++] = 0;
  }

  u8.set(imageBytes, off); off += imageBytes.byteLength;
  for (let i = 0; i < binPad; i++) u8[off++] = 0;

  return out;
}
