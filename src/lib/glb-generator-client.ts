// Browser-compatible GLB generator
// Creates a realistic food-on-plate model:
// - Plate: clean concentric ring design (black rim, orange/white bands)
// - Food: 3D mound sitting in center with clear plate gap around it

const SEG = 48;
const FOOD_RINGS = 16;

interface Mesh {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

// ---- Image Utilities ----

// Resize food image and crop to circle (avoids background bleed at edges)
function prepareFoodImage(dataUrl: string, maxSize: number): Promise<{ bytes: Uint8Array; mime: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let w = img.width, h = img.height;
      if (w > maxSize || h > maxSize) {
        if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
        else { w = Math.round(w * maxSize / h); h = maxSize; }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;

      // Draw image
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error("Canvas toBlob failed"));
        blob.arrayBuffer().then((buf) => {
          resolve({ bytes: new Uint8Array(buf), mime: "image/jpeg" });
        });
      }, "image/jpeg", 0.92);
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = dataUrl;
  });
}

// Generate plate texture with concentric rings matching reference design
function generatePlateTexture(): Uint8Array {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const cx = size / 2, cy = size / 2;

  // Transparent background (won't be seen — plate mesh covers it)
  ctx.clearRect(0, 0, size, size);

  // Draw concentric rings from outside in
  const rings: [number, string][] = [
    [0.500, "#1C1C1C"],   // Black outer rim
    [0.480, "#2A2A2A"],   // Dark rim inner edge
    [0.465, "#F2EDE4"],   // Cream/white band
    [0.415, "#D48B5E"],   // Orange band (outer)
    [0.385, "#F2EDE4"],   // Cream/white band
    [0.340, "#D48B5E"],   // Orange band (inner)
    [0.310, "#F2EDE4"],   // Cream/white center area
  ];

  for (const [radiusFraction, color] of rings) {
    ctx.beginPath();
    ctx.arc(cx, cy, size * radiusFraction, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Convert to JPEG bytes synchronously
  const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
  const base64 = dataUrl.split(",")[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// ---- Geometry Builders ----

// Plate — flat disc with concentric ring texture
function createPlate(radius: number, thickness: number): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Top face — full circle with rings (more segments for smoother rings)
  const PLATE_RINGS = 12;
  // Center vertex
  positions.push(0, thickness, 0);
  normals.push(0, 1, 0);
  uvs.push(0.5, 0.5);

  for (let ring = 1; ring <= PLATE_RINGS; ring++) {
    const t = ring / PLATE_RINGS;
    const r = t * radius;
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      positions.push(Math.cos(a) * r, thickness, Math.sin(a) * r);
      normals.push(0, 1, 0);
      uvs.push(0.5 + Math.cos(a) * t * 0.5, 0.5 + Math.sin(a) * t * 0.5);
    }
  }

  // Center to first ring
  for (let i = 0; i < SEG; i++) {
    indices.push(0, 1 + i, 1 + i + 1);
  }
  // Between rings
  for (let ring = 0; ring < PLATE_RINGS - 1; ring++) {
    const start = 1 + ring * (SEG + 1);
    const next = start + (SEG + 1);
    for (let i = 0; i < SEG; i++) {
      indices.push(start + i, next + i, start + i + 1);
      indices.push(start + i + 1, next + i, next + i + 1);
    }
  }

  // Side wall
  const sideBase = positions.length / 3;
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const nx = Math.cos(a), nz = Math.sin(a);
    positions.push(nx * radius, thickness, nz * radius);
    normals.push(nx, 0, nz);
    uvs.push(i / SEG, 1);
    positions.push(nx * radius, 0, nz * radius);
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
    positions.push(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    normals.push(0, -1, 0);
    uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
  }
  for (let i = 0; i < SEG; i++) {
    indices.push(botBase, botBase + 1 + ((i + 1) % SEG), botBase + 1 + i);
  }

  return { positions, normals, uvs, indices };
}

// Food mound — natural 3D volume, smaller than plate for visible gap
function createFoodMound(radius: number, height: number, yBase: number): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Top surface (bell-curve mound)
  positions.push(0, yBase + height, 0);
  normals.push(0, 1, 0);
  uvs.push(0.5, 0.5);

  for (let ring = 1; ring <= FOOD_RINGS; ring++) {
    const t = ring / FOOD_RINGS;
    const ringR = t * radius;
    // Bell curve profile: natural food-pile shape
    const profile = Math.cos(t * Math.PI * 0.5);
    const y = yBase + height * profile * profile;

    for (let lon = 0; lon <= SEG; lon++) {
      const lonAngle = (lon / SEG) * Math.PI * 2;
      const cx = Math.cos(lonAngle);
      const sz = Math.sin(lonAngle);
      positions.push(cx * ringR, y, sz * ringR);

      // Normal from bell curve slope
      const dydR = -height * 2 * profile * Math.sin(t * Math.PI * 0.5) * (Math.PI * 0.5) / radius;
      const nx = cx * (-dydR);
      const ny = 1.0;
      const nz = sz * (-dydR);
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      normals.push(nx / len, ny / len, nz / len);

      // UV: use inner 85% of image to avoid edge background bleed
      const uvScale = 0.42;
      const u = 0.5 + (cx * t) * uvScale;
      const v = 0.5 + (sz * t) * uvScale;
      uvs.push(u, v);
    }
  }

  // Top triangles: center to first ring
  for (let lon = 0; lon < SEG; lon++) {
    indices.push(0, 1 + lon, 1 + lon + 1);
  }
  // Top triangles: between rings
  for (let ring = 0; ring < FOOD_RINGS - 1; ring++) {
    const ringStart = 1 + ring * (SEG + 1);
    const nextRingStart = ringStart + (SEG + 1);
    for (let lon = 0; lon < SEG; lon++) {
      const a = ringStart + lon;
      const b = nextRingStart + lon;
      indices.push(a, b, a + 1);
      indices.push(a + 1, b, b + 1);
    }
  }

  // Side wall (gives thickness to the food edge)
  const sideBase = positions.length / 3;
  for (let lon = 0; lon <= SEG; lon++) {
    const lonAngle = (lon / SEG) * Math.PI * 2;
    const cx = Math.cos(lonAngle);
    const sz = Math.sin(lonAngle);
    // Top of side (outermost ring y = yBase since profile=0 at t=1)
    positions.push(cx * radius, yBase + 0.002, sz * radius);
    normals.push(cx, 0, sz);
    uvs.push(lon / SEG, 1);
    // Bottom of side
    positions.push(cx * radius, yBase, sz * radius);
    normals.push(cx, 0, sz);
    uvs.push(lon / SEG, 0);
  }
  for (let lon = 0; lon < SEG; lon++) {
    const a = sideBase + lon * 2;
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

// ---- Main Export ----

export async function generatePlateGLBFromUrl(imageDataUrl: string): Promise<string> {
  const { bytes: foodImageBytes } = await prepareFoodImage(imageDataUrl, 1024);
  const plateImageBytes = generatePlateTexture();

  const glbBytes = buildGLB(foodImageBytes, plateImageBytes);
  const blob = new Blob([glbBytes], { type: "model/gltf-binary" });
  return URL.createObjectURL(blob);
}

// ---- GLB Builder ----

function buildGLB(foodImageBytes: Uint8Array, plateImageBytes: Uint8Array): ArrayBuffer {
  // Proportions:
  // Plate:      r=0.14m (28cm diameter), 0.004m thick — clean ring design
  // Food mound: r=0.08m (16cm diameter), h=0.03m (3cm) — natural 3D pile
  // Gap:        6cm visible plate around food on all sides

  const plate = createPlate(0.14, 0.004);
  const foodMound = createFoodMound(0.08, 0.03, 0.004);

  const meshes = [plate, foodMound];

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

  // Plate image (texture 0)
  const plateImageViewIdx = bufferViews.length;
  const platePad = (4 - (plateImageBytes.byteLength % 4)) % 4;
  bufferViews.push({ byteOffset: totalBinSize, byteLength: plateImageBytes.byteLength, target: 0 });
  totalBinSize += plateImageBytes.byteLength + platePad;

  // Food image (texture 1)
  const foodImageViewIdx = bufferViews.length;
  bufferViews.push({ byteOffset: totalBinSize, byteLength: foodImageBytes.byteLength, target: 0 });
  totalBinSize += foodImageBytes.byteLength;

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
      // Plate — textured with concentric ring design
      {
        name: "Plate",
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          metallicFactor: 0.02,
          roughnessFactor: 0.4,
        },
      },
      // Food — textured with dish image
      {
        name: "Food",
        pbrMetallicRoughness: {
          baseColorTexture: { index: 1 },
          metallicFactor: 0.0,
          roughnessFactor: 0.75,
        },
        doubleSided: true,
      },
    ],
    textures: [
      { source: 0, sampler: 0 },
      { source: 1, sampler: 0 },
    ],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
    images: [
      { bufferView: plateImageViewIdx, mimeType: "image/jpeg" },
      { bufferView: foodImageViewIdx, mimeType: "image/jpeg" },
    ],
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

  // Mesh data
  for (const mesh of meshes) {
    for (const v of mesh.positions) { dv.setFloat32(off, v, true); off += 4; }
    for (const v of mesh.normals) { dv.setFloat32(off, v, true); off += 4; }
    for (const v of mesh.uvs) { dv.setFloat32(off, v, true); off += 4; }
    for (const idx of mesh.indices) { dv.setUint16(off, idx, true); off += 2; }
    const idxPad = (4 - ((mesh.indices.length * 2) % 4)) % 4;
    for (let i = 0; i < idxPad; i++) u8[off++] = 0;
  }

  // Plate image
  u8.set(plateImageBytes, off); off += plateImageBytes.byteLength;
  for (let i = 0; i < platePad; i++) u8[off++] = 0;

  // Food image
  u8.set(foodImageBytes, off); off += foodImageBytes.byteLength;
  for (let i = 0; i < binPad; i++) u8[off++] = 0;

  return out;
}
