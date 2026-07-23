import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

export const STAGE8_EVIDENCE_TYPE = 'STAGE8_CURRENT_DELIVERY_REVALIDATION';
export const STAGE8_MACHINE_ERROR_CODES = Object.freeze({
  COMMAND_LAUNCH_FAILED: 'STAGE8_COMMAND_LAUNCH_FAILED',
  COMMAND_EXECUTION_FAILED: 'STAGE8_COMMAND_EXECUTION_FAILED',
  MACHINE_OUTPUT_INVALID: 'STAGE8_MACHINE_OUTPUT_INVALID',
  MACHINE_OUTPUT_SCHEMA_INVALID: 'STAGE8_MACHINE_OUTPUT_SCHEMA_INVALID',
});
export const STAGE8_MACHINE_JSON_COMMANDS = Object.freeze({
  finalBaselineIntegrity: Object.freeze({
    gateName: 'final-baseline-integrity',
    args: Object.freeze(['scripts/check-final-baseline-integrity.mjs']),
  }),
  phase2cEvidenceFreeze: Object.freeze({
    gateName: 'phase2c-evidence-freeze',
    args: Object.freeze(['scripts/check-phase2c-evidence-freeze.mjs']),
  }),
  stage7Evidence: Object.freeze({
    gateName: 'stage7-evidence',
    args: Object.freeze(['scripts/validate-stage7-evidence.mjs']),
  }),
  governance: Object.freeze({
    gateName: 'governance',
    args: Object.freeze(['scripts/check-governance.mjs']),
  }),
});
export const STAGE8_DIRECTORIES = Object.freeze([
  'unit',
  'typecheck',
  'build',
  'collection',
  'runtime-smoke',
  'playwright-mobile-focused',
  'playwright-mobile-full',
  'playwright-desktop',
  'playwright-stage7-combined',
  'playwright-legacy',
  'governance',
  'baseline',
  'evidence',
]);

export function classifyStage8MachineOutput(processResult, validate) {
  const process = {
    status: processResult.status ?? null,
    signal: processResult.signal ?? null,
    errorCode: processResult.error?.code ?? null,
    stdout: String(processResult.stdout ?? ''),
    stderr: String(processResult.stderr ?? ''),
  };
  if (processResult.error || process.status === null) {
    return { result: 'FAIL', errorCode: STAGE8_MACHINE_ERROR_CODES.COMMAND_LAUNCH_FAILED, payload: null, process };
  }
  if (process.signal || process.status !== 0) {
    return { result: 'FAIL', errorCode: STAGE8_MACHINE_ERROR_CODES.COMMAND_EXECUTION_FAILED, payload: null, process };
  }
  let payload;
  try {
    payload = JSON.parse(process.stdout.trim());
  } catch {
    return { result: 'FAIL', errorCode: STAGE8_MACHINE_ERROR_CODES.MACHINE_OUTPUT_INVALID, payload: null, process };
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { result: 'FAIL', errorCode: STAGE8_MACHINE_ERROR_CODES.MACHINE_OUTPUT_INVALID, payload: null, process };
  }
  if (!validate(payload)) {
    return { result: 'FAIL', errorCode: STAGE8_MACHINE_ERROR_CODES.MACHINE_OUTPUT_SCHEMA_INVALID, payload, process };
  }
  return { result: 'PASS', errorCode: null, payload, process };
}

export function runStage8MachineCommand({ executable, args, cwd, validate, spawn = spawnSync }) {
  const processResult = spawn(executable, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
  });
  return classifyStage8MachineOutput(processResult, validate);
}

export function stage8MachineJsonCommand(name, executable = process.execPath) {
  const registered = STAGE8_MACHINE_JSON_COMMANDS[name];
  if (!registered) throw new Error(`Unknown Stage 8 machine JSON command: ${name}`);
  return { executable, args: [...registered.args], gateName: registered.gateName };
}

export function validatePhase2cEvidenceFreeze(payload) {
  const baseline = payload?.gates?.provisional_baseline_assets;
  return payload.result === 'PASS'
    && baseline?.result === 'PASS'
    && baseline.assetCount === 50
    && baseline.matched === 50
    && baseline.drifted === 0
    && baseline.missing === 0
    && baseline.extra === 0;
}

export function validateFinalBaselineIntegrity(payload) {
  return payload.result === 'PASS'
    && payload.baseline?.status === 'APPROVED'
    && payload.baseline?.humanVisualReview === 'APPROVED'
    && payload.assets?.total === 34
    && payload.assets?.matched === 34
    && payload.assets?.drifted === 0
    && payload.assets?.missing === 0
    && payload.catalog?.result === 'PASS'
    && payload.catalog?.partCount === 16
    && payload.catalog?.combinations === 288
    && payload.normalRepair?.result === 'PASS'
    && payload.normalRepair?.partCount === 16
    && payload.historicalEvidence?.result === 'PASS';
}

