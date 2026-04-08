// Browser-compatible GLB generator — realistic 3D food from photos
// Uses image-based displacement to create actual 3D food shape from the photo
// Brighter areas = higher, edges/dark = lower → real food contour

const SEG = 40;

interface Mesh {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
}

// ---- Image Utilities ----

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("Image load failed"));
    img.src = src;
  });
}

function canvasToBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("toBlob failed"));
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
    }, "image/jpeg", 0.85);
  });
}

async function prepareFoodImage(dataUrl: string, maxSize: number): Promise<Uint8Array> {
  const img = await loadImg(dataUrl);
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
  return canvasToBytes(canvas);
}

// Extract displacement/height map from image — returns normalized brightness grid
function extractDisplacementMap(img: HTMLImageElement, resolution: number): Float32Array {
  const canvas = document.createElement("canvas");
  canvas.width = resolution;
  canvas.height = resolution;
  const ctx = canvas.getContext("2d")!;

  // Draw image centered and cropped to square
  const size = Math.min(img.width, img.height);
  const sx = (img.width - size) / 2;
  const sy = (img.height - size) / 2;
  ctx.drawImage(img, sx, sy, size, size, 0, 0, resolution, resolution);

  const imageData = ctx.getImageData(0, 0, resolution, resolution);
  const data = imageData.data;
  const heightMap = new Float32Array(resolution * resolution);

  // Convert to brightness
  for (let i = 0; i < resolution * resolution; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const a = data[i * 4 + 3];
    // Perceived brightness
    heightMap[i] = a > 0 ? (0.299 * r + 0.587 * g + 0.114 * b) / 255 : 0;
  }

  // Smooth the height map (3x3 box blur, 2 passes) for natural contours
  const temp = new Float32Array(resolution * resolution);
  for (let pass = 0; pass < 2; pass++) {
    const src = pass === 0 ? heightMap : temp;
    const dst = pass === 0 ? temp : heightMap;
    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        let sum = 0, count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < resolution && ny >= 0 && ny < resolution) {
              sum += src[ny * resolution + nx];
              count++;
            }
          }
        }
        dst[y * resolution + x] = sum / count;
      }
    }
  }

  return heightMap;
}

// Sample height map at UV coordinate using bilinear interpolation
function sampleHeightMap(heightMap: Float32Array, resolution: number, u: number, v: number): number {
  const x = u * (resolution - 1);
  const y = v * (resolution - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, resolution - 1), y1 = Math.min(y0 + 1, resolution - 1);
  const fx = x - x0, fy = y - y0;

  const h00 = heightMap[y0 * resolution + x0];
  const h10 = heightMap[y0 * resolution + x1];
  const h01 = heightMap[y1 * resolution + x0];
  const h11 = heightMap[y1 * resolution + x1];

  return h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;
}

// Stitch side images into panoramic strip
async function createSideStrip(sideDataUrls: string[], width: number, height: number): Promise<Uint8Array> {
  const imgs = await Promise.all(sideDataUrls.map(loadImg));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  const count = imgs.length;
  const totalSlices = Math.max(count * 2, 6);
  const sliceW = width / totalSlices;

  for (let s = 0; s < totalSlices; s++) {
    const img = imgs[s % count];
    const imgAspect = img.width / img.height;
    const sliceAspect = sliceW / height;
    let sx = 0, sy = 0, sw = img.width, sh = img.height;
    if (imgAspect > sliceAspect) {
      sw = img.height * sliceAspect;
      sx = (img.width - sw) / 2;
    } else {
      sh = img.width / sliceAspect;
      sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, s * sliceW, 0, sliceW, height);
  }

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

// Generate plate texture
function generatePlateTexture(): Uint8Array {
  const size = 256;
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

  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  const base64 = dataUrl.split(",")[1];
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ---- Geometry Builders ----

function createPlate(radius: number, thickness: number): Mesh {
  const RINGS = 10;
  const verts: number[] = [];
  const norms: number[] = [];
  const uvArr: number[] = [];
  const idxArr: number[] = [];

  // Top face
  verts.push(0, thickness, 0); norms.push(0, 1, 0); uvArr.push(0.5, 0.5);
  for (let ring = 1; ring <= RINGS; ring++) {
    const t = ring / RINGS;
    const r = t * radius;
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      verts.push(ca * r, thickness, sa * r);
      norms.push(0, 1, 0);
      uvArr.push(0.5 + ca * t * 0.5, 0.5 + sa * t * 0.5);
    }
  }
  for (let i = 0; i < SEG; i++) idxArr.push(0, 1 + i, 1 + i + 1);
  for (let ring = 0; ring < RINGS - 1; ring++) {
    const s = 1 + ring * (SEG + 1), n = s + (SEG + 1);
    for (let i = 0; i < SEG; i++) {
      idxArr.push(s + i, n + i, s + i + 1);
      idxArr.push(s + i + 1, n + i, n + i + 1);
    }
  }

  // Side wall
  const sb = verts.length / 3;
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const nx = Math.cos(a), nz = Math.sin(a);
    verts.push(nx * radius, thickness, nz * radius); norms.push(nx, 0, nz); uvArr.push(i / SEG, 1);
    verts.push(nx * radius, 0, nz * radius); norms.push(nx, 0, nz); uvArr.push(i / SEG, 0);
  }
  for (let i = 0; i < SEG; i++) {
    const a = sb + i * 2;
    idxArr.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
  }

  // Bottom
  const bb = verts.length / 3;
  verts.push(0, 0, 0); norms.push(0, -1, 0); uvArr.push(0.5, 0.5);
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    verts.push(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    norms.push(0, -1, 0);
    uvArr.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
  }
  for (let i = 0; i < SEG; i++) idxArr.push(bb, bb + 1 + ((i + 1) % SEG), bb + 1 + i);

  return {
    positions: new Float32Array(verts),
    normals: new Float32Array(norms),
    uvs: new Float32Array(uvArr),
    indices: new Uint16Array(idxArr),
  };
}

