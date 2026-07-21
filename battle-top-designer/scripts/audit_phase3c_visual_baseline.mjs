import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '..');
const repositoryRoot = resolve(projectRoot, '..');
const outputPath = resolve(projectRoot, 'reports/validation/phase3c-a-input-inventory.json');
const stage7Path = resolve(projectRoot, 'reports/validation/phase3b-stage7-playwright-repaired-v2.json');
const stage8Root = resolve(projectRoot, 'web-customizer/test-artifacts/stage8-delivery-20260720T152216Z-12bd89d');
const stage7Sha = '16b74303ffc08a9bc8f9d1c1a0bcc4734d49c154d63e26e7d2771b6a0734c8cc';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hashFile(path) {
  return sha256(readFileSync(path));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function projectPath(path) {
  return relative(projectRoot, path).replaceAll('\\', '/');
}

function fileRecord(path) {
  const contents = readFileSync(path);
  return { path: projectPath(path), bytes: contents.length, sha256: sha256(contents) };
}

function git(...args) {
  return execFileSync('git', ['-C', repositoryRoot, ...args], { encoding: 'utf8' }).trim();
}

function componentSize(componentType) {
  return { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[componentType];
}

function componentCount(type) {
  return { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }[type];
}

function parseGlb(path) {
  const buffer = readFileSync(path);
  if (buffer.readUInt32LE(0) !== 0x46546c67 || buffer.readUInt32LE(4) !== 2) {
    throw new Error(`Invalid GLB: ${path}`);
  }
  let offset = 12;
  let json;
  let bin = Buffer.alloc(0);
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    if (type === 0x004e4942) bin = chunk;
    offset += 8 + length;
  }
  if (!json) throw new Error(`Missing JSON chunk: ${path}`);
  return { json, bin };
}

function accessorRecord(gltf, bin, index) {
  const accessor = gltf.accessors[index];
  const view = gltf.bufferViews[accessor.bufferView];
  const stride = view.byteStride ?? componentSize(accessor.componentType) * componentCount(accessor.type);
  const byteOffset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const byteLength = stride * accessor.count;
  return {
    accessorIndex: index,
    count: accessor.count,
    type: accessor.type,
    componentType: accessor.componentType,
    byteOffset,
    byteLength,
    sha256: sha256(bin.subarray(byteOffset, byteOffset + byteLength)),
  };
}

function glbRecord(path) {
  const { json: gltf, bin } = parseGlb(path);
  const materials = gltf.materials ?? [];
  const meshPrimitives = (gltf.meshes ?? []).flatMap((mesh, meshIndex) =>
    mesh.primitives.map((primitive, primitiveIndex) => ({ meshIndex, primitiveIndex, primitive })),
  );
  const positions = [];
  const indices = [];
  const attributes = new Set();
  let triangles = 0;
  for (const entry of meshPrimitives) {
    for (const name of Object.keys(entry.primitive.attributes ?? {})) attributes.add(name);
    if (entry.primitive.attributes?.POSITION !== undefined) {
      positions.push(accessorRecord(gltf, bin, entry.primitive.attributes.POSITION));
    }
    if (entry.primitive.indices !== undefined) {
      const index = accessorRecord(gltf, bin, entry.primitive.indices);
      indices.push(index);
      if ((entry.primitive.mode ?? 4) === 4) triangles += index.count / 3;
    }
  }
  return {
    ...fileRecord(path),
    meshCount: (gltf.meshes ?? []).length,
    primitiveCount: meshPrimitives.length,
    triangleCount: triangles,
    attributes: [...attributes].sort(),
    texcoord0PrimitiveCount: meshPrimitives.filter(({ primitive }) => primitive.attributes?.TEXCOORD_0 !== undefined).length,
    texcoord1PrimitiveCount: meshPrimitives.filter(({ primitive }) => primitive.attributes?.TEXCOORD_1 !== undefined).length,
    imageCount: (gltf.images ?? []).length,
    textureCount: (gltf.textures ?? []).length,
    materialSlotOrder: meshPrimitives.map(({ meshIndex, primitiveIndex, primitive }) => ({
      meshIndex,
      primitiveIndex,
      materialIndex: primitive.material ?? null,
      materialName: primitive.material === undefined ? null : materials[primitive.material]?.name ?? null,
    })),
    positions,
    indices,
    nodeTransforms: (gltf.nodes ?? []).map((node, nodeIndex) => ({
      nodeIndex,
      name: node.name ?? null,
      mesh: node.mesh ?? null,
      matrix: node.matrix ?? null,
      translation: node.translation ?? [0, 0, 0],
      rotation: node.rotation ?? [0, 0, 0, 1],
      scale: node.scale ?? [1, 1, 1],
    })),
  };
}

if (existsSync(outputPath)) throw new Error(`Refusing to overwrite baseline inventory: ${outputPath}`);
for (const path of [stage7Path, resolve(stage8Root, 'manifest.json'), resolve(stage8Root, 'hashes.json')]) {
  if (!existsSync(path)) throw new Error(`Required protected evidence missing: ${path}`);
}

const materialPath = resolve(projectRoot, 'specs/materials.json');
const interfacePath = resolve(projectRoot, 'specs/interfaces.json');
const materialCatalog = readJson(materialPath);
const partDirectory = resolve(projectRoot, 'specs/parts');
const stage8Manifest = readJson(resolve(stage8Root, 'manifest.json'));
const stage8Hashes = readJson(resolve(stage8Root, 'hashes.json'));
const actualStage7Sha = hashFile(stage7Path);

if (actualStage7Sha !== stage7Sha) throw new Error(`Stage 7 formal report SHA mismatch: ${actualStage7Sha}`);
if (stage8Manifest.status !== 'PASS' || Object.values(stage8Manifest.modeStatus ?? {}).some((status) => status !== 'PASS')) {
  throw new Error('Formal Stage 8 evidence is not a completed PASS run');
}

const parts = readdirSync(partDirectory)
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.slice(0, -'.json'.length))
  .sort()
  .map((id) => {
  const specPath = resolve(partDirectory, `${id}.json`);
  const glbPath = resolve(projectRoot, 'public/models/parts', `${id}.glb`);
  if (!existsSync(specPath) || !existsSync(glbPath)) throw new Error(`Missing part input: ${id}`);
  const spec = readJson(specPath);
  if (spec.interface_id !== 'NSS-V1') throw new Error(`Unexpected interface for ${id}: ${spec.interface_id}`);
  return {
    id,
    partType: spec.part_type,
    interfaceId: spec.interface_id,
    materialSlots: spec.material_slots,
    partSpec: fileRecord(specPath),
    glb: glbRecord(glbPath),
  };
  });

