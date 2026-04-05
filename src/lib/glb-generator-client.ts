// Browser-compatible GLB generator
// Clean plate with thin concentric rings + flat food image on top

const SEG = 48;

interface Mesh {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

// ---- Image Utilities ----

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

// Generate plate texture — matches reference exactly:
// thin black edge → cream → thin orange ring → cream → thin orange ring → cream center
function generatePlateTexture(): Uint8Array {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const cx = size / 2, cy = size / 2;
  const cream = "#F0EBE0";
  const orange = "#CC7F4E";
  const black = "#1A1A1A";

  // Draw from outside in
  // Full circle black (very thin rim)
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.500, 0, Math.PI * 2);
  ctx.fillStyle = black;
  ctx.fill();

  // Cream (main outer band)
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.480, 0, Math.PI * 2);
  ctx.fillStyle = cream;
  ctx.fill();

  // Outer orange ring (thin)
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.430, 0, Math.PI * 2);
  ctx.fillStyle = orange;
  ctx.fill();

  // Cream between rings
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.410, 0, Math.PI * 2);
  ctx.fillStyle = cream;
  ctx.fill();

  // Inner orange ring (thin)
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.370, 0, Math.PI * 2);
  ctx.fillStyle = orange;
  ctx.fill();

  // Cream center (large — this is where food sits)
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.350, 0, Math.PI * 2);
  ctx.fillStyle = cream;
  ctx.fill();

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

// Plate — flat disc with ring texture
function createPlate(radius: number, thickness: number): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const PLATE_RINGS = 12;
  // Center
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

  for (let i = 0; i < SEG; i++) {
    indices.push(0, 1 + i, 1 + i + 1);
  }
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

  // Bottom
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

// Food — gentle mound sitting on the plate. Not puffed, just natural food volume.
// 1.5cm height with smooth cosine falloff — like real food piled on a plate.
function createFoodDisc(radius: number, yBase: number): Mesh {
  const RINGS = 12;
  const height = 0.015; // 1.5cm gentle rise
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Center vertex (highest point)
  positions.push(0, yBase + height + 0.001, 0);
  normals.push(0, 1, 0);
  uvs.push(0.5, 0.5);

  for (let ring = 1; ring <= RINGS; ring++) {
    const t = ring / RINGS; // 0=center, 1=edge
    const r = t * radius;
    // Smooth cosine falloff — gentle, not a dome
    const profile = Math.cos(t * Math.PI * 0.5);
    const y = yBase + 0.001 + height * profile * profile;

    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const cx = Math.cos(a);
      const sz = Math.sin(a);
      positions.push(cx * r, y, sz * r);
      normals.push(0, 1, 0);
      const uvScale = 0.42;
      uvs.push(0.5 + cx * t * uvScale, 0.5 + sz * t * uvScale);
    }
  }

  // Center to first ring
  for (let i = 0; i < SEG; i++) {
    indices.push(0, 1 + i, 1 + i + 1);
  }
  // Between rings
  for (let ring = 0; ring < RINGS - 1; ring++) {
    const start = 1 + ring * (SEG + 1);
    const next = start + (SEG + 1);
    for (let i = 0; i < SEG; i++) {
      indices.push(start + i, next + i, start + i + 1);
      indices.push(start + i + 1, next + i, next + i + 1);
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

// Combine multiple food images into a single composite texture.
// Each image maps to a quadrant so the 3D model shows different angles.
function compositeImages(dataUrls: string[], size: number): Promise<{ bytes: Uint8Array; mime: string }> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    // Fill with neutral background
    ctx.fillStyle = "#e8e0d8";
    ctx.fillRect(0, 0, size, size);

    const loadImage = (src: string): Promise<HTMLImageElement> =>
      new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = src;
      });

    Promise.all(dataUrls.map(loadImage)).then((imgs) => {
      const count = imgs.length;
      if (count === 1) {
        // Single image: fill entire canvas
        ctx.drawImage(imgs[0], 0, 0, size, size);
      } else if (count === 2) {
        // 2 images: left half + right half
        const half = size / 2;
        ctx.drawImage(imgs[0], 0, 0, half, size);
        ctx.drawImage(imgs[1], half, 0, half, size);
      } else if (count === 3) {
        // 3 images: top-left, top-right, bottom-center
        const half = size / 2;
        ctx.drawImage(imgs[0], 0, 0, half, half);
        ctx.drawImage(imgs[1], half, 0, half, half);
        ctx.drawImage(imgs[2], half / 2, half, half, half);
      } else {
        // 4 images: 2x2 grid
        const half = size / 2;
        ctx.drawImage(imgs[0], 0, 0, half, half);
        ctx.drawImage(imgs[1], half, 0, half, half);
        ctx.drawImage(imgs[2], 0, half, half, half);
        ctx.drawImage(imgs[3], half, half, half, half);
      }

      // Smooth the seams with a subtle radial gradient overlay
      if (count > 1) {
        const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.15, size / 2, size / 2, size * 0.5);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
      }

      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error("Composite toBlob failed"));
        blob.arrayBuffer().then((buf) => {
          resolve({ bytes: new Uint8Array(buf), mime: "image/jpeg" });
        });
      }, "image/jpeg", 0.92);
    }).catch(reject);
  });
}

// ---- Main Export ----

export async function generatePlateGLBFromUrl(imageDataUrl: string, allImages?: string[]): Promise<string> {
  let foodImageBytes: Uint8Array;

  if (allImages && allImages.length > 1) {
    // Multiple images: composite them into one texture
    const result = await compositeImages(allImages, 1024);
    foodImageBytes = result.bytes;
  } else {
    // Single image
    const result = await prepareFoodImage(imageDataUrl, 1024);
    foodImageBytes = result.bytes;
  }

  const plateImageBytes = generatePlateTexture();
  const glbBytes = buildGLB(foodImageBytes, plateImageBytes);
  const blob = new Blob([glbBytes], { type: "model/gltf-binary" });
  return URL.createObjectURL(blob);
}

// ---- GLB Builder ----

function buildGLB(foodImageBytes: Uint8Array, plateImageBytes: Uint8Array): ArrayBuffer {
  // Plate: r=0.20m (40cm diameter) — large visible plate
  // Food disc: r=0.16m (32cm) — big food, clear ring gap around it
  const plate = createPlate(0.20, 0.003);
  const foodDisc = createFoodDisc(0.16, 0.003);

  const meshes = [plate, foodDisc];

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

  // Plate image
  const plateImageViewIdx = bufferViews.length;
  const platePad = (4 - (plateImageBytes.byteLength % 4)) % 4;
  bufferViews.push({ byteOffset: totalBinSize, byteLength: plateImageBytes.byteLength, target: 0 });
  totalBinSize += plateImageBytes.byteLength + platePad;

  // Food image
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
      {
        name: "Plate",
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          metallicFactor: 0.02,
          roughnessFactor: 0.4,
        },
      },
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
