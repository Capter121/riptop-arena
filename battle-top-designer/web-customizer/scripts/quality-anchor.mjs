import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { hashFile } from './playwright-artifacts.mjs';

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function slash(value) { return value.replaceAll('\\', '/'); }

function git(...args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  return result.stdout;
}

function writeJsonAtomic(path, value) {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temporary, path);
}

export function sanitizeLog(value, workspace = process.cwd()) {
  return value.replaceAll(workspace, '<WORKSPACE>').replaceAll(slash(workspace), '<WORKSPACE>');
}

export function summarizeVitest(result) {
  return {
    total: result.numTotalTests,
    passed: result.numPassedTests,
    failed: result.numFailedTests,
    skipped: result.numPendingTests,
    status: result.success && result.numFailedTests === 0 ? 'PASS' : 'FAIL',
  };
}

export function workspaceIdentity(workspace = process.cwd()) {
  const relevant = ['package-lock.json', 'package.json', 'tsconfig.json', 'vite.config.ts', 'playwright.stage7.config.ts'];
  const configHashes = Object.fromEntries(relevant.filter(path => existsSync(resolve(workspace, path)))
    .map(path => [path, hashFile(resolve(workspace, path))]));
  const identity = {
    headCommit: git('rev-parse', 'HEAD').trim(),
    gitStatusSummary: git('status', '--porcelain=v1').trim().split(/\r?\n/).filter(Boolean),
    trackedWorkspaceDiffSha256: sha256(git('diff', '--binary')),
    stagedDiffSha256: sha256(git('diff', '--cached', '--binary')),
    packageLockSha256: configHashes['package-lock.json'] ?? null,
    relevantConfigSha256: configHashes,
  };
  return { ...identity, workspaceDigest: sha256(JSON.stringify(identity)) };
}

export function artifactHashes(runDir, paths) {
  return Object.fromEntries(paths.filter(path => existsSync(path))
    .map(path => [slash(relative(runDir, path)), hashFile(path)]));
}

export function qualityRunId(date, shortCommit) {
  const timestamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `stage7-quality-anchor-${timestamp}-${shortCommit}`;
}

export function executeQualityAnchor({ workspace = process.cwd(), runId } = {}) {
  const before = workspaceIdentity(workspace);
  const shortCommit = before.headCommit.slice(0, 7);
  const actualRunId = runId ?? qualityRunId(new Date(), shortCommit);
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(actualRunId)) throw new Error(`Invalid run id: ${actualRunId}`);
  const runDir = resolve(workspace, 'test-artifacts', actualRunId);
  if (existsSync(runDir)) throw new Error(`Quality anchor run already exists: ${actualRunId}`);
  const logsDir = join(runDir, 'logs');
  mkdirSync(logsDir, { recursive: true });
  const manifestPath = join(runDir, 'manifest.json');
  const unitResultPath = join(runDir, 'unit-test-result.json');
  const typecheckResultPath = join(runDir, 'typecheck-result.json');
  const buildResultPath = join(runDir, 'build-result.json');
  const hashesPath = join(runDir, 'artifact-hashes.json');
  const startedAt = new Date().toISOString();
  const commands = [
    'npm run test:unit -- --reporter=json --outputFile=<RUN_DIR>/unit-test-result.json',
    'npm exec -- tsc --noEmit',
    'npm run build',
  ];
  const manifest = {
    schemaVersion: 'NSS-QUALITY-ANCHOR-RUN-V1', evidenceType: 'CURRENT_REVALIDATION_EVIDENCE',
    runId: actualRunId, headCommit: before.headCommit, workspaceIdentityBefore: before,
    workspaceDigestBefore: before.workspaceDigest, workspaceDigestAfter: null,
    startedAt, completedAt: null, status: 'RUNNING', commands, exitCodes: {},
    unitTestSummary: null, typecheckSummary: null, buildSummary: null,
    artifactHashes: {}, historicalEvidenceRecovered: false,
  };
  writeJsonAtomic(manifestPath, manifest);

  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('npm_execpath is required; run through npm run quality:anchor.');
  const runNpm = (label, args) => {
    const result = spawnSync(process.execPath, [npmCli, ...args], { cwd: workspace, encoding: 'utf8' });
    writeFileSync(join(logsDir, `${label}.log`), sanitizeLog(`${result.stdout ?? ''}${result.stderr ?? ''}`, workspace), 'utf8');
    if (result.error) throw result.error;
    return result.status ?? 1;
  };

  let status = 'FAIL';
  try {
    manifest.exitCodes.unit = runNpm('unit', ['run', 'test:unit', '--', '--reporter=json', `--outputFile=${unitResultPath}`]);
    if (!existsSync(unitResultPath)) throw new Error('Unit-test JSON result was not created.');
    const rawUnit = JSON.parse(readFileSync(unitResultPath, 'utf8'));
    manifest.unitTestSummary = summarizeVitest(rawUnit);
    writeJsonAtomic(unitResultPath, { schemaVersion: 'NSS-UNIT-RESULT-V1', ...manifest.unitTestSummary });
    if (manifest.exitCodes.unit !== 0 || manifest.unitTestSummary.status !== 'PASS') throw new Error('Unit-test gate failed.');

    manifest.exitCodes.typecheck = runNpm('typecheck', ['exec', '--', 'tsc', '--noEmit']);
    manifest.typecheckSummary = { status: manifest.exitCodes.typecheck === 0 ? 'PASS' : 'FAIL' };
    writeJsonAtomic(typecheckResultPath, { schemaVersion: 'NSS-TYPECHECK-RESULT-V1', ...manifest.typecheckSummary, exitCode: manifest.exitCodes.typecheck });
    if (manifest.exitCodes.typecheck !== 0) throw new Error('TypeScript gate failed.');

    manifest.exitCodes.build = runNpm('build', ['run', 'build']);
    manifest.buildSummary = { status: manifest.exitCodes.build === 0 ? 'PASS' : 'FAIL' };
    writeJsonAtomic(buildResultPath, { schemaVersion: 'NSS-BUILD-RESULT-V1', ...manifest.buildSummary, exitCode: manifest.exitCodes.build });
    if (manifest.exitCodes.build !== 0) throw new Error('Production-build gate failed.');
    status = 'PASS';
  } finally {
    const after = workspaceIdentity(workspace);
    manifest.workspaceDigestAfter = after.workspaceDigest;
    manifest.workspaceIdentityAfter = after;
    manifest.completedAt = new Date().toISOString();
    if (after.workspaceDigest !== before.workspaceDigest) status = 'WORKSPACE_CHANGED';
    const artifacts = [unitResultPath, typecheckResultPath, buildResultPath,
      join(logsDir, 'unit.log'), join(logsDir, 'typecheck.log'), join(logsDir, 'build.log')];
    manifest.artifactHashes = artifactHashes(runDir, artifacts);
    writeJsonAtomic(hashesPath, { schemaVersion: 'NSS-ARTIFACT-HASHES-V1', artifacts: manifest.artifactHashes });
    manifest.artifactHashes[basename(hashesPath)] = hashFile(hashesPath);
    manifest.status = status;
    writeJsonAtomic(manifestPath, manifest);
  }
  if (status !== 'PASS') throw new Error(`Quality anchor did not pass: ${status}`);
  return { runDir, manifest };
}