export function validateStage7Evidence(payload) {
  return payload.result === 'PASS'
    && /^[a-f0-9]{64}$/.test(payload.originalFailureJsonSha256)
    && payload.preservedEntries === 19
    && payload.unavailableEntries === 3
    && payload.currentRevalidationEntries === 3;
}

export function validateGovernance(payload) {
  return payload.result === 'PASS'
    && /^[a-f0-9]{64}$/.test(payload.waiver_sha256)
    && typeof payload.expires_on === 'string'
    && payload.baseline_status === 'PROVISIONAL_NOT_FINAL'
    && Array.isArray(payload.errors)
    && payload.errors.length === 0;
}

export function stage8PythonRuntimeIdentity(resolution) {
  const runtime = resolution.runtime;
  const probe = resolution.attempts?.some(attempt => attempt.source === runtime?.source
    && attempt.status === 0 && !attempt.errorCode && attempt.version === runtime?.version)
    ? 'success' : 'failed';
  return {
    version: runtime?.version ?? null,
    source: runtime?.source ?? null,
    environmentOverride: runtime?.configured === true,
    executable: runtime?.executable ?? null,
    probe,
  };
}

export function assertStage8PythonRuntimeReady(identity, referenceVersion) {
  if (identity.probe !== 'success') throw new Error('STAGE8_PYTHON_RUNTIME_UNAVAILABLE');
  if (identity.version !== referenceVersion) throw new Error('STAGE8_PYTHON_REFERENCE_RUNTIME_MISMATCH');
  if (identity.source !== 'NSS_PYTHON_EXECUTABLE' || identity.environmentOverride !== true) {
    throw new Error('STAGE8_PYTHON_OVERRIDE_REQUIRED');
  }
  return true;
}

export function assertStage8PythonRuntimeStable(start, end) {
  if (JSON.stringify(start) !== JSON.stringify(end)) throw new Error('STAGE8_PYTHON_RUNTIME_DRIFT_DURING_RUN');
  return true;
}

export function redactStage8PythonRuntimeIdentity(identity) {
  return { ...identity, executable: identity.executable ? '<NSS_PYTHON_EXECUTABLE>' : null };
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
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

export function stage8RunId(date, headCommit) {
  const timestamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `stage8-delivery-${timestamp}-${headCommit.slice(0, 7)}`;
}

export function createStage8Run({ artifactRoot, runId, headCommit, baselineCommit, workspaceDigest }) {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(runId)) throw new Error(`Invalid Stage 8 run id: ${runId}`);
  const runDir = resolve(artifactRoot, runId);
  if (existsSync(runDir)) throw new Error(`Stage 8 run already exists: ${runId}`);
  mkdirSync(runDir, { recursive: true });
  for (const directory of STAGE8_DIRECTORIES) mkdirSync(join(runDir, directory));
  const manifestPath = join(runDir, 'manifest.json');
  const manifest = {
    schemaVersion: 'NSS-PHASE3B-STAGE8-RUN-V1',
    runId,
    evidenceType: STAGE8_EVIDENCE_TYPE,
    headCommit,
    baselineResolvedCommit: baselineCommit,
    workspaceDigest,
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: 'RUNNING',
    modeStatus: { preflight: 'PENDING', long: 'PENDING', finalize: 'PENDING' },
    nextMode: 'preflight',
    directories: [...STAGE8_DIRECTORIES],
  };
  writeJsonAtomic(manifestPath, manifest);
  return { runDir, manifestPath, manifest };
}

function readStage8Manifest(run) {
  return JSON.parse(readFileSync(run.manifestPath, 'utf8'));
}

function writeStage8Hashes(run, { runStatus, mode, failureClassification = null }) {
  const hashesPath = join(run.runDir, 'hashes.json');
  const hashes = Object.fromEntries(filesBelow(run.runDir)
    .filter(path => path !== run.manifestPath && path !== hashesPath && !path.endsWith('.tmp'))
    .sort()
    .map(path => [relative(run.runDir, path).replaceAll('\\', '/'), sha256(readFileSync(path))]));
  const report = {
    schemaVersion: 'NSS-PHASE3B-STAGE8-HASHES-V1',
    runStatus,
    generatedAt: new Date().toISOString(),
    mode,
    failureClassification,
    hashes,
  };
  writeJsonAtomic(hashesPath, report);
  return report;
}

