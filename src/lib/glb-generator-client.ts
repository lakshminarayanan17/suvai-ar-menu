// Browser-compatible GLB generator
// Single image: top-view food on plate (gentle mound)
// Multi-image: image 1 on top, images 2-4 stitched as side wall panorama = real 3D food

const SEG = 48;

interface Mesh {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

// ---- Image Utilities ----

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

function canvasToBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("toBlob failed"));
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
    }, "image/jpeg", 0.92);
  });
}

function prepareFoodImage(dataUrl: string, maxSize: number): Promise<Uint8Array> {
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
      canvasToBytes(canvas).then(resolve).catch(reject);
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = dataUrl;
  });
}

// Stitch side images into a horizontal panoramic strip for wrapping around cylinder.
// Each image is crop-to-fill (no stretching) and repeated to fill 360° seamlessly.
async function createSideStrip(sideDataUrls: string[], width: number, height: number): Promise<Uint8Array> {
  const imgs = await Promise.all(sideDataUrls.map(loadImg));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  const count = imgs.length;
  // Repeat images to fill the full panorama (e.g., 2 images → each appears multiple times)
  const totalSlices = Math.max(count * 2, 6); // at least 6 slices for smooth wrap
  const sliceW = width / totalSlices;

  for (let s = 0; s < totalSlices; s++) {
    const img = imgs[s % count];
    // Crop-to-fill: maintain aspect ratio, crop excess
    const imgAspect = img.width / img.height;
    const sliceAspect = sliceW / height;

    let sx = 0, sy = 0, sw = img.width, sh = img.height;
    if (imgAspect > sliceAspect) {
      // Image wider than slice — crop sides
      sw = img.height * sliceAspect;
      sx = (img.width - sw) / 2;
    } else {
      // Image taller than slice — crop top/bottom
      sh = img.width / sliceAspect;
      sy = (img.height - sh) / 2;
    }

    ctx.drawImage(img, sx, sy, sw, sh, s * sliceW, 0, sliceW, height);
  }

  // Smooth seams with subtle vertical gradient blending at edges
  for (let s = 1; s < totalSlices; s++) {
    const seamX = s * sliceW;
    const blendW = sliceW * 0.15;
    const grad = ctx.createLinearGradient(seamX - blendW, 0, seamX + blendW, 0);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.5, "rgba(0,0,0,0.08)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(seamX - blendW, 0, blendW * 2, height);
  }

  return canvasToBytes(canvas);
}

// Generate plate texture with concentric rings
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

  const rings: [number, string][] = [
    [0.500, black], [0.480, cream], [0.430, orange],
    [0.410, cream], [0.370, orange], [0.350, cream],
  ];
  for (const [r, color] of rings) {
    ctx.beginPath();
    ctx.arc(cx, cy, size * r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
  const base64 = dataUrl.split(",")[1];
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ---- Geometry Builders ----

// Plate — flat disc with ring texture
function createPlate(radius: number, thickness: number): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const RINGS = 12;

  positions.push(0, thickness, 0);
  normals.push(0, 1, 0);
  uvs.push(0.5, 0.5);
  for (let ring = 1; ring <= RINGS; ring++) {
    const t = ring / RINGS;
    const r = t * radius;
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      positions.push(Math.cos(a) * r, thickness, Math.sin(a) * r);
      normals.push(0, 1, 0);
      uvs.push(0.5 + Math.cos(a) * t * 0.5, 0.5 + Math.sin(a) * t * 0.5);
    }
  }
  for (let i = 0; i < SEG; i++) indices.push(0, 1 + i, 1 + i + 1);
  for (let ring = 0; ring < RINGS - 1; ring++) {
    const s = 1 + ring * (SEG + 1), n = s + (SEG + 1);
    for (let i = 0; i < SEG; i++) {
      indices.push(s + i, n + i, s + i + 1);
      indices.push(s + i + 1, n + i, n + i + 1);
    }
  }

  // Side wall
  const sb = positions.length / 3;
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const nx = Math.cos(a), nz = Math.sin(a);
    positions.push(nx * radius, thickness, nz * radius);
    normals.push(nx, 0, nz); uvs.push(i / SEG, 1);
    positions.push(nx * radius, 0, nz * radius);
    normals.push(nx, 0, nz); uvs.push(i / SEG, 0);
  }
  for (let i = 0; i < SEG; i++) {
    const a = sb + i * 2;
    indices.push(a, a + 1, a + 2);
    indices.push(a + 2, a + 1, a + 3);
  }

  // Bottom
  const bb = positions.length / 3;
  positions.push(0, 0, 0); normals.push(0, -1, 0); uvs.push(0.5, 0.5);
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    positions.push(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    normals.push(0, -1, 0);
    uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
  }
  for (let i = 0; i < SEG; i++) indices.push(bb, bb + 1 + ((i + 1) % SEG), bb + 1 + i);

  return { positions, normals, uvs, indices };
}

