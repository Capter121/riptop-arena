import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const project = resolve(import.meta.dirname, '../..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));

export function validateManifest(manifest) {
  const errors = [];
  if (manifest.schema_version !== 1) errors.push('SCHEMA_VERSION');
  if (manifest.part_count !== 16 || manifest.parts?.length !== 16) errors.push('PART_COUNT');
  if (manifest.combination_count !== 288) errors.push('COMBINATION_COUNT');
  if (manifest.interface_id !== 'NSS-V1') errors.push('INTERFACE_ID');
  if (!/^[a-f0-9]{40}$/i.test(manifest.phase2c_evidence_commit ?? '')) errors.push('INVALID_PHASE2C_EVIDENCE_COMMIT');
  for (const key of ['interface_sha256', 'phase2c_digest', 'phase2c_final_gate_sha256', 'phase2c_matrix_sha256']) {
    if (!/^[a-f0-9]{64}$/i.test(manifest[key] ?? '')) errors.push(`INVALID_${key.toUpperCase()}`);
  }
  const ids = (manifest.parts ?? []).map(part => part.id);
  if (new Set(ids).size !== ids.length) errors.push('DUPLICATE_PART_ID');
  if ((manifest.parts ?? []).some(part => !/^[a-f0-9]{64}$/i.test(part.sha256 ?? ''))) errors.push('INVALID_PART_HASH');
  return errors;
}

export async function captureManifest() {
  const partDir = resolve(project, 'public/models/parts');
  const partFiles = (await readdir(partDir)).filter(name => name.endsWith('.glb')).sort();
  const parts = await Promise.all(partFiles.map(async name => ({
    id: name.slice(0, -4),
    file: `public/models/parts/${name}`,
    sha256: sha256(await readFile(resolve(partDir, name))),
  })));
  const interfaceBytes = await readFile(resolve(project, 'specs/interfaces.json'));
  const phase2cFinalGateBytes = await readFile(resolve(project, 'reports/validation/phase2c-final-gate.json'));
  const phase2cMatrixBytes = await readFile(resolve(project, 'reports/validation/phase2c-combination-matrix.json'));
  const phase2c = JSON.parse(phase2cFinalGateBytes.toString('utf8'));
  const matrixBytes = await readFile(resolve(project, 'reports/assembly_matrix.csv'));
  const lockBytes = await readFile(resolve(project, 'web-customizer/package-lock.json'));
  const waiverBytes = await readFile(resolve(project, 'reports/validation/phase2b-r1-provisional-review-waiver.csv'));
  const git = (...args) => execFileSync('git', args, { cwd: project, encoding: 'utf8' }).trim();
  const baselineCommit = git('rev-parse', 'v0.2.0-rc1-technical-baseline');
  const phase2cEvidenceCommit = git('rev-parse', '9590780');
  git('diff', '--quiet', baselineCommit, '--', 'specs/interfaces.json', 'public/models/parts');
  git('diff', '--quiet', phase2cEvidenceCommit, '--', 'reports/validation/phase2c-final-gate.json', 'reports/validation/phase2c-combination-matrix.json');
  const manifest = {
    schema_version: 1,
    captured_at: new Date().toISOString(),
    source_commit: git('rev-parse', 'HEAD'),
    phase3a_implementation_commit: 'e4ec258b3b51bf68298634446fccc0abad1e55bf',
    phase3a_validation_commit: 'd5b4db9e486065170aebb65635a20716cfa8d0b5',
    baseline_id: 'v0.2.0-rc1-technical-baseline',
    baseline_commit: baselineCommit,
    baseline_status: 'PROVISIONAL_NOT_FINAL',
    visual_review_status: 'Phase 2B visual review deferred pending real reviewers',
    interface_id: 'NSS-V1',
    interface_sha256: sha256(interfaceBytes),
    part_count: parts.length,
    parts,
    combination_count: phase2c.combination_count,
    phase2c_digest: phase2c.normalized_digest,
    phase2c_evidence_commit: phase2cEvidenceCommit,
    phase2c_final_gate_sha256: sha256(phase2cFinalGateBytes),
    phase2c_matrix_sha256: sha256(phase2cMatrixBytes),
    assembly_matrix_sha256: sha256(matrixBytes),
    package_lock_sha256: sha256(lockBytes),
    waiver_path: 'reports/validation/phase2b-r1-provisional-review-waiver.csv',
    waiver_sha256: sha256(waiverBytes),
    notices: [
      'Human visual review remains pending.',
      'Development continued under a documented provisional internal-prototype decision.',
    ],
  };
  const errors = validateManifest(manifest);
  if (errors.length) throw new Error(`PHASE3B_INPUT_MANIFEST_INVALID: ${errors.join(',')}`);
  return manifest;
}

async function main() {
  const manifest = await captureManifest();
  const output = resolve(project, 'reports/validation/phase3b-input-manifest.json');
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`PHASE3B_INPUT_MANIFEST=PASS\nPHASE3B_INPUT_MANIFEST_PATH=${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
