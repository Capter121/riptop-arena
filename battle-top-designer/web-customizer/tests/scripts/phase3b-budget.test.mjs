import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateBudgets } from '../../scripts/analyze-bundle.mjs';

const metrics = { shellGzipBytes: 100_000, totalGzipBytes: 350_000 };

test('passes metrics within the fixed Phase 3B budgets', () => {
  assert.deepEqual(evaluateBudgets(metrics), { status: 'PASS', errors: [] });
});

test('fails over-budget and missing metrics without changing thresholds', () => {
  assert.deepEqual(evaluateBudgets({ ...metrics, shellGzipBytes: 120_001 }), { status: 'FAIL', errors: ['SHELL_GZIP_BUDGET'] });
  assert.deepEqual(evaluateBudgets({ shellGzipBytes: Number.NaN, totalGzipBytes: 1 }), { status: 'FAIL', errors: ['MISSING_SHELL_GZIP'] });
});
