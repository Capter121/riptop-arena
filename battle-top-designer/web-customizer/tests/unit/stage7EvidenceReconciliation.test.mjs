import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  normalizeMarkdownEvidence, sha256Buffer, trackedEvidenceSha256,
} from '../../scripts/stage7-evidence-guards.mjs';

const reportRoot = resolve('../reports/validation');
const audit = JSON.parse(readFileSync(resolve(reportRoot, 'phase3b-stage7-diagnosis-anchor-refresh.json'), 'utf8'));
const substituteText = readFileSync(resolve(reportRoot, 'phase3b-stage7-substitute-evidence-manifest.json'), 'utf8');
const substitute = JSON.parse(substituteText);
const freeze = JSON.parse(readFileSync(resolve(reportRoot, 'phase3b-stage7-existing-evidence-freeze.json'), 'utf8'));

describe('Stage 7 evidence hash reconciliation', () => {
  it('hashes tracked evidence identically for LF and CRLF checkouts', () => {
    expect(trackedEvidenceSha256(Buffer.from('line one\nline two\n')))
      .toBe(trackedEvidenceSha256(Buffer.from('line one\r\nline two\r\n')));
  });

  it('reconstructs both previous Markdown hashes without semantic drift', () => {
    for (const entry of audit.files) {
      const current = readFileSync(resolve('../', entry.path), 'utf8').replaceAll('\r\n', '\n');
      expect(sha256Buffer(Buffer.from(current))).toBe(entry.currentSha256);
      const previous = entry.path.includes('tip-observation')
        ? current.replace('trace.zip`\n', 'trace.zip`  \n') + '\n'
        : current + '\n';
      expect(sha256Buffer(Buffer.from(previous))).toBe(entry.previousSha256);
      expect(normalizeMarkdownEvidence(previous)).toBe(normalizeMarkdownEvidence(current));
      expect(entry.normalizedSemanticEqual).toBe(true);
    }
  });

  it('keeps the overwritten collection SHA only in the incident record', () => {
    expect(substituteText).not.toContain('067d7d4560eb57c4ec7709b266dbf35a1c7500a2c1212f01c42550609a0e1793');
    const formal = substitute.postRepairEvidence.find(entry => entry.gate === 'Stage 7 combined 8/8');
    expect(formal).toMatchObject({
      sha256: '16b74303ffc08a9bc8f9d1c1a0bcc4734d49c154d63e26e7d2771b6a0734c8cc',
      recoveredFrom: 'GIT_OBJECT', evidenceStatus: 'PRESERVED_HISTORICAL_ARTIFACT', historicalRunReexecuted: false,
    });
  });

  it('preserves evidence counts and classifies collection separately', () => {
    const counts = Object.fromEntries(['PRESERVED_HISTORICAL_ARTIFACT', 'HISTORICAL_ARTIFACT_UNAVAILABLE', 'CURRENT_REVALIDATION_EVIDENCE']
      .map(category => [category, freeze.entries.filter(entry => entry.category === category).length]));
    expect(counts).toEqual({ PRESERVED_HISTORICAL_ARTIFACT: 19, HISTORICAL_ARTIFACT_UNAVAILABLE: 3, CURRENT_REVALIDATION_EVIDENCE: 3 });
    expect(freeze.collectionEvidencePolicy).toMatchObject({ evidenceType: 'COLLECTION_ONLY', formalEvidence: false, uniqueRunDirectoryRequired: true });
  });
});