// Food top with IMAGE-BASED DISPLACEMENT — creates real 3D food contour
function createFoodTopDisplaced(
  radius: number,
  baseHeight: number,
  maxDisplacement: number,
  yBase: number,
  heightMap: Float32Array,
  hmResolution: number
): Mesh {
  const RINGS = 20; // high ring count for smooth displacement
  const verts: number[] = [];
  const norms: number[] = [];
  const uvArr: number[] = [];
  const idxArr: number[] = [];

  // Center vertex
  const centerH = sampleHeightMap(heightMap, hmResolution, 0.5, 0.5);
  const centerY = yBase + baseHeight + centerH * maxDisplacement;
  verts.push(0, centerY, 0);
  norms.push(0, 1, 0);
  uvArr.push(0.5, 0.5);

  // Build displaced rings
  for (let ring = 1; ring <= RINGS; ring++) {
    const t = ring / RINGS;
    const r = t * radius;

    // Edge falloff — food shape goes to plate level at edges
    const edgeFalloff = Math.cos(t * Math.PI * 0.5);
    const falloff = edgeFalloff * edgeFalloff;

    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);

      // UV coordinates for texture sampling
      const uvScale = 0.42;
      const u = 0.5 + ca * t * uvScale;
      const v = 0.5 + sa * t * uvScale;

      // Sample displacement from height map
      // Map UV to heightmap space (0-1)
      const hmU = 0.5 + ca * t * 0.5;
      const hmV = 0.5 + sa * t * 0.5;
      const displacement = sampleHeightMap(heightMap, hmResolution, hmU, hmV);

      // Final height: base shape + image displacement
      const y = yBase + (baseHeight + displacement * maxDisplacement) * falloff;

      verts.push(ca * r, y, sa * r);
      norms.push(0, 1, 0); // placeholder — recomputed below
      uvArr.push(u, v);
    }
  }

  // Build indices
  for (let i = 0; i < SEG; i++) idxArr.push(0, 1 + i, 1 + i + 1);
  for (let ring = 0; ring < RINGS - 1; ring++) {
    const s = 1 + ring * (SEG + 1), n = s + (SEG + 1);
    for (let i = 0; i < SEG; i++) {
      idxArr.push(s + i, n + i, s + i + 1);
      idxArr.push(s + i + 1, n + i, n + i + 1);
    }
  }

  const positions = new Float32Array(verts);
  const normals = new Float32Array(norms);

  // Recompute normals from actual displaced geometry
  // Average face normals at each vertex
  const normalAccum = new Float32Array(positions.length);
  for (let i = 0; i < idxArr.length; i += 3) {
    const i0 = idxArr[i] * 3, i1 = idxArr[i + 1] * 3, i2 = idxArr[i + 2] * 3;
    const ax = positions[i1] - positions[i0], ay = positions[i1 + 1] - positions[i0 + 1], az = positions[i1 + 2] - positions[i0 + 2];
    const bx = positions[i2] - positions[i0], by = positions[i2 + 1] - positions[i0 + 1], bz = positions[i2 + 2] - positions[i0 + 2];
    // Cross product
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    normalAccum[i0] += nx; normalAccum[i0 + 1] += ny; normalAccum[i0 + 2] += nz;
    normalAccum[i1] += nx; normalAccum[i1 + 1] += ny; normalAccum[i1 + 2] += nz;
    normalAccum[i2] += nx; normalAccum[i2 + 1] += ny; normalAccum[i2 + 2] += nz;
  }
  // Normalize
  for (let i = 0; i < normalAccum.length; i += 3) {
    const len = Math.sqrt(normalAccum[i] ** 2 + normalAccum[i + 1] ** 2 + normalAccum[i + 2] ** 2) || 1;
    normals[i] = normalAccum[i] / len;
    normals[i + 1] = normalAccum[i + 1] / len;
    normals[i + 2] = normalAccum[i + 2] / len;
  }

  return {
    positions,
    normals,
    uvs: new Float32Array(uvArr),
    indices: new Uint16Array(idxArr),
  };
}