// Food top — gentle mound, top-view image
function createFoodTop(radius: number, height: number, yBase: number): Mesh {
  const RINGS = 12;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  positions.push(0, yBase + height, 0);
  normals.push(0, 1, 0);
  uvs.push(0.5, 0.5);

  for (let ring = 1; ring <= RINGS; ring++) {
    const t = ring / RINGS;
    const r = t * radius;
    const profile = Math.cos(t * Math.PI * 0.5);
    const y = yBase + height * profile * profile;
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const cx = Math.cos(a), sz = Math.sin(a);
      positions.push(cx * r, y, sz * r);
      normals.push(0, 1, 0);
      const uvScale = 0.42;
      uvs.push(0.5 + cx * t * uvScale, 0.5 + sz * t * uvScale);
    }
  }

  for (let i = 0; i < SEG; i++) indices.push(0, 1 + i, 1 + i + 1);
  for (let ring = 0; ring < RINGS - 1; ring++) {
    const s = 1 + ring * (SEG + 1), n = s + (SEG + 1);
    for (let i = 0; i < SEG; i++) {
      indices.push(s + i, n + i, s + i + 1);
      indices.push(s + i + 1, n + i, n + i + 1);
    }
  }

  return { positions, normals, uvs, indices };
}

// Food side wall — cylinder wrapping side-view images around the food
function createFoodSide(radius: number, height: number, yBase: number): Mesh {
  const ROWS = 8;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= ROWS; row++) {
    const t = row / ROWS; // 0 = top, 1 = bottom
    const y = yBase + height * (1 - t);
    // Slight barrel shape — wider at middle, narrower at top/bottom
    const bulge = 1 + 0.05 * Math.sin(t * Math.PI);
    const r = radius * bulge;

    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const cx = Math.cos(a), sz = Math.sin(a);
      positions.push(cx * r, y, sz * r);
      normals.push(cx, 0, sz);
      // UV: u wraps horizontally, v goes top to bottom
      uvs.push(i / SEG, t);
    }
  }

  for (let row = 0; row < ROWS; row++) {
    const s = row * (SEG + 1);
    const n = s + (SEG + 1);
    for (let i = 0; i < SEG; i++) {
      indices.push(s + i, n + i, s + i + 1);
      indices.push(s + i + 1, n + i, n + i + 1);
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

// ---- Main Export ----

export async function generatePlateGLBFromUrl(imageDataUrl: string, allImages?: string[]): Promise<string> {
  const plateImageBytes = generatePlateTexture();

  if (allImages && allImages.length > 1) {
    // Multi-image: image 1 = top, rest = side wall panorama
    const topImageBytes = await prepareFoodImage(allImages[0], 1024);
    const sideImages = allImages.slice(1);
    const sideStripBytes = await createSideStrip(sideImages, 2048, 1024);

    const glbBytes = buildMultiImageGLB(topImageBytes, sideStripBytes, plateImageBytes, allImages.length);
    const blob = new Blob([glbBytes], { type: "model/gltf-binary" });
    return URL.createObjectURL(blob);
  } else {
    // Single image: flat-ish mound
    const topImageBytes = await prepareFoodImage(imageDataUrl, 1024);
    const glbBytes = buildSingleImageGLB(topImageBytes, plateImageBytes);
    const blob = new Blob([glbBytes], { type: "model/gltf-binary" });
    return URL.createObjectURL(blob);
  }
}

// ---- GLB Builders ----

// Single image: plate + food top (2 meshes, 2 materials)
function buildSingleImageGLB(topImageBytes: Uint8Array, plateImageBytes: Uint8Array): ArrayBuffer {
  const plate = createPlate(0.20, 0.003);
  const foodTop = createFoodTop(0.16, 0.015, 0.003);

  return assemblGLB(
    [plate, foodTop],
    [plateImageBytes, topImageBytes],
    [
      { name: "Plate", pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0.02, roughnessFactor: 0.4 } },
      { name: "Food", pbrMetallicRoughness: { baseColorTexture: { index: 1 }, metallicFactor: 0.0, roughnessFactor: 0.75 }, doubleSided: true },
    ]
  );
}

// Multi-image: plate + food top + food side wall (3 meshes, 3 materials, 3 textures)
function buildMultiImageGLB(topImageBytes: Uint8Array, sideStripBytes: Uint8Array, plateImageBytes: Uint8Array, imageCount: number): ArrayBuffer {
  // More images = taller food (more 3D data available)
  const foodHeight = 0.03 + (imageCount - 2) * 0.01; // 3cm base + 1cm per extra image
  const plate = createPlate(0.20, 0.003);
  const foodTop = createFoodTop(0.14, foodHeight * 0.3, 0.003 + foodHeight);
  const foodSide = createFoodSide(0.14, foodHeight, 0.003);

  return assemblGLB(
    [plate, foodTop, foodSide],
    [plateImageBytes, topImageBytes, sideStripBytes],
    [
      { name: "Plate", pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0.02, roughnessFactor: 0.4 } },
      { name: "FoodTop", pbrMetallicRoughness: { baseColorTexture: { index: 1 }, metallicFactor: 0.0, roughnessFactor: 0.75 }, doubleSided: true },
      { name: "FoodSide", pbrMetallicRoughness: { baseColorTexture: { index: 2 }, metallicFactor: 0.0, roughnessFactor: 0.75 }, doubleSided: true },
    ]
  );
}

