import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const project = resolve(import.meta.dirname, '../..');
const readJson = path => JSON.parse(readFileSync(resolve(project, path), 'utf8'));
const hash = path => createHash('sha256').update(readFileSync(resolve(project, path))).digest('hex');
const expected = {
  previousSha256: '6349b23de536ffaba88bdd5686043a96230f20e371207d71481186ff8ee33a00',
  currentSha256: '3fa6f4d203d95fc6e59a2740caa831bcfba4aa2ae65bc2b136ab9716440080bf',
  producerCommit: '2f967e8f15f0b3eaf231d239900888441d141f56',
  changeReason: 'VERIFIER_RUNTIME_CLASSIFICATION_SCHEMA_UPGRADE',
  approvedBy: 'PROJECT_OWNER',
};
const audit = readJson('reports/validation/phase3b-stage7-substitute-anchor-refresh.json');
const substitute = readJson('reports/validation/phase3b-stage7-substitute-evidence-manifest.json');
const errors = [];

for (const [key, value] of Object.entries(expected)) {
  if (audit[key] !== value) errors.push(`${key}: expected ${value}, got ${audit[key]}`);
}
for (const key of ['baselineIdentityUnchanged', 'assetSetUnchanged', 'assetHashesUnchanged']) {
  if (audit[key] !== true) errors.push(`${key} must be true`);
}
if (audit.historicalEvidenceRecovered !== false) errors.push('historicalEvidenceRecovered must be false');
if (hash(audit.evidencePath) !== audit.currentSha256) errors.push('current evidence SHA-256 mismatch');
const baselineEntry = substitute.postRepairEvidence.find(entry => entry.gate === 'provisional baseline');
if (baselineEntry?.path !== audit.evidencePath || baselineEntry?.sha256 !== audit.currentSha256) {
  errors.push('substitute manifest does not reference the refreshed anchor');
}

console.log(JSON.stringify({ result: errors.length ? 'FAIL' : 'PASS', ...expected, errors }, null, 2));
if (errors.length) process.exitCode = 1;