// Food side wall — for multi-image
function createFoodSide(radius: number, height: number, yBase: number): Mesh {
  const ROWS = 10;
  const verts: number[] = [];
  const norms: number[] = [];
  const uvArr: number[] = [];
  const idxArr: number[] = [];

  for (let row = 0; row <= ROWS; row++) {
    const t = row / ROWS;
    const y = yBase + height * (1 - t);
    const bulge = 1 + 0.06 * Math.sin(t * Math.PI);
    const r = radius * bulge;

    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      verts.push(ca * r, y, sa * r);
      norms.push(ca, 0, sa);
      uvArr.push(i / SEG, t);
    }
  }

  for (let row = 0; row < ROWS; row++) {
    const s = row * (SEG + 1), n = s + (SEG + 1);
    for (let i = 0; i < SEG; i++) {
      idxArr.push(s + i, n + i, s + i + 1);
      idxArr.push(s + i + 1, n + i, n + i + 1);
    }
  }

  return {
    positions: new Float32Array(verts),
    normals: new Float32Array(norms),
    uvs: new Float32Array(uvArr),
    indices: new Uint16Array(idxArr),
  };
}

function computeBounds(positions: Float32Array) {
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
  const t0 = performance.now();
  const plateImageBytes = generatePlateTexture();

  // Load the primary image for displacement map extraction
  const primaryImg = await loadImg(allImages && allImages.length > 0 ? allImages[0] : imageDataUrl);
  const HM_RES = 64; // height map resolution
  const heightMap = extractDisplacementMap(primaryImg, HM_RES);

  let glbBytes: ArrayBuffer;
  if (allImages && allImages.length > 1) {
    const [topImageBytes, sideStripBytes] = await Promise.all([
      prepareFoodImage(allImages[0], 512),
      createSideStrip(allImages.slice(1), 1024, 512),
    ]);
    glbBytes = buildMultiImageGLB(topImageBytes, sideStripBytes, plateImageBytes, allImages.length, heightMap, HM_RES);
  } else {
    const topImageBytes = await prepareFoodImage(imageDataUrl, 512);
    glbBytes = buildSingleImageGLB(topImageBytes, plateImageBytes, heightMap, HM_RES);
  }

  const blob = new Blob([glbBytes], { type: "model/gltf-binary" });
  console.log(`[Suvai] GLB built in ${(performance.now() - t0).toFixed(0)}ms, ${(glbBytes.byteLength / 1024).toFixed(0)}KB`);
  return URL.createObjectURL(blob);
}

// ---- GLB Builders ----

function buildSingleImageGLB(topImageBytes: Uint8Array, plateImageBytes: Uint8Array, heightMap: Float32Array, hmRes: number): ArrayBuffer {
  const plate = createPlate(0.20, 0.003);
  // Displaced food top — 2cm base height + up to 1.5cm displacement from image
  const foodTop = createFoodTopDisplaced(0.16, 0.020, 0.015, 0.003, heightMap, hmRes);

  return assemblGLB(
    [plate, foodTop],
    [plateImageBytes, topImageBytes],
    [
      { name: "Plate", pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0.05, roughnessFactor: 0.3 } },
      { name: "Food", pbrMetallicRoughness: { baseColorTexture: { index: 1 }, metallicFactor: 0.0, roughnessFactor: 0.55 }, doubleSided: true },
    ]
  );
}