// Generic GLB assembler — handles any number of meshes/materials/textures
function assemblGLB(meshes: Mesh[], imageBytesList: Uint8Array[], materials: Record<string, unknown>[]): ArrayBuffer {
  const bufferViews: { byteOffset: number; byteLength: number; target: number }[] = [];
  const accessors: Record<string, unknown>[] = [];
  let totalBinSize = 0;

  // Mesh data
  for (const mesh of meshes) {
    const vc = mesh.positions.length / 3;
    const ic = mesh.indices.length;
    const bounds = computeBounds(mesh.positions);

    bufferViews.push({ byteOffset: totalBinSize, byteLength: vc * 12, target: 34962 });
    accessors.push({ bufferView: bufferViews.length - 1, componentType: 5126, count: vc, type: "VEC3", max: bounds.max, min: bounds.min });
    totalBinSize += vc * 12;

    bufferViews.push({ byteOffset: totalBinSize, byteLength: vc * 12, target: 34962 });
    accessors.push({ bufferView: bufferViews.length - 1, componentType: 5126, count: vc, type: "VEC3" });
    totalBinSize += vc * 12;

    bufferViews.push({ byteOffset: totalBinSize, byteLength: vc * 8, target: 34962 });
    accessors.push({ bufferView: bufferViews.length - 1, componentType: 5126, count: vc, type: "VEC2" });
    totalBinSize += vc * 8;

    const idxBytes = ic * 2;
    const idxPad = (4 - (idxBytes % 4)) % 4;
    bufferViews.push({ byteOffset: totalBinSize, byteLength: idxBytes + idxPad, target: 34963 });
    accessors.push({ bufferView: bufferViews.length - 1, componentType: 5123, count: ic, type: "SCALAR" });
    totalBinSize += idxBytes + idxPad;
  }

  // Images (with alignment padding between)
  const imageViewIndices: number[] = [];
  const imagePads: number[] = [];
  for (let i = 0; i < imageBytesList.length; i++) {
    const imgBytes = imageBytesList[i];
    imageViewIndices.push(bufferViews.length);
    bufferViews.push({ byteOffset: totalBinSize, byteLength: imgBytes.byteLength, target: 0 });
    const pad = (4 - (imgBytes.byteLength % 4)) % 4;
    imagePads.push(pad);
    totalBinSize += imgBytes.byteLength + pad;
  }

  const binPad = (4 - (totalBinSize % 4)) % 4;
  const paddedBinSize = totalBinSize + binPad;

  // Build primitives
  const primitives = meshes.map((_, i) => ({
    attributes: { POSITION: i * 4, NORMAL: i * 4 + 1, TEXCOORD_0: i * 4 + 2 },
    indices: i * 4 + 3,
    material: i,
  }));

  const gltf = {
    asset: { version: "2.0", generator: "Suvai AR Menu" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "FoodPlate", mesh: 0 }],
    meshes: [{ primitives }],
    materials,
    textures: imageBytesList.map((_, i) => ({ source: i, sampler: 0 })),
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 33071 }],
    images: imageViewIndices.map((bvIdx) => ({ bufferView: bvIdx, mimeType: "image/jpeg" })),
    accessors,
    bufferViews: bufferViews.map((bv) =>
      bv.target ? { buffer: 0, byteOffset: bv.byteOffset, byteLength: bv.byteLength, target: bv.target }
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

  dv.setUint32(off, 0x46546c67, true); off += 4;
  dv.setUint32(off, 2, true); off += 4;
  dv.setUint32(off, glbSize, true); off += 4;

  dv.setUint32(off, paddedGltfLen, true); off += 4;
  dv.setUint32(off, 0x4e4f534a, true); off += 4;
  u8.set(gltfBytes, off); off += gltfBytes.byteLength;
  for (let i = 0; i < gltfPad; i++) u8[off++] = 0x20;

  dv.setUint32(off, paddedBinSize, true); off += 4;
  dv.setUint32(off, 0x004e4942, true); off += 4;

  for (const mesh of meshes) {
    for (const v of mesh.positions) { dv.setFloat32(off, v, true); off += 4; }
    for (const v of mesh.normals) { dv.setFloat32(off, v, true); off += 4; }
    for (const v of mesh.uvs) { dv.setFloat32(off, v, true); off += 4; }
    for (const idx of mesh.indices) { dv.setUint16(off, idx, true); off += 2; }
    const ip = (4 - ((mesh.indices.length * 2) % 4)) % 4;
    for (let i = 0; i < ip; i++) u8[off++] = 0;
  }

  for (let i = 0; i < imageBytesList.length; i++) {
    u8.set(imageBytesList[i], off); off += imageBytesList[i].byteLength;
    for (let j = 0; j < imagePads[i]; j++) u8[off++] = 0;
  }

  for (let i = 0; i < binPad; i++) u8[off++] = 0;
  return out;
}
