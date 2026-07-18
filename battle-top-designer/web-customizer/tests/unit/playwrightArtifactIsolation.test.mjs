import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  artifactReporterName,
  beginArtifactRun,
  buildArtifactPaths,
  finalizeArtifactRun,
  hashFile,
  planArtifactCleanup,
} from '../../scripts/playwright-artifacts.mjs';

function workspace() {
  return mkdtempSync(join(tmpdir(), 'nss-playwright-artifacts-'));
}

const metadata = {
  gateName: 'stage7-smoke',
  commit: '72eca1e',
  workspaceDigest: 'digest',
  retry: 0,
  workers: 1,
  timeoutPolicy: 'CONFIG_DEFAULTS_UNCHANGED',
  testSelection: ['tests/artifact-smoke/smoke.spec.ts'],
};

describe('Playwright artifact isolation', () => {
  it('keeps collection and formal reporter names distinct', () => {
    expect(artifactReporterName('COLLECTION_ONLY')).toBe('collection-report.json');
    expect(artifactReporterName('FORMAL_TEST_EXECUTION')).toBe('reporter.json');
  });

  it('assigns different output directories to run A and run B', () => {
    const root = workspace();
    const a = beginArtifactRun({ artifactRoot: root, runId: 'stage7-smoke-a', ...metadata });
    const b = beginArtifactRun({ artifactRoot: root, runId: 'stage7-smoke-b', ...metadata });
    expect(a.outputDir).not.toBe(b.outputDir);
    expect(a.reporterPath).not.toBe(b.reporterPath);
  });

  it('does not alter run A when run B begins', () => {
    const root = workspace();
    const a = beginArtifactRun({ artifactRoot: root, runId: 'stage7-smoke-a', ...metadata });
    writeFileSync(join(a.runDir, 'stable.txt'), 'run-a');
    const before = hashFile(join(a.runDir, 'stable.txt'));
    beginArtifactRun({ artifactRoot: root, runId: 'stage7-smoke-b', ...metadata });
    expect(hashFile(join(a.runDir, 'stable.txt'))).toBe(before);
  });

  it('refuses to overwrite an existing run id', () => {
    const root = workspace();
    beginArtifactRun({ artifactRoot: root, runId: 'stage7-smoke-a', ...metadata });
    expect(() => beginArtifactRun({ artifactRoot: root, runId: 'stage7-smoke-a', ...metadata }))
      .toThrow(/already exists/i);
  });

  it('retains a failed trace and records its hash', () => {
    const root = workspace();
    const run = beginArtifactRun({ artifactRoot: root, runId: 'stage7-smoke-fail', ...metadata });
    const trace = join(run.outputDir, 'failed-case', 'trace.zip');
    mkdirSync(join(run.outputDir, 'failed-case'), { recursive: true });
    writeFileSync(trace, 'failure trace fixture');
    const manifest = finalizeArtifactRun(run, 'FAIL');
    expect(manifest.status).toBe('FAIL');
    expect(manifest.artifactHashes['test-results/failed-case/trace.zip']).toBe(hashFile(trace));
  });

  it('retains an aborted manifest', () => {
    const root = workspace();
    const run = beginArtifactRun({ artifactRoot: root, runId: 'stage7-smoke-aborted', ...metadata });
    const manifest = finalizeArtifactRun(run, 'ABORTED');
    expect(JSON.parse(readFileSync(run.manifestPath, 'utf8')).status).toBe('ABORTED');
    expect(manifest.completedAt).toBeTruthy();
  });

  it('writes a final manifest for a passed run', () => {
    const root = workspace();
    const run = beginArtifactRun({ artifactRoot: root, runId: 'stage7-smoke-pass', ...metadata });
    const manifest = finalizeArtifactRun(run, 'PASS');
    expect(manifest.status).toBe('PASS');
    expect(manifest.completedAt).toBeTruthy();
  });

  it('keeps reporter and test results inside the same run', () => {
    const paths = buildArtifactPaths('test-artifacts', 'stage7-smoke-a');
    expect(paths.outputDir.startsWith(paths.runDir)).toBe(true);
    expect(paths.reporterPath.startsWith(paths.runDir)).toBe(true);
    expect(paths.htmlReportDir.startsWith(paths.runDir)).toBe(true);
  });

  it('plans cleanup as dry-run by default and protects incident evidence', () => {
    const root = workspace();
    beginArtifactRun({ artifactRoot: root, runId: 'ordinary-old-run', ...metadata });
    beginArtifactRun({ artifactRoot: root, runId: 'incident-evidence', incidentEvidenceProtected: true, ...metadata });
    const plan = planArtifactCleanup({ artifactRoot: root });
    expect(plan.dryRun).toBe(true);
    expect(plan.candidates).toContain('ordinary-old-run');
    expect(plan.candidates).not.toContain('incident-evidence');
    expect(plan.protected).toContain('incident-evidence');
  });

  it('records unchanged execution semantics', () => {
    const root = workspace();
    const run = beginArtifactRun({ artifactRoot: root, runId: 'stage7-smoke-semantics', ...metadata });
    const manifest = JSON.parse(readFileSync(run.manifestPath, 'utf8'));
    expect(manifest.retry).toBe(0);
    expect(manifest.workers).toBe(1);
    expect(manifest.timeoutPolicy).toBe('CONFIG_DEFAULTS_UNCHANGED');
    expect(manifest.testSelection).toEqual(['tests/artifact-smoke/smoke.spec.ts']);
  });
});
