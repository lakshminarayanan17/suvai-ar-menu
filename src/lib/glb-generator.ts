// Generates a minimal GLB file with a plate + food texture disc
// GLB = Binary glTF format that model-viewer can load for AR

export function generatePlateGLB(textureDataUrl: string): Buffer {
  // Extract base64 image data
  const base64Match = textureDataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!base64Match) {
    throw new Error("Invalid image data URL");
  }
  const mimeType = `image/${base64Match[1]}`;
  const imageBuffer = Buffer.from(base64Match[2], "base64");

  // Build glTF JSON
  const gltf = buildGltfJson(imageBuffer.byteLength, mimeType);
  const gltfString = JSON.stringify(gltf);
  const gltfBuffer = Buffer.from(gltfString);

  // Pad glTF JSON to 4-byte boundary
  const gltfPadding = (4 - (gltfBuffer.byteLength % 4)) % 4;
  const paddedGltfBuffer = Buffer.concat([
    gltfBuffer,
    Buffer.alloc(gltfPadding, 0x20), // space padding
  ]);

  // Build binary buffer (geometry + image)
  const geometryBuffer = buildGeometryBuffer();
  const binBuffer = Buffer.concat([geometryBuffer, imageBuffer]);

  // Pad binary buffer to 4-byte boundary
  const binPadding = (4 - (binBuffer.byteLength % 4)) % 4;
  const paddedBinBuffer = Buffer.concat([
    binBuffer,
    Buffer.alloc(binPadding, 0x00),
  ]);

  // GLB header
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // magic: 'glTF'
  header.writeUInt32LE(2, 4); // version: 2
  header.writeUInt32LE(
    12 + 8 + paddedGltfBuffer.byteLength + 8 + paddedBinBuffer.byteLength,
    8
  ); // total length

  // JSON chunk header
  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(paddedGltfBuffer.byteLength, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

  // BIN chunk header
  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(paddedBinBuffer.byteLength, 0);
  binChunkHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

  return Buffer.concat([
    header,
    jsonChunkHeader,
    paddedGltfBuffer,
    binChunkHeader,
    paddedBinBuffer,
  ]);
}