function buildMultiImageGLB(topImageBytes: Uint8Array, sideStripBytes: Uint8Array, plateImageBytes: Uint8Array, imageCount: number, heightMap: Float32Array, hmRes: number): ArrayBuffer {
  const foodHeight = 0.04 + (imageCount - 2) * 0.015;
  const plate = createPlate(0.20, 0.003);
  const foodTop = createFoodTopDisplaced(0.14, foodHeight * 0.35, 0.015, 0.003 + foodHeight, heightMap, hmRes);
  const foodSide = createFoodSide(0.14, foodHeight, 0.003);

  return assemblGLB(
    [plate, foodTop, foodSide],
    [plateImageBytes, topImageBytes, sideStripBytes],
    [
      { name: "Plate", pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0.05, roughnessFactor: 0.3 } },
      { name: "FoodTop", pbrMetallicRoughness: { baseColorTexture: { index: 1 }, metallicFactor: 0.0, roughnessFactor: 0.55 }, doubleSided: true },
      { name: "FoodSide", pbrMetallicRoughness: { baseColorTexture: { index: 2 }, metallicFactor: 0.0, roughnessFactor: 0.55 }, doubleSided: true },
    ]
  );
}

// GLB assembler
function assemblGLB(meshes: Mesh[], imageBytesList: Uint8Array[], materials: Record<string, unknown>[]): ArrayBuffer {
  const bufferViews: { byteOffset: number; byteLength: number; target: number }[] = [];
  const accessors: Record<string, unknown>[] = [];
  let totalBinSize = 0;

  for (const mesh of meshes) {
    const vc = mesh.positions.length / 3;
    const ic = mesh.indices.length;
    const bounds = computeBounds(mesh.positions);

    bufferViews.push({ byteOffset: totalBinSize, byteLength: mesh.positions.byteLength, target: 34962 });
    accessors.push({ bufferView: bufferViews.length - 1, componentType: 5126, count: vc, type: "VEC3", max: bounds.max, min: bounds.min });
    totalBinSize += mesh.positions.byteLength;

    bufferViews.push({ byteOffset: totalBinSize, byteLength: mesh.normals.byteLength, target: 34962 });
    accessors.push({ bufferView: bufferViews.length - 1, componentType: 5126, count: vc, type: "VEC3" });
    totalBinSize += mesh.normals.byteLength;

    bufferViews.push({ byteOffset: totalBinSize, byteLength: mesh.uvs.byteLength, target: 34962 });
    accessors.push({ bufferView: bufferViews.length - 1, componentType: 5126, count: vc, type: "VEC2" });
    totalBinSize += mesh.uvs.byteLength;

    const idxPad = (4 - (mesh.indices.byteLength % 4)) % 4;
    bufferViews.push({ byteOffset: totalBinSize, byteLength: mesh.indices.byteLength + idxPad, target: 34963 });
    accessors.push({ bufferView: bufferViews.length - 1, componentType: 5123, count: ic, type: "SCALAR" });
    totalBinSize += mesh.indices.byteLength + idxPad;
  }

  const imageViewIndices: number[] = [];
  const imagePads: number[] = [];
  for (const imgBytes of imageBytesList) {
    imageViewIndices.push(bufferViews.length);
    bufferViews.push({ byteOffset: totalBinSize, byteLength: imgBytes.byteLength, target: 0 });
    const pad = (4 - (imgBytes.byteLength % 4)) % 4;
    imagePads.push(pad);
    totalBinSize += imgBytes.byteLength + pad;
  }

  const binPad = (4 - (totalBinSize % 4)) % 4;
  const paddedBinSize = totalBinSize + binPad;

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
    u8.set(new Uint8Array(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength), off);
    off += mesh.positions.byteLength;
    u8.set(new Uint8Array(mesh.normals.buffer, mesh.normals.byteOffset, mesh.normals.byteLength), off);
    off += mesh.normals.byteLength;
    u8.set(new Uint8Array(mesh.uvs.buffer, mesh.uvs.byteOffset, mesh.uvs.byteLength), off);
    off += mesh.uvs.byteLength;
    u8.set(new Uint8Array(mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength), off);
    off += mesh.indices.byteLength;
    const ip = (4 - (mesh.indices.byteLength % 4)) % 4;
    for (let i = 0; i < ip; i++) u8[off++] = 0;
  }

  for (let i = 0; i < imageBytesList.length; i++) {
    u8.set(imageBytesList[i], off); off += imageBytesList[i].byteLength;
    for (let j = 0; j < imagePads[i]; j++) u8[off++] = 0;
  }

  for (let i = 0; i < binPad; i++) u8[off++] = 0;
  return out;
}
