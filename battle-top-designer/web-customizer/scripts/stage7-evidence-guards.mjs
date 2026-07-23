import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const FORMAL_STAGE7_SHA256 = '16b74303ffc08a9bc8f9d1c1a0bcc4734d49c154d63e26e7d2771b6a0734c8cc';

export function sha256Buffer(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function trackedEvidenceSha256(bytes) {
  return sha256Buffer(Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'), 'utf8'));
}

export function readGitBlob(commit, path) {
  const result = spawnSync('git', ['show', `${commit}:${path}`]);
  if (result.status !== 0) throw new Error(result.stderr?.toString() || 'Git blob unavailable');
  return result.stdout;
}

export function normalizeMarkdownEvidence(value) {
  const lines = value.replaceAll('\r\n', '\n').split('\n').map(line => line.replace(/[ \t]+$/u, ''));
  while (lines.at(-1) === '') lines.pop();
  return lines.join('\n');
}

export function formalStage7Facts(report) {
  const tests = report.suites?.flatMap(suite => suite.specs ?? []).flatMap(spec => spec.tests ?? []) ?? [];
  const passed = tests.filter(test => test.status === 'expected'
    && test.results?.length === 1 && test.results[0].status === 'passed').length;
  return {
    expected: report.stats?.expected,
    skipped: report.stats?.skipped,
    unexpected: report.stats?.unexpected,
    flaky: report.stats?.flaky,
    passed,
    isCollection: report.config?.argv?.includes('--list') ?? false,
  };
}

export function isFormalStage7Report(report) {
  const facts = formalStage7Facts(report);
  return facts.expected === 8 && facts.passed === 8 && facts.skipped === 0
    && facts.unexpected === 0 && facts.flaky === 0 && !facts.isCollection;
}