const primitiveCount = parts.reduce((total, part) => total + part.glb.primitiveCount, 0);
const input = {
  schemaVersion: 'NSS-PHASE3C-A-INPUT-INVENTORY-V1',
  headCommit: git('rev-parse', 'HEAD'),
  branch: git('branch', '--show-current'),
  materialCatalog: { ...fileRecord(materialPath), schemaVersion: materialCatalog.schema_version, materialIds: materialCatalog.materials.map(({ id }) => id) },
  interfaces: fileRecord(interfacePath),
  stage7FormalReport: { ...fileRecord(stage7Path), expectedSha256: stage7Sha },
  stage8FormalRun: {
    runId: stage8Manifest.runId,
    headCommit: stage8Manifest.headCommit,
    manifest: fileRecord(resolve(stage8Root, 'manifest.json')),
    hashes: fileRecord(resolve(stage8Root, 'hashes.json')),
    status: stage8Manifest.status,
    completedAt: stage8Manifest.completedAt,
    modeStatus: stage8Manifest.modeStatus,
    declaredArtifactHashCount: Object.keys(stage8Hashes.hashes ?? {}).length,
  },
  geometryTotals: {
    partCount: parts.length,
    primitiveCount,
    triangleCount: parts.reduce((total, part) => total + part.glb.triangleCount, 0),
    texcoord0PrimitiveCount: parts.reduce((total, part) => total + part.glb.texcoord0PrimitiveCount, 0),
    texcoord1PrimitiveCount: parts.reduce((total, part) => total + part.glb.texcoord1PrimitiveCount, 0),
  },
  parts,
};

if (parts.length !== 16 || primitiveCount !== 72 || input.geometryTotals.texcoord0PrimitiveCount !== 0 || input.geometryTotals.texcoord1PrimitiveCount !== 0) {
  throw new Error('Phase 3C-A input contract does not match the approved 16-part / 72-primitive / no-UV baseline');
}

const report = { ...input, generatedAt: new Date().toISOString(), inputDigest: sha256(JSON.stringify(input)) };
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output: projectPath(outputPath), inputDigest: report.inputDigest, parts: parts.length, primitives: primitiveCount }, null, 2));