export function finalizeStage8Run(run, status = 'PASS') {
  const current = readStage8Manifest(run);
  if (current.status === 'FAIL') throw new Error('Stage 8 failed run cannot be finalized as PASS');
  if (current.status === 'PASS') return current;
  const completedAt = new Date().toISOString();
  const manifest = { ...current, completedAt, status,
    modeStatus: { preflight: 'PASS', long: 'PASS', finalize: status }, nextMode: null };
  writeStage8Hashes(run, { runStatus: status, mode: 'finalize' });
  writeJsonAtomic(run.manifestPath, manifest);
  return manifest;
}

export function completeStage8Mode(run, mode) {
  if (!['preflight', 'long', 'finalize'].includes(mode)) throw new Error(`Unknown Stage 8 mode: ${mode}`);
  const current = readStage8Manifest(run);
  if (current.status !== 'RUNNING') throw new Error(`Stage 8 run is already terminal: ${current.status}`);
  if (current.nextMode !== mode) throw new Error(`Stage 8 mode out of order: expected ${current.nextMode}, received ${mode}`);
  if (mode === 'finalize') return finalizeStage8Run(run, 'PASS');
  const summaryName = mode === 'preflight' ? 'preflight-summary.json' : 'long-gates-summary.json';
  const summaryPath = join(run.runDir, summaryName);
  if (!existsSync(summaryPath)) throw new Error(`Stage 8 ${mode} summary is missing`);
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  if (summary.status !== 'PASS' || !summary.completedAt) throw new Error(`Stage 8 ${mode} summary is not complete`);
  const nextMode = mode === 'preflight' ? 'long' : 'finalize';
  const manifest = { ...current, modeStatus: { ...current.modeStatus, [mode]: 'PASS' }, nextMode };
  writeJsonAtomic(run.manifestPath, manifest);
  return manifest;
}

export function finalizeStage8Failure(run, { mode, failureClassification, message, failedGate = null,
  primaryError = null, secondaryErrors = [] }) {
  if (!['preflight', 'long', 'finalize'].includes(mode)) throw new Error(`Unknown Stage 8 mode: ${mode}`);
  const current = readStage8Manifest(run);
  const failurePath = join(run.runDir, `${mode}-failure.json`);
  const hashesPath = join(run.runDir, 'hashes.json');
  if (current.status === 'FAIL') {
    return {
      manifest: current,
      failure: existsSync(failurePath) ? JSON.parse(readFileSync(failurePath, 'utf8')) : null,
      hashes: existsSync(hashesPath) ? JSON.parse(readFileSync(hashesPath, 'utf8')) : null,
    };
  }
  if (current.status === 'PASS') throw new Error('Stage 8 passed run cannot be closed as FAIL');
  const completedAt = new Date().toISOString();
  const modeStatus = mode === 'preflight'
    ? { preflight: 'FAIL', long: 'NOT_REACHED', finalize: 'NOT_REACHED' }
    : mode === 'long'
      ? { preflight: 'PASS', long: 'FAIL', finalize: 'NOT_REACHED' }
      : { preflight: 'PASS', long: 'PASS', finalize: 'FAIL' };
  const failure = {
    schemaVersion: 'NSS-PHASE3B-STAGE8-FAILURE-V1',
    status: 'FAIL',
    mode,
    runId: current.runId,
    failureClassification,
    failedGate,
    error: message,
    primaryError,
    secondaryErrors,
    failedAt: completedAt,
    completedAt,
  };
  writeJsonAtomic(failurePath, failure);
  const manifest = { ...current, status: 'FAIL', completedAt, modeStatus, nextMode: null,
    failedMode: mode, failedGate, failureClassification };
  writeJsonAtomic(run.manifestPath, manifest);
  const hashes = writeStage8Hashes(run, { runStatus: 'FAIL', mode, failureClassification });
  return { manifest, failure, hashes };
}

export function snapshotFiles(root, paths) {
  return Object.fromEntries(paths.slice().sort().map(path => {
    const absolute = resolve(root, path);
    if (!existsSync(absolute)) return [path.replaceAll('\\', '/'), { exists: false, kind: null, bytes: null, sha256: null }];
    if (statSync(absolute).isFile()) {
      return [path.replaceAll('\\', '/'), { exists: true, kind: 'file', bytes: statSync(absolute).size, sha256: sha256(readFileSync(absolute)) }];
    }
    const files = filesBelow(absolute).sort();
    const digest = sha256(Buffer.from(files.map(file => `${relative(absolute, file).replaceAll('\\', '/')}:${sha256(readFileSync(file))}`).join('\n')));
    return [path.replaceAll('\\', '/'), { exists: true, kind: 'directory', bytes: files.reduce((total, file) => total + statSync(file).size, 0), sha256: digest }];
  }));
}