function buildGltfJson(imageByteLength: number, mimeType: string) {
  // Geometry layout:
  // Plate base (cylinder): positions + normals + texcoords + indices
  // Food disc (flat cylinder on top): positions + normals + texcoords + indices

  const geo = getGeometryLayout();

  return {
    asset: { version: "2.0", generator: "Suvai AR Menu" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      {
        name: "Plate",
        mesh: 0,
        // Scale down to a reasonable plate size (~30cm)
        scale: [0.15, 0.15, 0.15],
      },
    ],
    meshes: [
      {
        primitives: [
          // Plate base - untextured brown/terracotta
          {
            attributes: {
              POSITION: 0,
              NORMAL: 1,
              TEXCOORD_0: 2,
            },
            indices: 3,
            material: 0,
          },
          // Plate inner white
          {
            attributes: {
              POSITION: 4,
              NORMAL: 5,
              TEXCOORD_0: 6,
            },
            indices: 7,
            material: 1,
          },
          // Food disc on top - textured
          {
            attributes: {
              POSITION: 8,
              NORMAL: 9,
              TEXCOORD_0: 10,
            },
            indices: 11,
            material: 2,
          },
        ],
      },
    ],
    materials: [
      // Plate outer ring - terracotta
      {
        name: "PlateOuter",
        pbrMetallicRoughness: {
          baseColorFactor: [0.76, 0.52, 0.3, 1.0],
          metallicFactor: 0.0,
          roughnessFactor: 0.7,
        },
      },
      // Plate inner - white/cream
      {
        name: "PlateInner",
        pbrMetallicRoughness: {
          baseColorFactor: [0.96, 0.94, 0.92, 1.0],
          metallicFactor: 0.0,
          roughnessFactor: 0.8,
        },
      },
      // Food - textured
      {
        name: "Food",
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          metallicFactor: 0.0,
          roughnessFactor: 0.8,
        },
      },
    ],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
    images: [
      {
        bufferView: 12,
        mimeType,
      },
    ],
    accessors: [
      // 0: plate outer positions
      {
        bufferView: 0,
        componentType: 5126,
        count: geo.plateOuter.vertexCount,
        type: "VEC3",
        max: [1.0, 0.06, 1.0],
        min: [-1.0, 0.0, -1.0],
      },
      // 1: plate outer normals
      {
        bufferView: 1,
        componentType: 5126,
        count: geo.plateOuter.vertexCount,
        type: "VEC3",
      },
      // 2: plate outer texcoords
      {
        bufferView: 2,
        componentType: 5126,
        count: geo.plateOuter.vertexCount,
        type: "VEC2",
      },
      // 3: plate outer indices
      {
        bufferView: 3,
        componentType: 5123,
        count: geo.plateOuter.indexCount,
        type: "SCALAR",
      },
      // 4: plate inner positions
      {
        bufferView: 4,
        componentType: 5126,
        count: geo.plateInner.vertexCount,
        type: "VEC3",
        max: [0.82, 0.08, 0.82],
        min: [-0.82, 0.06, -0.82],
      },
      // 5: plate inner normals
      {
        bufferView: 5,
        componentType: 5126,
        count: geo.plateInner.vertexCount,
        type: "VEC3",
      },
      // 6: plate inner texcoords
      {
        bufferView: 6,
        componentType: 5126,
        count: geo.plateInner.vertexCount,
        type: "VEC2",
      },
      // 7: plate inner indices
      {
        bufferView: 7,
        componentType: 5123,
        count: geo.plateInner.indexCount,
        type: "SCALAR",
      },
      // 8: food positions
      {
        bufferView: 8,
        componentType: 5126,
        count: geo.food.vertexCount,
        type: "VEC3",
        max: [0.7, 0.16, 0.7],
        min: [-0.7, 0.08, -0.7],
      },
      // 9: food normals
      {
        bufferView: 9,
        componentType: 5126,
        count: geo.food.vertexCount,
        type: "VEC3",
      },
      // 10: food texcoords
      {
        bufferView: 10,
        componentType: 5126,
        count: geo.food.vertexCount,
        type: "VEC2",
      },
      // 11: food indices
      {
        bufferView: 11,
        componentType: 5123,
        count: geo.food.indexCount,
        type: "SCALAR",
      },
    ],
    bufferViews: [
      // 0-3: plate outer
      { buffer: 0, byteOffset: geo.plateOuter.posOffset, byteLength: geo.plateOuter.posBytes, target: 34962 },
      { buffer: 0, byteOffset: geo.plateOuter.normOffset, byteLength: geo.plateOuter.normBytes, target: 34962 },
      { buffer: 0, byteOffset: geo.plateOuter.uvOffset, byteLength: geo.plateOuter.uvBytes, target: 34962 },
      { buffer: 0, byteOffset: geo.plateOuter.idxOffset, byteLength: geo.plateOuter.idxBytes, target: 34963 },
      // 4-7: plate inner
      { buffer: 0, byteOffset: geo.plateInner.posOffset, byteLength: geo.plateInner.posBytes, target: 34962 },
      { buffer: 0, byteOffset: geo.plateInner.normOffset, byteLength: geo.plateInner.normBytes, target: 34962 },
      { buffer: 0, byteOffset: geo.plateInner.uvOffset, byteLength: geo.plateInner.uvBytes, target: 34962 },
      { buffer: 0, byteOffset: geo.plateInner.idxOffset, byteLength: geo.plateInner.idxBytes, target: 34963 },
      // 8-11: food
      { buffer: 0, byteOffset: geo.food.posOffset, byteLength: geo.food.posBytes, target: 34962 },
      { buffer: 0, byteOffset: geo.food.normOffset, byteLength: geo.food.normBytes, target: 34962 },
      { buffer: 0, byteOffset: geo.food.uvOffset, byteLength: geo.food.uvBytes, target: 34962 },
      { buffer: 0, byteOffset: geo.food.idxOffset, byteLength: geo.food.idxBytes, target: 34963 },
      // 12: image
      { buffer: 0, byteOffset: geo.totalGeometryBytes, byteLength: imageByteLength },
    ],
    buffers: [
      {
        byteLength: geo.totalGeometryBytes + imageByteLength,
      },
    ],
  };
}

const SEGMENTS = 48;

interface MeshLayout {
  vertexCount: number;
  indexCount: number;
  posOffset: number;
  posBytes: number;
  normOffset: number;
  normBytes: number;
  uvOffset: number;
  uvBytes: number;
  idxOffset: number;
  idxBytes: number;
}

