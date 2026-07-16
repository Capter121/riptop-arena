import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { runBatch } from '../../scripts/run-focus-stability-batch.mjs';

const workspace = () => ({ codeCommit: 'fixture-commit', workspaceDigest: 'fixture-digest', repositoryRoot: process.cwd() });
const fixtureResult = kind => ({
  kind,
  playwrightExitCode: kind === 'PASS' ? 0 : kind === 'FAIL' ? 1 : null,
  durationMs: 1,
  testCount: kind === 'ABORTED' ? 0 : 1,
  errorCounts: { console: 0, pageerror: 0, failedRequest: 0, externalRequest: 0 },
  tracePath: kind === 'FAIL' ? 'fixture/trace.zip' : null,
  sessionDiagnosticSummary: { eventCount: 1, sessionCount: 1, lastEvent: null },
});

function fixtureRoot(name) {
  return mkdtempSync(resolve(tmpdir(), `nss-focus-${name}-`));
}

test('writes PASS only when every unique iteration passes', async () => {
  const result = await runBatch({
    batchId: 'pass-fixture', count: 3, project: 'mobile', test: 'fixture',
    reportRoot: fixtureRoot('pass'), workspaceProvider: workspace,
    executeIteration: async () => fixtureResult('PASS'),
  });
  assert.equal(result.summary.result, 'PASS 3/3');
  assert.deepEqual(result.summary.counts, { PASS: 3, FAIL: 0, ABORTED: 0, RUNNING: 0, NOT_RUN: 0 });
});

test('stops at the first FAIL and marks later iterations NOT_RUN', async () => {
  const result = await runBatch({
    batchId: 'fail-fixture', count: 3, project: 'mobile', test: 'fixture',
    reportRoot: fixtureRoot('fail'), workspaceProvider: workspace,
    executeIteration: async () => fixtureResult('FAIL'),
  });
  assert.equal(result.summary.status, 'FAIL');
  assert.deepEqual(result.summary.counts, { PASS: 0, FAIL: 1, ABORTED: 0, RUNNING: 0, NOT_RUN: 2 });
  const first = JSON.parse(readFileSync(resolve(result.batchDirectory, 'iteration-001.json'), 'utf8'));
  assert.equal(first.failureRepeat, 1);
});

test('preserves completed results and cannot call an aborted batch PASS', async () => {
  let iteration = 0;
  const result = await runBatch({
    batchId: 'aborted-fixture', count: 4, project: 'mobile', test: 'fixture',
    reportRoot: fixtureRoot('aborted'), workspaceProvider: workspace,
    executeIteration: async () => fixtureResult(++iteration === 1 ? 'PASS' : 'ABORTED'),
  });
  assert.equal(result.summary.status, 'ABORTED');
  assert.deepEqual(result.summary.counts, { PASS: 1, FAIL: 0, ABORTED: 1, RUNNING: 0, NOT_RUN: 2 });
  assert.equal(JSON.parse(readFileSync(resolve(result.batchDirectory, 'iteration-001.json'), 'utf8')).status, 'PASS');
});

test('refuses to overwrite an existing batch id', async () => {
  const reportRoot = fixtureRoot('duplicate');
  const options = {
    batchId: 'immutable-fixture', count: 1, project: 'mobile', test: 'fixture', reportRoot,
    workspaceProvider: workspace, executeIteration: async () => fixtureResult('PASS'),
  };
  await runBatch(options);
  await assert.rejects(() => runBatch(options), /cannot be overwritten/);
});
