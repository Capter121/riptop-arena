import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beginArtifactRun, finalizeArtifactRun } from './playwright-artifacts.mjs';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const separator = process.argv.indexOf('--');
const selection = separator === -1 ? [] : process.argv.slice(separator + 1);
const gateName = argument('--gate-name');
const runId = argument('--run-id');
const config = argument('--config');
const artifactRoot = argument('--artifact-root') ?? resolve('test-artifacts');
const evidenceType = argument('--evidence-type') ?? 'FORMAL_TEST_EXECUTION';
if (!gateName || !runId || !config) {
  throw new Error('Usage: node scripts/run-playwright-artifact.mjs --gate-name <name> --run-id <id> --config <path> -- [test selection]');
}
const collectionOnly = evidenceType === 'COLLECTION_ONLY';
if (collectionOnly && (gateName !== 'PLAYWRIGHT_COLLECTION' || !selection.includes('--list'))) {
  throw new Error('COLLECTION_ONLY requires gateName PLAYWRIGHT_COLLECTION and --list.');
}
if (!collectionOnly && selection.includes('--list')) {
  throw new Error('--list must use COLLECTION_ONLY evidence.');
}

function git(...args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  return result.stdout.trim();
}

const commit = git('rev-parse', '--short=7', 'HEAD');
const workspaceState = git('status', '--porcelain=v1', '--untracked-files=no');
const workspaceDigest = createHash('sha256').update(workspaceState).digest('hex');
const run = beginArtifactRun({
  artifactRoot, runId, gateName, commit, workspaceDigest,
  retry: 0, workers: 1, timeoutPolicy: 'CONFIG_DEFAULTS_UNCHANGED', testSelection: selection,
  evidenceType,
});

let status = 'ABORTED';
let exitCode = 1;
try {
  const cli = resolve('node_modules/@playwright/test/cli.js');
  readFileSync(cli);
  const result = spawnSync(process.execPath, [cli, 'test', '--config', config, ...selection], {
    cwd: process.cwd(),
    env: { ...process.env, NSS_PLAYWRIGHT_ARTIFACT_RUN_DIR: run.runDir,
      NSS_PLAYWRIGHT_EVIDENCE_TYPE: evidenceType },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.signal || result.status === null) status = 'ABORTED';
  else { exitCode = result.status; status = exitCode === 0 ? 'PASS' : 'FAIL'; }
} finally {
  finalizeArtifactRun(run, status);
}
process.exitCode = exitCode;
