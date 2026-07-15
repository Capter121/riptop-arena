import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeSamples } from '../../scripts/summarize-phase3b-performance.mjs';

test('summarizes performance samples with median and p95', () => {
  assert.deepEqual(summarizeSamples([40, 10, 30, 20, 50]), { median: 30, p95: 50, samples: [10, 20, 30, 40, 50] });
});

test('rejects missing and non-finite samples', () => {
  assert.throws(() => summarizeSamples([]), /sample/i);
  assert.throws(() => summarizeSamples([1, Number.NaN]), /finite/i);
});
