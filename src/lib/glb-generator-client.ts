// Browser-compatible GLB generator
// Creates a high-quality clean plate with food dome for AR

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
const DOME_RINGS = 24;

interface Mesh {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

// ---- Geometry Builders ----

// Clean flat disc
function createDisc(radius: number, y: number, faceUp: boolean): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const ny = faceUp ? 1 : -1;

  positions.push(0, y, 0);
  normals.push(0, ny, 0);
  uvs.push(0.5, 0.5);

  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    positions.push(Math.cos(a) * radius, y, Math.sin(a) * radius);
    normals.push(0, ny, 0);
    uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
  }

  for (let i = 0; i < SEG; i++) {
    if (faceUp) {
      indices.push(0, 1 + i, 1 + ((i + 1) % SEG));
    } else {
      indices.push(0, 1 + ((i + 1) % SEG), 1 + i);
    }
  }

  return { positions, normals, uvs, indices };
}

// Ring (annular shape) — for plate rim band
function createRing(innerR: number, outerR: number, y: number, faceUp: boolean): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const ny = faceUp ? 1 : -1;

  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const cx = Math.cos(a), cz = Math.sin(a);
    const u = i / SEG;

    positions.push(cx * innerR, y, cz * innerR);
    normals.push(0, ny, 0);
    uvs.push(u, 0);

    positions.push(cx * outerR, y, cz * outerR);
    normals.push(0, ny, 0);
    uvs.push(u, 1);
  }

  for (let i = 0; i < SEG; i++) {
    const a = i * 2;
    if (faceUp) {
      indices.push(a, a + 2, a + 1);
      indices.push(a + 1, a + 2, a + 3);
    } else {
      indices.push(a, a + 1, a + 2);
      indices.push(a + 2, a + 1, a + 3);
    }
  }

  return { positions, normals, uvs, indices };
}

// Cylinder wall (side of plate)
function createCylinderWall(radius: number, yBottom: number, yTop: number): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const nx = Math.cos(a), nz = Math.sin(a);
    const u = i / SEG;

    positions.push(nx * radius, yTop, nz * radius);
    normals.push(nx, 0, nz);
    uvs.push(u, 1);

    positions.push(nx * radius, yBottom, nz * radius);
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

// Food dome — hemisphere with food image projected from above
function createFoodDome(radius: number, height: number, yBase: number): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let lat = 0; lat <= DOME_RINGS; lat++) {
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

      const nx = Math.cos(lonAngle) * cosLat;
      const ny = sinLat * (radius / Math.max(height, 0.001));
      const nz = Math.sin(lonAngle) * cosLat;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      normals.push(nx / len, ny / len, nz / len);

      // Project food image from above
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
  // High-quality plate proportions:
  //
  // Plate: 28cm diameter (r=0.14), 5mm thick
  //   - White ceramic top surface (inner disc r=0.12)
  //   - Blue accent rim band (ring r=0.12 to r=0.14)
  //   - Outer wall (cylinder r=0.14, 5mm)
  //   - Bottom disc
  //
  // Food dome: 20cm diameter (r=0.10), 3.5cm tall
  //   - Sits on plate surface at y=0.005

  const PLATE_R = 0.14;
  const INNER_R = 0.12;
  const PLATE_H = 0.005;
  const FOOD_R = 0.10;
  const FOOD_H = 0.035;

  // Meshes: [plateTop, rimBand, plateWall, plateBottom, foodDome]
  const plateTop = createDisc(INNER_R, PLATE_H, true);           // 0: white inner
  const rimBand = createRing(INNER_R, PLATE_R, PLATE_H, true);   // 1: blue accent rim
  const plateWall = createCylinderWall(PLATE_R, 0, PLATE_H);     // 2: white side
  const plateBottom = createDisc(PLATE_R, 0, false);              // 3: white bottom
  const foodDome = createFoodDome(FOOD_R, FOOD_H, PLATE_H);      // 4: food texture

  const meshes = [plateTop, rimBand, plateWall, plateBottom, foodDome];

  // Materials:
  // 0 = white ceramic (plateTop, plateWall, plateBottom)
  // 1 = blue accent rim
  // 2 = food texture
  const materialMap = [0, 1, 0, 0, 2]; // mesh index → material index

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
      primitives: meshes.map((_, i) => ({
        attributes: {
          POSITION: i * 4,
          NORMAL: i * 4 + 1,
          TEXCOORD_0: i * 4 + 2,
        },
        indices: i * 4 + 3,
        material: materialMap[i],
      })),
    }],
    materials: [
      // 0: White ceramic — clean, glossy porcelain
      {
        name: "Ceramic",
        pbrMetallicRoughness: {
          baseColorFactor: [0.97, 0.96, 0.94, 1.0],
          metallicFactor: 0.03,
          roughnessFactor: 0.35,
        },
      },
      // 1: Blue accent rim — rich blue like reference plate
      {
        name: "RimAccent",
        pbrMetallicRoughness: {
          baseColorFactor: [0.22, 0.42, 0.72, 1.0],
          metallicFactor: 0.02,
          roughnessFactor: 0.4,
        },
      },
      // 2: Food — textured with dish image
      {
        name: "Food",
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          metallicFactor: 0.0,
          roughnessFactor: 0.75,
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
