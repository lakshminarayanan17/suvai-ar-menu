// Browser-compatible GLB generator
// Creates a food-first 3D model: natural food mound on a subtle plate

// Resize image to max 512x512 for fast GLB generation
function resizeImage(dataUrl: string, maxSize: number): Promise<{ bytes: Uint8Array; mime: string }> {
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

export async function generatePlateGLBFromUrl(
  imageDataUrl: string
): Promise<string> {
  // Resize to 1024px max for sharp food texture
  const { bytes: imageBytes, mime: mimeType } = await resizeImage(imageDataUrl, 1024);

  const glbBytes = buildGLB(imageBytes, mimeType);
  const blob = new Blob([glbBytes], { type: "model/gltf-binary" });
  return URL.createObjectURL(blob);
}

const SEG = 32;
const FOOD_RINGS = 16;

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

// Food mound — natural 3D volume like real food on a plate.
// Uses a smooth bell-curve profile: full height at center, tapering to plate level at edges.
// Side wall gives thickness so it doesn't look paper-thin from any angle.
function createFoodSurface(radius: number, height: number, yBase: number): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // --- Top surface (bell-curve mound) ---
  // Center vertex
  positions.push(0, yBase + height, 0);
  normals.push(0, 1, 0);
  uvs.push(0.5, 0.5);

  for (let ring = 1; ring <= FOOD_RINGS; ring++) {
    const t = ring / FOOD_RINGS; // 0 at center, 1 at edge
    const ringR = t * radius;
    // Smooth bell curve: keeps height in the center, drops smoothly at edges
    // Using cosine falloff for a natural food-mound shape
    const profile = Math.cos(t * Math.PI * 0.5); // 1 at center, 0 at edge
    const y = yBase + height * profile * profile; // squared for gentler slope

    for (let lon = 0; lon <= SEG; lon++) {
      const lonAngle = (lon / SEG) * Math.PI * 2;
      const cx = Math.cos(lonAngle);
      const sz = Math.sin(lonAngle);
      positions.push(cx * ringR, y, sz * ringR);

      // Compute proper normal from the slope of the bell curve
      const dydR = -height * 2 * profile * Math.sin(t * Math.PI * 0.5) * (Math.PI * 0.5) / radius;
      const nx = cx * (-dydR);
      const ny = 1.0;
      const nz = sz * (-dydR);
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      normals.push(nx / len, ny / len, nz / len);

      // UV: project from above
      const u = 0.5 + (cx * t) * 0.5;
      const v = 0.5 + (sz * t) * 0.5;
      uvs.push(u, v);
    }
  }

  // Top surface triangles: center to first ring
  for (let lon = 0; lon < SEG; lon++) {
    indices.push(0, 1 + lon, 1 + lon + 1);
  }
  // Top surface triangles: between rings
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

  // --- Side wall (thin edge around the food) ---
  const sideBase = positions.length / 3;
  for (let lon = 0; lon <= SEG; lon++) {
    const lonAngle = (lon / SEG) * Math.PI * 2;
    const cx = Math.cos(lonAngle);
    const sz = Math.sin(lonAngle);
    // Top edge of side wall (matches outermost ring of top surface = yBase)
    positions.push(cx * radius, yBase, sz * radius);
    normals.push(cx, 0, sz);
    uvs.push(lon / SEG, 1);
    // Bottom edge of side wall (plate level)
    positions.push(cx * radius, yBase, sz * radius);
    normals.push(cx, 0, sz);
    uvs.push(lon / SEG, 0);
  }

  // --- Bottom face (flat disc underneath) ---
  const botBase = positions.length / 3;
  positions.push(0, yBase, 0);
  normals.push(0, -1, 0);
  uvs.push(0.5, 0.5);
  for (let lon = 0; lon < SEG; lon++) {
    const lonAngle = (lon / SEG) * Math.PI * 2;
    positions.push(Math.cos(lonAngle) * radius, yBase, Math.sin(lonAngle) * radius);
    normals.push(0, -1, 0);
    uvs.push(0.5 + Math.cos(lonAngle) * 0.5, 0.5 + Math.sin(lonAngle) * 0.5);
  }
  for (let lon = 0; lon < SEG; lon++) {
    indices.push(botBase, botBase + 1 + ((lon + 1) % SEG), botBase + 1 + lon);
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
  // Food mound: r=0.12m (24cm diameter), h=0.025m (2.5cm) — natural 3D volume
  // Plate:      r=0.13m + 0.01m rim, 0.004m thick — flat subtle background

  const plate = createPlate(0.13, 0.01, 0.004);
  const foodSurface = createFoodSurface(0.12, 0.025, 0.004);

  const meshes = [plate, foodSurface];

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
          roughnessFactor: 0.8,
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
