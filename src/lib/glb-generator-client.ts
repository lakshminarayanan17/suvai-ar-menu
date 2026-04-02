// Browser-compatible GLB generator
// Creates a realistic food dome on a plate for AR placement

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

const SEG = 64; // segments around circumference
const DOME_RINGS = 16; // latitude rings for dome

interface Mesh {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

// Flat plate disc — simple white/cream circle
function createPlateDisc(radius: number, y: number): Mesh {
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

// Plate rim — thin raised edge around the plate
function createPlateRim(innerR: number, outerR: number, height: number, yBase: number): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const yTop = yBase + height;

  // Top ring face (annular)
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    const u = i / SEG;

    // Inner edge top
    positions.push(cx * innerR, yTop, cz * innerR);
    normals.push(0, 1, 0);
    uvs.push(u, 0);

    // Outer edge top
    positions.push(cx * outerR, yTop, cz * outerR);
    normals.push(0, 1, 0);
    uvs.push(u, 1);
  }

  for (let i = 0; i < SEG; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1);
    indices.push(a + 1, a + 2, a + 3);
  }

  // Outer side wall
  const sideBase = positions.length / 3;
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const nx = Math.cos(a);
    const nz = Math.sin(a);
    const u = i / SEG;

    positions.push(nx * outerR, yTop, nz * outerR);
    normals.push(nx, 0, nz);
    uvs.push(u, 1);

    positions.push(nx * outerR, yBase, nz * outerR);
    normals.push(nx, 0, nz);
    uvs.push(u, 0);
  }
  for (let i = 0; i < SEG; i++) {
    const a = sideBase + i * 2;
    indices.push(a, a + 1, a + 2);
    indices.push(a + 2, a + 1, a + 3);
  }

  // Bottom face
  const botBase = positions.length / 3;
  positions.push(0, yBase, 0);
  normals.push(0, -1, 0);
  uvs.push(0.5, 0.5);

  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    positions.push(Math.cos(a) * outerR, yBase, Math.sin(a) * outerR);
    normals.push(0, -1, 0);
    uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
  }
  for (let i = 0; i < SEG; i++) {
    indices.push(botBase, botBase + 1 + ((i + 1) % SEG), botBase + 1 + i);
  }

  return { positions, normals, uvs, indices };
}

// Food dome — hemisphere with food image texture mapped from above
// This gives the food a 3D volume appearance
function createFoodDome(radius: number, height: number, yBase: number): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Generate dome vertices using latitude/longitude
  for (let lat = 0; lat <= DOME_RINGS; lat++) {
    const latAngle = (lat / DOME_RINGS) * (Math.PI / 2); // 0 to PI/2
    const cosLat = Math.cos(latAngle);
    const sinLat = Math.sin(latAngle);
    const y = yBase + sinLat * height;
    const ringRadius = cosLat * radius;

    for (let lon = 0; lon <= SEG; lon++) {
      const lonAngle = (lon / SEG) * Math.PI * 2;
      const x = Math.cos(lonAngle) * ringRadius;
      const z = Math.sin(lonAngle) * ringRadius;

      positions.push(x, y, z);

      // Normal: outward from ellipsoid surface
      const nx = Math.cos(lonAngle) * cosLat;
      const ny = sinLat * (radius / height);
      const nz = Math.sin(lonAngle) * cosLat;
      const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
      normals.push(nx / nLen, ny / nLen, nz / nLen);

      // UV: project from above — maps circular image onto dome
      const u = 0.5 + Math.cos(lonAngle) * cosLat * 0.5;
      const v = 0.5 + Math.sin(lonAngle) * cosLat * 0.5;
      uvs.push(u, v);
    }
  }

  // Generate indices
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

// Bottom cap for the dome (flat disc at the base of the food)
function createDomeBase(radius: number, y: number): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Center
  positions.push(0, y, 0);
  normals.push(0, -1, 0);
  uvs.push(0.5, 0.5);

  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    positions.push(Math.cos(a) * radius, y, Math.sin(a) * radius);
    normals.push(0, -1, 0);
    uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
  }

  // Wind clockwise (facing down)
  for (let i = 0; i < SEG; i++) {
    indices.push(0, 1 + ((i + 1) % SEG), 1 + i);
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
  // Realistic proportions (all y starts at 0 so model sits on surface):
  //
  // Plate disc:     r=0.13,               y=0.005     (white top surface)
  // Plate rim:      inner=0.12, outer=0.14, h=0.008, y=0  (raised edge)
  // Food dome:      r=0.10,  h=0.06,      y=0.005     (hemisphere with food texture)
  // Food base:      r=0.10,               y=0.005     (flat bottom of food)

  const plateDisc = createPlateDisc(0.13, 0.005);
  const plateRim = createPlateRim(0.12, 0.14, 0.008, 0);
  const foodDome = createFoodDome(0.10, 0.06, 0.005);
  const foodBase = createDomeBase(0.10, 0.005);

  // 4 meshes → 4 primitives → 3 materials (plate disc + rim share material)
  const meshes = [plateDisc, plateRim, foodDome, foodBase];

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
      // 0: Plate top disc — clean white ceramic
      {
        name: "PlateTop",
        pbrMetallicRoughness: {
          baseColorFactor: [0.95, 0.93, 0.90, 1.0],
          metallicFactor: 0.02,
          roughnessFactor: 0.6,
        },
      },
      // 1: Plate rim — slightly off-white with subtle gloss
      {
        name: "PlateRim",
        pbrMetallicRoughness: {
          baseColorFactor: [0.92, 0.90, 0.87, 1.0],
          metallicFactor: 0.03,
          roughnessFactor: 0.5,
        },
      },
      // 2: Food dome — TEXTURED with the dish image
      {
        name: "FoodDome",
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          metallicFactor: 0.0,
          roughnessFactor: 0.85,
        },
      },
      // 3: Food base — hidden underside, dark
      {
        name: "FoodBase",
        pbrMetallicRoughness: {
          baseColorFactor: [0.35, 0.25, 0.15, 1.0],
          metallicFactor: 0.0,
          roughnessFactor: 0.95,
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
