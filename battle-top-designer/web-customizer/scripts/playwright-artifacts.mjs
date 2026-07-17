import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';

function slash(path) { return path.replaceAll('\\', '/'); }

function assertRunId(runId) {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(runId)) throw new Error(`Invalid run id: ${runId}`);
}

function writeJsonAtomic(path, value) {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temporary, path);
}

function filesBelow(root, current = root) {
  if (!existsSync(current)) return [];
  return readdirSync(current, { withFileTypes: true }).flatMap(entry => {
    const path = join(current, entry.name);
    return entry.isDirectory() ? filesBelow(root, path) : [path];
  });
}

export function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function buildArtifactPaths(artifactRoot, runId, evidenceType = 'FORMAL_TEST_EXECUTION') {
  assertRunId(runId);
  const runDir = resolve(artifactRoot, runId);
  const reporterName = evidenceType === 'COLLECTION_ONLY' ? 'collection-report.json' : 'reporter.json';
  return {
    runId,
    runDir,
    manifestPath: join(runDir, 'manifest.json'),
    outputDir: join(runDir, 'test-results'),
    reporterPath: join(runDir, reporterName),
    htmlReportDir: join(runDir, 'playwright-report'),
  };
}

export function beginArtifactRun({ artifactRoot, runId, gateName, commit, workspaceDigest,
  retry, workers, timeoutPolicy, testSelection, incidentEvidenceProtected = false,
  evidenceType = 'FORMAL_TEST_EXECUTION' }) {
  const paths = buildArtifactPaths(artifactRoot, runId, evidenceType);
  mkdirSync(resolve(artifactRoot), { recursive: true });
  if (existsSync(paths.runDir)) throw new Error(`Artifact run already exists: ${runId}`);
  mkdirSync(paths.runDir);
  mkdirSync(paths.outputDir);
  const relativeRun = posix.join('test-artifacts', runId);
  const manifest = {
    schemaVersion: 'NSS-PLAYWRIGHT-ARTIFACT-RUN-V1', runId, gateName, evidenceType, commit, workspaceDigest,
    startedAt: new Date().toISOString(), completedAt: null, status: 'RUNNING',
    outputDir: posix.join(relativeRun, 'test-results'),
    reporterPath: posix.join(relativeRun, evidenceType === 'COLLECTION_ONLY' ? 'collection-report.json' : 'reporter.json'),
    htmlReportDir: posix.join(relativeRun, 'playwright-report'),
    retry, workers, timeoutPolicy, testSelection, incidentEvidenceProtected, artifactHashes: {},
  };
  writeJsonAtomic(paths.manifestPath, manifest);
  return { ...paths, manifest };
}

export function finalizeArtifactRun(run, status) {
  if (!['PASS', 'FAIL', 'ABORTED'].includes(status)) throw new Error(`Invalid final status: ${status}`);
  const artifactHashes = Object.fromEntries(filesBelow(run.runDir)
    .filter(path => path !== run.manifestPath && !path.endsWith('.tmp')).sort()
    .map(path => [slash(path.slice(run.runDir.length + 1)), hashFile(path)]));
  const manifest = { ...run.manifest, completedAt: new Date().toISOString(), status, artifactHashes };
  writeJsonAtomic(run.manifestPath, manifest);
  return manifest;
}

export function planArtifactCleanup({ artifactRoot }) {
  if (!existsSync(artifactRoot)) return { dryRun: true, candidates: [], protected: [] };
  const candidates = [];
  const protectedRuns = [];
  for (const entry of readdirSync(artifactRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(artifactRoot, entry.name, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest.incidentEvidenceProtected) protectedRuns.push(entry.name);
    else candidates.push(entry.name);
  }
  return { dryRun: true, candidates: candidates.sort(), protected: protectedRuns.sort() };
}
