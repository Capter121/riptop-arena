import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { hashFile } from './playwright-artifacts.mjs';

const root = resolve('..');
const readJson = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const errors = [];
const verifyPath = (path, sha256, label) => {
  if (!path || !existsSync(resolve(root, path))) { errors.push(`${label}: missing ${path}`); return; }
  if (sha256 && hashFile(resolve(root, path)) !== sha256) errors.push(`${label}: hash mismatch ${path}`);
};

const originalHash = '69631e615837580df5809fc146698df341c52f3c967d68c56fe1fac810de5e37';
verifyPath('reports/validation/phase3b-stage7-playwright.json', originalHash, 'original failure JSON');

const substitute = readJson('reports/validation/phase3b-stage7-substitute-evidence-manifest.json');
if (substitute.acceptedBy !== 'PROJECT_OWNER') errors.push('substitute acceptedBy must be PROJECT_OWNER');
if (substitute.acceptanceDecision !== 'ACCEPTED_WITH_DOCUMENTED_EVIDENCE_LOSS') errors.push('invalid substitute decision');
for (const [index, entry] of [...substitute.preservedEvidence, ...substitute.postRepairEvidence].entries()) {
  if (entry.path) verifyPath(entry.path, entry.sha256, `substitute entry ${index}`);
  for (const path of entry.paths ?? []) verifyPath(path, null, `substitute entry ${index}`);
}

const traceIncident = readJson('reports/validation/phase3b-stage7-evidence-preservation-incident.json');
if (traceIncident.incidentId !== 'STAGE7-TRACE-LOSS-001'
  || traceIncident.status !== 'ACCEPTED_WITH_DOCUMENTED_EVIDENCE_LOSS'
  || traceIncident.artifactAvailability !== 'UNAVAILABLE_AFTER_PLAYWRIGHT_OUTPUT_CLEANUP'
  || traceIncident.acceptedBy !== 'PROJECT_OWNER') {
  errors.push('trace-loss incident acceptance is invalid');
}

const missing = readJson('reports/validation/phase3b-stage7-missing-quality-anchors-incident.json');
if (missing.acceptedBy !== 'PROJECT_OWNER') errors.push('missing-anchor acceptedBy must be PROJECT_OWNER');
if (missing.status !== 'ACCEPTED_WITH_DOCUMENTED_MISSING_HISTORICAL_QUALITY_ANCHORS') errors.push('invalid missing-anchor status');
if (missing.historicalEvidenceRecovered !== false) errors.push('historical quality evidence must remain unrecovered');

const freeze = readJson('reports/validation/phase3b-stage7-existing-evidence-freeze.json');
const categories = new Set(freeze.entries.map(entry => entry.category));
for (const category of ['PRESERVED_HISTORICAL_ARTIFACT', 'HISTORICAL_ARTIFACT_UNAVAILABLE', 'CURRENT_REVALIDATION_EVIDENCE']) {
  if (!categories.has(category)) errors.push(`freeze category missing: ${category}`);
}
for (const [index, entry] of freeze.entries.entries()) {
  if (entry.category === 'HISTORICAL_ARTIFACT_UNAVAILABLE') {
    if (entry.path !== null || entry.exists !== false || entry.sha256 !== null) errors.push(`freeze unavailable entry ${index} is invalid`);
  } else verifyPath(entry.path, entry.sha256, `freeze entry ${index}`);
}

const qualityEntry = substitute.postRepairEvidence.find(entry => entry.gate === 'current quality anchor');
if (!qualityEntry) errors.push('current quality anchor entry missing');
else {
  verifyPath(qualityEntry.path, qualityEntry.sha256, 'current quality anchor manifest');
  const quality = readJson(qualityEntry.path);
  if (quality.evidenceType !== 'CURRENT_REVALIDATION_EVIDENCE' || quality.status !== 'PASS') errors.push('current quality anchor classification/status invalid');
  if (quality.unitTestSummary?.total !== 171 || quality.unitTestSummary?.passed !== 171) errors.push('current quality anchor unit result is not 171/171');
  if (quality.typecheckSummary?.status !== 'PASS' || quality.buildSummary?.status !== 'PASS') errors.push('current quality anchor TypeScript/build failed');
  if (quality.workspaceDigestBefore !== quality.workspaceDigestAfter) errors.push('current quality anchor workspace digest changed');
  if (quality.historicalEvidenceRecovered !== false) errors.push('current quality anchor must not claim historical recovery');
}

const smoke = readJson('reports/validation/phase3b-playwright-artifact-isolation-smoke.json');
if (smoke.status !== 'PASS' || !smoke.runA.unchangedAfterRunB || !smoke.differentRunDirectories || !smoke.runAExistsAfterRunB || smoke.sharedDefaultTestResultsChanged) {
  errors.push('artifact isolation smoke assertions are not all satisfied');
}

if (errors.length) {
  process.stderr.write(`${JSON.stringify({ result: 'FAIL', errors }, null, 2)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({ result: 'PASS', originalFailureJsonSha256: originalHash,
    preservedEntries: freeze.entries.filter(entry => entry.category === 'PRESERVED_HISTORICAL_ARTIFACT').length,
    unavailableEntries: freeze.entries.filter(entry => entry.category === 'HISTORICAL_ARTIFACT_UNAVAILABLE').length,
    currentRevalidationEntries: freeze.entries.filter(entry => entry.category === 'CURRENT_REVALIDATION_EVIDENCE').length }, null, 2)}\n`);
}