export function parsePlaywrightReport(report) {
  const stats = report?.stats ?? {};
  const skipped = Number(stats.skipped ?? 0);
  const failed = Number(stats.unexpected ?? 0);
  const flaky = Number(stats.flaky ?? 0);
  const passed = Number(stats.expected ?? 0);
  return {
    passed,
    failed,
    skipped,
    flaky,
    total: passed + failed + skipped + flaky,
    status: failed === 0 && skipped === 0 && flaky === 0 ? 'PASS' : 'FAIL',
  };
}

export function inspectBuildOutput(directory) {
  const errors = [];
  const root = resolve(directory);
  const indexPath = join(root, 'index.html');
  if (!existsSync(indexPath) || statSync(indexPath).size === 0) errors.push('MISSING_OR_EMPTY_INDEX_HTML');
  const files = filesBelow(root).sort();
  const relativeFiles = files.map(path => relative(root, path).replaceAll('\\', '/'));
  const js = relativeFiles.filter(path => path.endsWith('.js'));
  const css = relativeFiles.filter(path => path.endsWith('.css'));
  if (js.length === 0) errors.push('MISSING_JAVASCRIPT_BUNDLE');
  if (css.length === 0) errors.push('MISSING_CSS_BUNDLE');
  for (const path of files) {
    const relativePath = relative(root, path).replaceAll('\\', '/');
    if (statSync(path).size === 0) errors.push(`ZERO_BYTE_FILE:${relativePath}`);
    if (path.endsWith('.map')) errors.push(`SOURCE_MAP_PRESENT:${relativePath}`);
    if (!/\.(?:html|js|css|json|txt|svg|xml)$/i.test(path)) continue;
    const text = readFileSync(path, 'utf8');
    if (/[A-Za-z]:\\Users\\/i.test(text)) errors.push(`ABSOLUTE_WINDOWS_PATH:${relativePath}`);
    if (/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i.test(text)) {
      errors.push(`LOCALHOST_REFERENCE:${relativePath}`);
    }
    if (/test-results/i.test(text)) errors.push(`TEST_RESULTS_REFERENCE:${relativePath}`);
    if (/test-artifacts/i.test(text)) errors.push(`TEST_ARTIFACTS_REFERENCE:${relativePath}`);
  }
  if (existsSync(indexPath)) {
    const html = readFileSync(indexPath, 'utf8');
    for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
      const reference = match[1];
      if (/^(?:https?:|data:|#)/i.test(reference)) continue;
      const target = resolve(root, reference.replace(/^\.\//, '').replace(/^\//, ''));
      if (!existsSync(target) || statSync(target).size === 0) errors.push(`MISSING_RESOURCE:${reference}`);
    }
  }
  return {
    result: errors.length ? 'FAIL' : 'PASS',
    errors: [...new Set(errors)].sort(),
    index: existsSync(indexPath) ? 'index.html' : null,
    javascriptBundles: js,
    cssBundles: css,
    files: relativeFiles.map(path => ({ path, bytes: statSync(join(root, path)).size })),
  };
}

export function assertStage8Summary(summary) {
  const errors = [];
  if (summary.schemaVersion !== 'NSS-STAGE8-CURRENT-DELIVERY-V2') errors.push('invalid schema version');
  if (!['PASS_WITH_APPROVED_FINAL_BASELINE', 'FAIL'].includes(summary.stage8Status)) errors.push('invalid Stage 8 status');
  if (summary.phase3Status !== 'COMPLETE') errors.push('Phase 3 must remain COMPLETE');
  if (summary.humanVisualReview !== 'APPROVED') errors.push('human visual review must remain APPROVED');
  if (summary.baseline?.status !== 'APPROVED') errors.push('baseline must remain APPROVED');
  if (summary.baselineFinalizationAllowed !== true) errors.push('baseline finalization must remain allowed');
  if (summary.baseline?.assetCount !== 34 || summary.baseline?.matched !== 34
    || summary.baseline?.drift !== 0 || summary.baseline?.missing !== 0 || summary.baseline?.extra !== 0) {
    errors.push('baseline asset result must remain 34/34 with no drift');
  }
  if (errors.length) throw new Error(errors.join('; '));
  return true;
}

export function writeStage8Json(path, value) {
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeJsonAtomic(path, value);
}

export function fileSha256(path) {
  return sha256(readFileSync(path));
}

export function redactWorkspace(value, workspace) {
  return String(value ?? '')
    .replaceAll(workspace, '<WORKSPACE>')
    .replaceAll(workspace.replaceAll('\\', '/'), '<WORKSPACE>');
}

export function summarizeCommand(command, result) {
  return {
    command,
    exitCode: result.status ?? null,
    signal: result.signal ?? null,
    errorCode: result.error?.code ?? null,
    stdout: String(result.stdout ?? '').slice(-4000),
    stderr: String(result.stderr ?? '').slice(-4000),
  };
}

export function reportFileName(path) {
  return basename(path);
}
