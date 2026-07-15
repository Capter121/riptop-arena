import assert from 'node:assert/strict';
import test from 'node:test';
import { validateManifest } from '../../scripts/capture-phase3b-baseline.mjs';

const valid = {
  schema_version: 1,
  part_count: 16,
  combination_count: 288,
  interface_id: 'NSS-V1',
  interface_sha256: 'a'.repeat(64),
  phase2c_digest: 'b'.repeat(64),
  phase2c_evidence_commit: '9590780'.padEnd(40, '0'),
  phase2c_final_gate_sha256: 'c'.repeat(64),
  phase2c_matrix_sha256: 'd'.repeat(64),
  parts: Array.from({ length: 16 }, (_, index) => ({ id: `part_${index}`, sha256: String(index).padStart(64, '0') })),
};

test('accepts the frozen Phase 3B manifest shape', () => {
  assert.deepEqual(validateManifest(valid), []);
});

test('rejects missing parts, duplicate hashes, and matrix drift', () => {
  const invalid = structuredClone(valid);
  invalid.part_count = 15;
  invalid.combination_count = 287;
  invalid.parts[1].id = invalid.parts[0].id;
  invalid.phase2c_evidence_commit = '';
  assert.ok(validateManifest(invalid).length >= 3);
});

test('requires the approved Phase 2C evidence commit and report hashes', () => {
  const invalid = structuredClone(valid);
  invalid.phase2c_evidence_commit = '';
  invalid.phase2c_final_gate_sha256 = '';
  invalid.phase2c_matrix_sha256 = '';
  assert.deepEqual(validateManifest(invalid), [
    'INVALID_PHASE2C_EVIDENCE_COMMIT',
    'INVALID_PHASE2C_FINAL_GATE_SHA256',
    'INVALID_PHASE2C_MATRIX_SHA256',
  ]);
});
