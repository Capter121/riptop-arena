import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { hashFile } from './playwright-artifacts.mjs';
import {
  FORMAL_STAGE7_SHA256, isFormalStage7Report, normalizeMarkdownEvidence,
  readGitBlob, sha256Buffer,
} from './stage7-evidence-guards.mjs';

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

const anchorRefresh = readJson('reports/validation/phase3b-stage7-diagnosis-anchor-refresh.json');
if (anchorRefresh.changeReason !== 'WHITESPACE_ONLY_PRECOMMIT_NORMALIZATION' || anchorRefresh.approvedBy !== 'PROJECT_OWNER') {
  errors.push('diagnosis anchor refresh approval is invalid');
}
for (const entry of anchorRefresh.files ?? []) {
  verifyPath(entry.path, entry.currentSha256, `diagnosis anchor ${entry.path}`);
  if (!entry.normalizedSemanticEqual || !entry.previousBytesReconstructedAndHashVerified) errors.push(`diagnosis semantics not verified: ${entry.path}`);
  const current = readFileSync(resolve(root, entry.path), 'utf8');
  const reconstructed = entry.path.includes('tip-observation')
    ? current.replace('trace.zip`\n', 'trace.zip`  \n') + '\n'
    : current + '\n';
  if (sha256Buffer(Buffer.from(reconstructed, 'utf8')) !== entry.previousSha256) errors.push(`previous diagnosis SHA cannot be reconstructed: ${entry.path}`);
  if (normalizeMarkdownEvidence(reconstructed) !== normalizeMarkdownEvidence(current)) errors.push(`diagnosis semantic drift: ${entry.path}`);
  const gitPath = `battle-top-designer/${entry.path}`;
  if (sha256Buffer(readGitBlob(entry.currentSourceCommit, gitPath)) !== entry.currentSha256) errors.push(`current diagnosis Git blob mismatch: ${entry.path}`);
}

const formalEntry = substitute.postRepairEvidence.find(entry => entry.gate === 'Stage 7 combined 8/8');
if (!formalEntry || formalEntry.sha256 !== FORMAL_STAGE7_SHA256 || formalEntry.recoveredFrom !== 'GIT_OBJECT'
  || formalEntry.evidenceStatus !== 'PRESERVED_HISTORICAL_ARTIFACT' || formalEntry.historicalRunReexecuted !== false) {
  errors.push('formal Stage 7 evidence metadata is invalid');
} else {
  verifyPath(formalEntry.path, FORMAL_STAGE7_SHA256, 'formal Stage 7 report');
  const report = readJson(formalEntry.path);
  if (!isFormalStage7Report(report)) errors.push('collection output or non-8/8 report cannot replace formal Stage 7 evidence');
  const gitPath = `battle-top-designer/${formalEntry.path}`;
  if (sha256Buffer(readGitBlob(formalEntry.sourceCommit, gitPath)) !== FORMAL_STAGE7_SHA256) errors.push('formal Stage 7 Git blob mismatch');
}

const overwriteIncident = readJson('reports/validation/phase3b-stage7-playwright-report-overwrite-incident.json');
if (overwriteIncident.incidentId !== 'STAGE7-PLAYWRIGHT-REPORT-OVERWRITE-001'
  || overwriteIncident.overwrittenEvidenceType !== 'OVERWRITTEN_COLLECTION_OUTPUT'
  || overwriteIncident.overwrittenCollectionSha256 !== '067d7d4560eb57c4ec7709b266dbf35a1c7500a2c1212f01c42550609a0e1793'
  || overwriteIncident.formalReportSha256 !== FORMAL_STAGE7_SHA256) errors.push('Playwright overwrite incident is invalid');
if (JSON.stringify(substitute).includes(overwriteIncident.overwrittenCollectionSha256)) errors.push('overwritten collection SHA must not be a substitute evidence anchor');

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
const actualCounts = Object.fromEntries([...categories].map(category => [category, freeze.entries.filter(entry => entry.category === category).length]));
if (actualCounts.PRESERVED_HISTORICAL_ARTIFACT !== 19 || actualCounts.HISTORICAL_ARTIFACT_UNAVAILABLE !== 3
  || actualCounts.CURRENT_REVALIDATION_EVIDENCE !== 3 || freeze.classificationCounts?.changed !== false) errors.push('existing evidence classification counts changed');
if (freeze.collectionEvidencePolicy?.evidenceType !== 'COLLECTION_ONLY'
  || freeze.collectionEvidencePolicy?.formalEvidence !== false
  || freeze.collectionEvidencePolicy?.uniqueRunDirectoryRequired !== true) errors.push('collection evidence policy is invalid');
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
