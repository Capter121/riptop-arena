import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  evaluateFinalBaselineIntegrity,
  inspectFinalBaselineIntegrity,
} from '../../scripts/check-final-baseline-integrity.mjs';

const PASSING_INPUT = {
  tagResolved: true,
  tagMatchesAuthority: true,
  finalBaselineHeadResolved: true,
  finalBaselineIsAncestor: true,
  manifestValid: true,
  historicalEvidenceValid: true,
  protectedWorktreeClean: true,
  protectedIndexClean: true,
  assetCount: 34,
  matched: 34,
  drifted: 0,
  missing: 0,
  normalRepairValid: true,
  catalogValid: true,
};

describe('final baseline integrity', () => {
  it('passes the checked-in final baseline and integration catalog', () => {
    const result = inspectFinalBaselineIntegrity(fileURLToPath(new URL('../../../', import.meta.url)));

    expect(result).toMatchObject({
      result: 'PASS',
      assets: { total: 34, matched: 34, drifted: 0, missing: 0 },
      catalog: { result: 'PASS', partCount: 16, combinations: 288 },
      normalRepair: { result: 'PASS', partCount: 16 },
      historicalEvidence: { result: 'PASS' },
      baseline: { status: 'APPROVED', humanVisualReview: 'APPROVED' },
    });
  });

  it.each([
    ['moved tag', { tagMatchesAuthority: false }, 'FINAL_BASELINE_TAG_MOVED'],
    ['non-ancestor baseline', { finalBaselineIsAncestor: false }, 'FINAL_BASELINE_NOT_ANCESTOR'],
    ['invalid manifest', { manifestValid: false }, 'FINAL_BASELINE_MANIFEST_INVALID'],
    ['historical evidence drift', { historicalEvidenceValid: false }, 'HISTORICAL_EVIDENCE_DRIFT'],
    ['protected worktree drift', { protectedWorktreeClean: false }, 'FINAL_BASELINE_PROTECTED_WORKTREE_DIRTY'],
    ['asset drift', { matched: 33, drifted: 1 }, 'FINAL_BASELINE_ASSET_DRIFT'],
    ['normal contract drift', { normalRepairValid: false }, 'FINAL_GLB_NORMAL_REPAIR_CONTRACT_INVALID'],
    ['catalog drift', { catalogValid: false }, 'FINAL_BASELINE_CATALOG_INVALID'],
  ])('rejects %s', (_label, override, error) => {
    const result = evaluateFinalBaselineIntegrity({ ...PASSING_INPUT, ...override });
    expect(result.result).toBe('FAIL');
    expect(result.errors).toContain(error);
  });
});
