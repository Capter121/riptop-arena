import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const project = resolve(import.meta.dirname, '../..');
const summary = JSON.parse(readFileSync(resolve(project, 'reports/validation/phase3b-stage7-summary.json'), 'utf8'));
const template = JSON.parse(readFileSync(resolve(project, 'reports/validation/phase3b-usability-test-template.json'), 'utf8'));
const errors = [];
const expectedGates = {
  mobileFocused: [25, 25], mobileFullProject: [40, 40], desktop: [4, 4],
  stage7Combined: [8, 8], legacyPlaywright: [18, 18], currentUnitRevalidation: [171, 171],
};

if (summary.status !== 'PASS_WITH_DOCUMENTED_HISTORICAL_EVIDENCE_GAPS') errors.push('invalid Stage 7 status');
if (summary.phase3bStatus !== 'Phase 3B changes requested') errors.push('Phase 3B status was closed');
if (summary.humanVisualReview !== 'PENDING' || summary.baseline !== 'PROVISIONAL_NOT_FINAL') errors.push('governance status changed');
for (const [name, [passed, total]] of Object.entries(expectedGates)) {
  const gate = summary.gates?.[name];
  if (gate?.passed !== passed || gate?.total !== total || gate?.status !== 'PASS') errors.push(`invalid gate: ${name}`);
}
if (summary.gates?.typescript?.status !== 'PASS' || summary.gates?.productionBuild?.status !== 'PASS') errors.push('quality gate failed');
for (const incident of ['STAGE7-TRACE-LOSS-001', 'STAGE7-MISSING-QUALITY-ANCHORS-001']) {
  if (!summary.incidents?.includes(incident)) errors.push(`incident missing: ${incident}`);
}
if (Object.entries(summary.historicalEvidence ?? {}).some(([key, value]) => key.endsWith('Recovered') && value !== false)) errors.push('historical recovery was claimed');
if (template.schemaVersion !== 'NSS-USABILITY-TEST-V1' || template.governance?.humanVisualReview !== 'PENDING'
  || template.governance?.baseline !== 'PROVISIONAL_NOT_FINAL' || template.tasks?.length !== 6) errors.push('invalid usability template');

console.log(JSON.stringify({ result: errors.length ? 'FAIL' : 'PASS', status: summary.status, errors }, null, 2));
if (errors.length) process.exitCode = 1;
