import { describe, expect, it } from 'vitest';
import { evaluateEvidenceFreeze } from '../../scripts/check-phase2c-evidence-freeze.mjs';

const PASSING_INPUT = {
  baselineTagResolved: true,
  baselineTagMatchesAnchor: true,
  baselineAssetsValid: true,
  evidenceCommitResolved: true,
  evidenceCommitIsAncestor: true,
  reportsPresent: true,
  reportsMatchEvidenceCommit: true,
  reportsCleanInWorktree: true,
  reportsCleanInIndex: true,
};

describe('Phase 2C three-gate evidence freeze', () => {
  it('does not classify an EPERM verifier launch failure as asset drift', () => {
    const result = evaluateEvidenceFreeze({
      ...PASSING_INPUT,
      baselineAssetsValid: false,
      baselineAssetErrorCode: 'PYTHON_RUNTIME_LAUNCH_FAILED',
      baselineAssetRuntime: { spawnErrorCode: 'EPERM', spawnStatus: null },
    });

    expect(result.errors).toContain('PYTHON_RUNTIME_LAUNCH_FAILED');
    expect(result.errors).not.toContain('PROVISIONAL_BASELINE_ASSET_DRIFT');
  });

  it('fails when a provisional-baseline asset changes', () => {
    expect(evaluateEvidenceFreeze({ ...PASSING_INPUT, baselineAssetsValid: false }).result).toBe('FAIL');
  });

  it('fails when a Phase 2C report differs from its evidence commit', () => {
    expect(evaluateEvidenceFreeze({ ...PASSING_INPUT, reportsMatchEvidenceCommit: false }).result).toBe('FAIL');
  });

  it('passes when reports are absent from the old tag but match their evidence commit', () => {
    expect(evaluateEvidenceFreeze(PASSING_INPUT)).toEqual({ result: 'PASS', errors: [] });
  });

  it('fails when the evidence commit is not an ancestor of HEAD', () => {
    expect(evaluateEvidenceFreeze({ ...PASSING_INPUT, evidenceCommitIsAncestor: false }).result).toBe('FAIL');
  });

  it('fails when either evidence report is missing', () => {
    expect(evaluateEvidenceFreeze({ ...PASSING_INPUT, reportsPresent: false }).result).toBe('FAIL');
  });

  it('fails when an evidence report is modified in the worktree', () => {
    expect(evaluateEvidenceFreeze({ ...PASSING_INPUT, reportsCleanInWorktree: false }).result).toBe('FAIL');
  });

  it('fails when an evidence report is modified in the index', () => {
    expect(evaluateEvidenceFreeze({ ...PASSING_INPUT, reportsCleanInIndex: false }).result).toBe('FAIL');
  });

  it.each([
    ['cannot be resolved', { baselineTagResolved: false }],
    ['was moved', { baselineTagMatchesAnchor: false }],
  ])('fails when the provisional baseline tag %s', (_label, override) => {
    expect(evaluateEvidenceFreeze({ ...PASSING_INPUT, ...override }).result).toBe('FAIL');
  });
});