function getGeometryLayout() {
  // Each disc mesh: center vertex + ring vertices on top + ring on bottom + side verts
  // Simplified: just top face + bottom face + side for each cylinder

  const discVertexCount = SEGMENTS + 1; // center + ring
  const discIndexCount = SEGMENTS * 3; // triangles

  // Plate outer: disc at y=0 with radius=1.0 and height=0.06
  // Just top face for simplicity
  const plateOuter = calculateMeshLayout(0, discVertexCount, discIndexCount);

  // Plate inner: disc at y=0.06 with radius=0.82
  const plateInner = calculateMeshLayout(
    plateOuter.idxOffset + plateOuter.idxBytes,
    discVertexCount,
    discIndexCount
  );

  // Food: dome-like disc at y=0.08 with radius=0.7
  const food = calculateMeshLayout(
    plateInner.idxOffset + plateInner.idxBytes,
    discVertexCount,
    discIndexCount
  );

  const totalGeometryBytes = food.idxOffset + food.idxBytes;
  // Pad to 4 bytes
  const paddedTotal = totalGeometryBytes + ((4 - (totalGeometryBytes % 4)) % 4);

  return { plateOuter, plateInner, food, totalGeometryBytes: paddedTotal };
}

function calculateMeshLayout(startOffset: number, vertexCount: number, indexCount: number): MeshLayout {
  const posBytes = vertexCount * 3 * 4; // vec3 float32
  const normBytes = vertexCount * 3 * 4;
  const uvBytes = vertexCount * 2 * 4; // vec2 float32
  const idxBytes = indexCount * 2; // uint16
  // Align indices to 4 bytes
  const paddedIdxBytes = idxBytes + ((4 - (idxBytes % 4)) % 4);

  const posOffset = startOffset;
  const normOffset = posOffset + posBytes;
  const uvOffset = normOffset + normBytes;
  const idxOffset = uvOffset + uvBytes;

  return {
    vertexCount,
    indexCount,
    posOffset,
    posBytes,
    normOffset,
    normBytes,
    uvOffset,
    uvBytes,
    idxOffset,
    idxBytes: paddedIdxBytes,
  };
}

function buildGeometryBuffer(): Buffer {
  const geo = getGeometryLayout();
  const buffer = Buffer.alloc(geo.totalGeometryBytes);

  // Write plate outer (radius=1.0, y=0.0, height=0.06)
  writeDisc(buffer, geo.plateOuter, 1.0, 0.03, [0, 1, 0]);

  // Write plate inner (radius=0.82, y=0.06)
  writeDisc(buffer, geo.plateInner, 0.82, 0.065, [0, 1, 0]);

  // Write food disc (radius=0.7, y=0.08) — slight dome
  writeDisc(buffer, geo.food, 0.7, 0.09, [0, 1, 0]);

  return buffer;
}

function writeDisc(
  buffer: Buffer,
  layout: MeshLayout,
  radius: number,
  y: number,
  normal: number[]
) {
  const vertexCount = SEGMENTS + 1;

  // Positions: center + ring
  let offset = layout.posOffset;
  // Center vertex
  buffer.writeFloatLE(0, offset);
  buffer.writeFloatLE(y, offset + 4);
  buffer.writeFloatLE(0, offset + 8);
  offset += 12;

  for (let i = 0; i < SEGMENTS; i++) {
    const angle = (i / SEGMENTS) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    buffer.writeFloatLE(x, offset);
    buffer.writeFloatLE(y, offset + 4);
    buffer.writeFloatLE(z, offset + 8);
    offset += 12;
  }

  // Normals
  offset = layout.normOffset;
  for (let i = 0; i < vertexCount; i++) {
    buffer.writeFloatLE(normal[0], offset);
    buffer.writeFloatLE(normal[1], offset + 4);
    buffer.writeFloatLE(normal[2], offset + 8);
    offset += 12;
  }

  // UVs: map to circular disc
  offset = layout.uvOffset;
  // Center
  buffer.writeFloatLE(0.5, offset);
  buffer.writeFloatLE(0.5, offset + 4);
  offset += 8;

  for (let i = 0; i < SEGMENTS; i++) {
    const angle = (i / SEGMENTS) * Math.PI * 2;
    const u = 0.5 + Math.cos(angle) * 0.5;
    const v = 0.5 + Math.sin(angle) * 0.5;
    buffer.writeFloatLE(u, offset);
    buffer.writeFloatLE(v, offset + 4);
    offset += 8;
  }

  // Indices: triangle fan from center
  offset = layout.idxOffset;
  for (let i = 0; i < SEGMENTS; i++) {
    const next = (i + 1) % SEGMENTS;
    buffer.writeUInt16LE(0, offset); // center
    buffer.writeUInt16LE(i + 1, offset + 2);
    buffer.writeUInt16LE(next + 1, offset + 4);
    offset += 6;
  }
}
