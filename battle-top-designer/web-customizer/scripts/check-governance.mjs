import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const project = resolve(import.meta.dirname, '../..');
const waiverPath = resolve(project, 'reports/validation/phase2b-r1-provisional-review-waiver.csv');
const gatePath = resolve(project, 'reports/validation/phase2c-final-gate.json');
const decisionPath = resolve(project, 'docs/decisions/phase3-prototype-under-provisional-review.md');
const expected = {
  visual_review_status: 'DEFERRED_PENDING_REAL_REVIEW',
  technical_continuation_status: 'AUTHORIZED_WITH_CONDITIONS',
  phase2c_allowed: 'true',
  baseline_status: 'PROVISIONAL_NOT_FINAL',
  production_release_allowed: 'false',
};
const notice = [
  'Human visual review remains pending.',
  'Development continued under a documented provisional internal-prototype decision.',
];

function parseCsv(text) {
  const [header, row] = text.trim().split(/\r?\n/);
  const keys = header.split(',');
  const values = row.match(/(?:"([^"]*(?:""[^"]*)*)"|([^,]*))(?:,|$)/g)
    .map(value => value.replace(/,$/, '').replace(/^"|"$/g, '').replaceAll('""', '"'));
  return Object.fromEntries(keys.map((key, index) => [key, values[index]]));
}

const waiverText = await readFile(waiverPath, 'utf8');
const waiver = parseCsv(waiverText);
const gate = JSON.parse(await readFile(gatePath, 'utf8'));
const decision = await readFile(decisionPath, 'utf8');
const errors = [];
for (const [key, value] of Object.entries(expected)) {
  if (waiver[key] !== value) errors.push(`${key}: expected ${value}, got ${waiver[key]}`);
}
if (new Date(`${waiver.expires_on}T23:59:59+08:00`) < new Date()) errors.push('waiver expired');
if (gate.result !== 'PASS' || gate.combination_count !== 288) errors.push('Phase 2C gate is not PASS/288');
if (gate.visual_review_status !== 'Phase 2B visual review deferred pending real reviewers') errors.push('visual review was closed or changed');
for (const line of notice) if (!decision.includes(line)) errors.push(`decision notice missing: ${line}`);
const result = {
  result: errors.length ? 'FAIL' : 'PASS',
  waiver_sha256: createHash('sha256').update(waiverText).digest('hex'),
  expires_on: waiver.expires_on,
  baseline_status: waiver.baseline_status,
  errors,
};
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;
