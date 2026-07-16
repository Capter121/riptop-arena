import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const webCustomizerRoot = resolve(scriptDirectory, '..');
const projectRoot = resolve(webCustomizerRoot, '..');
const defaultReportRoot = resolve(projectRoot, 'reports', 'validation', 'focus-batches');

function atomicWriteJson(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temporaryPath, filePath);
}

function iterationFile(batchDirectory, iteration) {
  return resolve(batchDirectory, `iteration-${String(iteration).padStart(3, '0')}.json`);
}

function git(args, cwd = webCustomizerRoot, encoding = 'utf8') {
  return execFileSync('git', args, { cwd, encoding });
}

function excludedWorkspacePath(filePath) {
  const normalized = filePath.replaceAll('\\', '/');
  return normalized.startsWith('battle-top-designer/reports/validation/focus-batches/')
    || normalized.startsWith('battle-top-designer/web-customizer/test-results/')
    || normalized.startsWith('battle-top-designer/web-customizer/dist/')
    || normalized.startsWith('battle-top-designer/web-customizer/playwright-report/');
}

export function captureWorkspace() {
  const repositoryRoot = git(['rev-parse', '--show-toplevel']).trim();
  const codeCommit = git(['rev-parse', 'HEAD']).trim();
  const trackedDiff = git(['diff', '--binary', 'HEAD', '--', '.'], repositoryRoot, 'buffer');
  const untrackedOutput = git(['ls-files', '--others', '--exclude-standard', '-z'], repositoryRoot);
  const untracked = untrackedOutput.split('\0').filter(Boolean).filter(file => !excludedWorkspacePath(file)).sort();
  const hash = createHash('sha256');
  hash.update(trackedDiff);
  for (const file of untracked) {
    const absolutePath = resolve(repositoryRoot, file);
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) continue;
    hash.update(file);
    hash.update('\0');
    hash.update(readFileSync(absolutePath));
    hash.update('\0');
  }
  return { codeCommit, workspaceDigest: hash.digest('hex'), repositoryRoot };
}

function collectTestResults(suites, results = []) {
  for (const suite of suites ?? []) {
    for (const specification of suite.specs ?? []) {
      for (const test of specification.tests ?? []) {
        for (const result of test.results ?? []) results.push(result);
      }
    }
    collectTestResults(suite.suites, results);
  }
  return results;
}

function readAttachment(attachment) {
  try {
    if (attachment.body) return JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
    if (attachment.path && existsSync(attachment.path)) return JSON.parse(readFileSync(attachment.path, 'utf8'));
  } catch {
    return null;
  }
  return null;
}

function relativeArtifactPath(filePath, repositoryRoot) {
  if (!filePath) return null;
  const absolutePath = isAbsolute(filePath) ? filePath : resolve(webCustomizerRoot, filePath);
  return relative(repositoryRoot, absolutePath).replaceAll('\\', '/');
}

function summarizePlaywrightReport(report, repositoryRoot) {
  const results = collectTestResults(report.suites);
  const attachments = results.flatMap(result => result.attachments ?? []);
  const technical = readAttachment(attachments.find(attachment => attachment.name === 'technical-errors'));
  const diagnostics = readAttachment(attachments.find(attachment => attachment.name === 'focus-diagnostics'));
  const trace = attachments.find(attachment => attachment.name === 'trace');
  const artifacts = attachments
    .filter(attachment => attachment.path)
    .map(attachment => relativeArtifactPath(attachment.path, repositoryRoot));
  const lastEvent = Array.isArray(diagnostics) && diagnostics.length > 0 ? diagnostics.at(-1) : null;
  return {
    testCount: results.length,
    errorCounts: {
      console: Array.isArray(technical?.console) ? technical.console.length : null,
      pageerror: Array.isArray(technical?.page) ? technical.page.length : null,
      failedRequest: Array.isArray(technical?.failed) ? technical.failed.length : null,
      externalRequest: Array.isArray(technical?.external) ? technical.external.length : null,
    },
    tracePath: relativeArtifactPath(trace?.path, repositoryRoot),
    artifactPaths: artifacts,
    sessionDiagnosticSummary: {
      eventCount: Array.isArray(diagnostics) ? diagnostics.length : null,
      sessionCount: Array.isArray(diagnostics) ? new Set(diagnostics.map(event => event.sessionId)).size : null,
      lastEvent: lastEvent ? {
        type: lastEvent.type,
        sessionId: lastEvent.sessionId,
        target: lastEvent.target,
        phase: lastEvent.phase,
        revision: lastEvent.details?.revision ?? null,
        partId: lastEvent.details?.partId ?? null,
      } : null,
    },
  };
}

