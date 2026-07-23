import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { beginArtifactRun, buildArtifactPaths } from '../../scripts/playwright-artifacts.mjs';
import {
  FORMAL_STAGE7_SHA256, formalStage7Facts, isFormalStage7Report,
  normalizeMarkdownEvidence, readGitBlob, sha256Buffer,
} from '../../scripts/stage7-evidence-guards.mjs';

const formalPath = 'battle-top-designer/reports/validation/phase3b-stage7-playwright-repaired-v2.json';
const metadata = { gateName: 'PLAYWRIGHT_COLLECTION', commit: '303314d', workspaceDigest: 'digest',
  retry: 0, workers: 1, timeoutPolicy: 'CONFIG_DEFAULTS_UNCHANGED', testSelection: ['--list'] };

describe('Playwright collection evidence isolation', () => {
  it('uses a collection reporter path distinct from the formal reporter', () => {
    const root = mkdtempSync(join(tmpdir(), 'nss-collection-'));
    const collection = buildArtifactPaths(root, 'collection-a', 'COLLECTION_ONLY');
    const formal = buildArtifactPaths(root, 'formal-a', 'FORMAL_TEST_EXECUTION');
    expect(collection.reporterPath).toMatch(/collection-report\.json$/);
    expect(collection.reporterPath).not.toBe(formal.reporterPath);
  });

  it('marks collection evidence and refuses an existing run id', () => {
    const root = mkdtempSync(join(tmpdir(), 'nss-collection-'));
    const first = beginArtifactRun({ artifactRoot: root, runId: 'collection-a', evidenceType: 'COLLECTION_ONLY', ...metadata });
    expect(JSON.parse(readFileSync(first.manifestPath, 'utf8'))).toMatchObject({
      gateName: 'PLAYWRIGHT_COLLECTION', evidenceType: 'COLLECTION_ONLY',
      reporterPath: relative(process.cwd(), first.reporterPath).replaceAll('\\', '/'),
    });
    expect(() => beginArtifactRun({ artifactRoot: root, runId: 'collection-a', evidenceType: 'COLLECTION_ONLY', ...metadata })).toThrow(/already exists/i);
  });

  it('verifies the preserved formal Git blob and rejects collection output as formal evidence', () => {
    const bytes = readGitBlob('5770180a0422d977519de6d536577a6d5c8a1d40', formalPath);
    const report = JSON.parse(bytes.toString('utf8'));
    expect(sha256Buffer(bytes)).toBe(FORMAL_STAGE7_SHA256);
    expect(formalStage7Facts(report)).toEqual({ expected: 8, skipped: 0, unexpected: 0, flaky: 0, passed: 8, isCollection: false });
    expect(isFormalStage7Report(report)).toBe(true);
    expect(isFormalStage7Report({ ...report, config: { argv: ['--list'] }, stats: { ...report.stats, expected: 0, skipped: 8 } })).toBe(false);
  });

  it('treats only approved Markdown whitespace as semantically equal', () => {
    expect(normalizeMarkdownEvidence('same  \r\n\r\n')).toBe(normalizeMarkdownEvidence('same\n'));
    expect(normalizeMarkdownEvidence('PASS\n')).not.toBe(normalizeMarkdownEvidence('FAIL\n'));
  });
});
