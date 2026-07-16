import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluatePerformance } from '../../scripts/evaluate-performance.mjs';

function report(overrides = {}) {
  const profile = {
    coldCache: { interactionReadyMs: { median: 800 } },
    coldSwitchMs: { p95: 900 },
    cachedSwitchMs: { p95: 250 },
    memory: {
      status: 'MEASURED',
      beforeBytes: 10_000_000,
      deltaBytes: 100_000,
      resourcesBefore: { geometries: 20, textures: 2, programs: 2 },
      resourcesAfter: { geometries: 20, textures: 2, programs: 2 },
    },
    errors: { console: 0, pageerror: 0, failedRequest: 0, externalRequest: 0 },
  };
  return {
    bundle: { totalGzipBytes: 350_000 },
    profiles: { desktop: structuredClone(profile), mobile: structuredClone(profile) },
    ...overrides,
  };
}

test('passes fixed performance, memory, resource and browser-error budgets', () => {
  assert.deepEqual(evaluatePerformance(report()), { status: 'PASS', errors: [] });
});

test('fails a cached mobile switch over 300 ms without relaxing the budget', () => {
  const input = report();
  input.profiles.mobile.cachedSwitchMs.p95 = 300.01;
  assert.deepEqual(evaluatePerformance(input), {
    status: 'FAIL',
    errors: ['MOBILE_CACHED_SWITCH_BUDGET'],
  });
});

test('reports unavailable memory as NOT_MEASURABLE instead of PASS', () => {
  const input = report();
  input.profiles.desktop.memory = { status: 'NOT_MEASURABLE' };
  assert.deepEqual(evaluatePerformance(input), {
    status: 'NOT_MEASURABLE',
    errors: ['DESKTOP_MEMORY_NOT_MEASURABLE'],
  });
});