export function executePlaywrightIteration({ project, test, repositoryRoot, signal }) {
  return new Promise(resolveResult => {
    const startedAt = Date.now();
    const playwrightCli = resolve(webCustomizerRoot, 'node_modules', '@playwright', 'test', 'cli.js');
    let child;
    try {
      child = spawn(process.execPath, [
        playwrightCli, 'test', test,
        `--project=${project}`,
        '--workers=1',
        '--retries=0',
        '--reporter=json',
      ], { cwd: webCustomizerRoot, env: process.env, windowsHide: true });
    } catch (error) {
      resolveResult({ kind: 'ABORTED', playwrightExitCode: null, durationMs: Date.now() - startedAt, reason: `PLAYWRIGHT_START_ERROR_${error.code ?? 'UNKNOWN'}` });
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const abort = () => child.kill();
    signal?.addEventListener('abort', abort, { once: true });
    child.on('close', (exitCode, processSignal) => {
      signal?.removeEventListener('abort', abort);
      const durationMs = Date.now() - startedAt;
      if (signal?.aborted || processSignal) {
        resolveResult({ kind: 'ABORTED', playwrightExitCode: exitCode, durationMs, reason: `PLAYWRIGHT_PROCESS_INTERRUPTED${processSignal ? `_${processSignal}` : ''}` });
        return;
      }
      let report;
      try {
        report = JSON.parse(stdout);
      } catch {
        resolveResult({ kind: 'ABORTED', playwrightExitCode: exitCode, durationMs, reason: 'PLAYWRIGHT_JSON_MISSING_OR_MALFORMED', stderrPresent: stderr.length > 0 });
        return;
      }
      const summary = summarizePlaywrightReport(report, repositoryRoot);
      resolveResult({
        kind: exitCode === 0 ? 'PASS' : 'FAIL',
        playwrightExitCode: exitCode,
        durationMs,
        ...summary,
      });
    });
    child.on('error', error => {
      signal?.removeEventListener('abort', abort);
      resolveResult({ kind: 'ABORTED', playwrightExitCode: null, durationMs: Date.now() - startedAt, reason: `PLAYWRIGHT_START_ERROR_${error.code ?? 'UNKNOWN'}` });
    });
  });
}

function batchSummary(manifest, records) {
  const counts = { PASS: 0, FAIL: 0, ABORTED: 0, RUNNING: 0, NOT_RUN: 0 };
  for (const record of records) counts[record.status] += 1;
  const allPassed = records.length === manifest.count && counts.PASS === manifest.count;
  return {
    batchId: manifest.batchId,
    status: allPassed ? 'PASS' : counts.FAIL > 0 ? 'FAIL' : 'ABORTED',
    result: allPassed ? `PASS ${manifest.count}/${manifest.count}` : `NOT_PASS ${counts.PASS}/${manifest.count}`,
    count: manifest.count,
    project: manifest.project,
    test: manifest.test,
    codeCommit: manifest.codeCommit,
    workspaceDigest: manifest.workspaceDigest,
    counts,
    records: records.map(record => ({ iteration: record.iteration, status: record.status })),
  };
}

function finishUnrunIterations(batchDirectory, manifest, startIteration, records) {
  for (let iteration = startIteration; iteration <= manifest.count; iteration += 1) {
    const record = {
      batchId: manifest.batchId,
      iteration,
      status: 'NOT_RUN',
      codeCommit: manifest.codeCommit,
      workspaceDigest: manifest.workspaceDigest,
      reason: 'EARLIER_ITERATION_DID_NOT_PASS',
    };
    atomicWriteJson(iterationFile(batchDirectory, iteration), record);
    records.push(record);
  }
}

export function recoverInterruptedBatches(reportRoot = defaultReportRoot) {
  if (!existsSync(reportRoot)) return [];
  const recovered = [];
  for (const directoryName of readdirSync(reportRoot)) {
    const batchDirectory = resolve(reportRoot, directoryName);
    const manifestPath = resolve(batchDirectory, 'manifest.json');
    if (!statSync(batchDirectory).isDirectory() || !existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const records = [];
    let interrupted = false;
    for (let iteration = 1; iteration <= manifest.count; iteration += 1) {
      const filePath = iterationFile(batchDirectory, iteration);
      if (!existsSync(filePath)) {
        if (interrupted) {
          const record = { batchId: manifest.batchId, iteration, status: 'NOT_RUN', codeCommit: manifest.codeCommit, workspaceDigest: manifest.workspaceDigest, reason: 'RECOVERED_AFTER_INTERRUPTION' };
          atomicWriteJson(filePath, record);
          records.push(record);
        }
        continue;
      }
      const record = JSON.parse(readFileSync(filePath, 'utf8'));
      if (record.status === 'RUNNING') {
        record.status = 'ABORTED';
        record.finishedAt = new Date().toISOString();
        record.reason = 'PROCESS_INTERRUPTED_BEFORE_FINALIZATION';
        atomicWriteJson(filePath, record);
        interrupted = true;
        recovered.push(`${manifest.batchId}:${iteration}`);
      }
      records.push(record);
    }
    if (interrupted) atomicWriteJson(resolve(batchDirectory, 'summary.json'), batchSummary(manifest, records));
  }
  return recovered;
}

export async function runBatch({
  batchId,
  count,
  project,
  test,
  reportRoot = defaultReportRoot,
  executeIteration = executePlaywrightIteration,
  workspaceProvider = captureWorkspace,
  signal,
}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(batchId)) throw new Error('batch-id must use letters, digits, dot, underscore, or hyphen');
  if (!Number.isInteger(count) || count < 1) throw new Error('count must be a positive integer');
  mkdirSync(reportRoot, { recursive: true });
  recoverInterruptedBatches(reportRoot);
  const batchDirectory = resolve(reportRoot, batchId);
  if (existsSync(batchDirectory)) throw new Error(`batch-id already exists and cannot be overwritten: ${batchId}`);
  mkdirSync(batchDirectory);
  const workspace = workspaceProvider();
  const manifest = {
    batchId, count, project, test,
    startedAt: new Date().toISOString(),
    codeCommit: workspace.codeCommit,
    workspaceDigest: workspace.workspaceDigest,
  };
  atomicWriteJson(resolve(batchDirectory, 'manifest.json'), manifest);
  const records = [];
  for (let iteration = 1; iteration <= count; iteration += 1) {
    const currentWorkspace = workspaceProvider();
    const running = {
      batchId, iteration, status: 'RUNNING',
      startedAt: new Date().toISOString(),
      codeCommit: manifest.codeCommit,
      workspaceDigest: manifest.workspaceDigest,
    };
    atomicWriteJson(iterationFile(batchDirectory, iteration), running);
    if (currentWorkspace.codeCommit !== manifest.codeCommit || currentWorkspace.workspaceDigest !== manifest.workspaceDigest) {
      const aborted = { ...running, status: 'ABORTED', finishedAt: new Date().toISOString(), reason: 'WORKSPACE_DRIFT' };
      atomicWriteJson(iterationFile(batchDirectory, iteration), aborted);
      records.push(aborted);
      finishUnrunIterations(batchDirectory, manifest, iteration + 1, records);
      break;
    }
    if (signal?.aborted) {
      const aborted = { ...running, status: 'ABORTED', finishedAt: new Date().toISOString(), reason: 'BATCH_SIGNAL_ABORTED' };
      atomicWriteJson(iterationFile(batchDirectory, iteration), aborted);
      records.push(aborted);
      finishUnrunIterations(batchDirectory, manifest, iteration + 1, records);
      break;
    }
    const result = await executeIteration({ iteration, project, test, repositoryRoot: workspace.repositoryRoot, signal });
    const record = {
      ...running,
      ...result,
      status: result.kind,
      kind: undefined,
      finishedAt: new Date().toISOString(),
      failureRepeat: result.kind === 'FAIL' ? iteration : null,
    };
    delete record.kind;
    atomicWriteJson(iterationFile(batchDirectory, iteration), record);
    records.push(record);
    if (record.status !== 'PASS') {
      finishUnrunIterations(batchDirectory, manifest, iteration + 1, records);
      break;
    }
  }
  const summary = batchSummary(manifest, records);
  atomicWriteJson(resolve(batchDirectory, 'summary.json'), summary);
  return { batchDirectory, summary };
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new Error(`unexpected argument: ${argument}`);
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for --${key}`);
    values[key] = value;
    index += 1;
  }
  for (const key of ['batch-id', 'count', 'project', 'test']) {
    if (!values[key]) throw new Error(`missing required --${key}`);
  }
  return { batchId: values['batch-id'], count: Number(values.count), project: values.project, test: values.test };
}

async function main() {
  const abortController = new AbortController();
  const requestAbort = () => abortController.abort();
  process.once('SIGINT', requestAbort);
  process.once('SIGTERM', requestAbort);
  try {
    const result = await runBatch({ ...parseArguments(process.argv.slice(2)), signal: abortController.signal });
    console.log(JSON.stringify(result.summary));
    process.exitCode = result.summary.status === 'PASS' ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await main();
