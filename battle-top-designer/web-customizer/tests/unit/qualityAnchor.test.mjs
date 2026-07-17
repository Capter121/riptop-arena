import { describe, expect, it } from 'vitest';
import { qualityRunId, sanitizeLog, summarizeVitest } from '../../scripts/quality-anchor.mjs';

describe('current quality anchor evidence', () => {
  it('labels current results without historical recovery', () => {
    const summary = summarizeVitest({ numTotalTests: 168, numPassedTests: 168, numFailedTests: 0, numPendingTests: 0, success: true });
    expect(summary).toEqual({ total: 168, passed: 168, failed: 0, skipped: 0, status: 'PASS' });
  });

  it('uses a unique UTC run-id shape', () => {
    expect(qualityRunId(new Date('2026-07-17T05:20:30Z'), '72eca1e'))
      .toBe('stage7-quality-anchor-20260717T052030Z-72eca1e');
  });

  it('removes workspace absolute paths from logs', () => {
    expect(sanitizeLog('failure at C:\\workspace\\src\\file.ts', 'C:\\workspace'))
      .toBe('failure at <WORKSPACE>\\src\\file.ts');
  });
});
