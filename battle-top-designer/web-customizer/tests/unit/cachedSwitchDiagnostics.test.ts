import { describe, expect, it } from 'vitest';
import {
  CACHED_SWITCH_MARKS,
  CachedSwitchRecorder,
  summarizeCachedSwitches,
  type CachedSwitchResources,
} from '../../src/performance/cachedSwitchDiagnostics';

const resources: CachedSwitchResources = { geometries: 20, textures: 2, programs: 2 };

describe('cached switch diagnostics', () => {
  it('records the exact approved stage order and completes only for the displayed combination', () => {
    let now = 0;
    const recorder = new CachedSwitchRecorder(() => now, () => 1_000, () => resources);
    recorder.enable();
    recorder.begin({ family: 'blade', previousPartId: 'a', nextPartId: 'b', combinationId: 'nss-p2c-0002', focusState: 'idle', cacheHit: true });
    for (const mark of CACHED_SWITCH_MARKS.slice(1, -1)) { now += 2; recorder.mark(mark); }
    expect(recorder.complete('wrong-id')).toBeNull();
    now += 2;
    const sample = recorder.complete('nss-p2c-0002');
    expect(Object.keys(sample!.marks)).toEqual(CACHED_SWITCH_MARKS);
    expect(sample).toMatchObject({ cacheHit: true, totalDurationMs: 18, heapBefore: 1_000, heapAfter: 1_000 });
  });

  it('ignores duplicate stage callbacks and invalidates an older transaction', () => {
    let now = 0;
    const recorder = new CachedSwitchRecorder(() => ++now, () => 0, () => resources);
    recorder.enable();
    recorder.begin({ family: 'blade', previousPartId: 'a', nextPartId: 'b', combinationId: 'one', focusState: 'idle', cacheHit: true });
    recorder.mark('cached-switch:clone-start');
    recorder.mark('cached-switch:clone-start');
    recorder.begin({ family: 'blade', previousPartId: 'b', nextPartId: 'c', combinationId: 'two', focusState: 'idle', cacheHit: true });
    expect(recorder.complete('one')).toBeNull();
    expect(recorder.activeCombinationId()).toBe('two');
  });

  it('caps retained diagnostic samples without changing the fixed protocol input', () => {
    let now = 0;
    const recorder = new CachedSwitchRecorder(() => ++now, () => 0, () => resources, 300);
    recorder.enable();
    for (let index = 0; index < 305; index += 1) {
      recorder.begin({ family: 'blade', previousPartId: 'a', nextPartId: 'b', combinationId: String(index), focusState: 'idle', cacheHit: true });
      recorder.mark('cached-switch:stable-frame');
      recorder.complete(String(index));
    }
    expect(recorder.samples()).toHaveLength(300);
    expect(recorder.samples()[0].combinationId).toBe('5');
  });

  it('reports fixed percentiles, per-stage p95 and the slowest ten samples', () => {
    const samples = Array.from({ length: 250 }, (_, index) => ({
      session: index + 1,
      family: 'blade', previousPartId: 'a', nextPartId: 'b', combinationId: String(index), focusState: 'idle', cacheHit: true,
      marks: Object.fromEntries(CACHED_SWITCH_MARKS.map(mark => [mark, mark === 'cached-switch:intent' ? 0 : index + 1])),
      stages: { total: index + 1 }, totalDurationMs: index + 1, heapBefore: 0, heapAfter: 0,
      resourcesBefore: resources, resourcesAfter: resources, gcLongTask: false, longTasksOver50Ms: 0,
      rootCloneDurationMs: 1, materialPreparationDurationMs: 1, mountCalculationDurationMs: 1,
    }));
    const summary = summarizeCachedSwitches(samples);
    expect(summary).toMatchObject({ sampleCount: 250, p50: 125, p90: 225, p95: 238, p99: 248, max: 250 });
    expect(summary.slowest).toHaveLength(10);
    expect(summary.slowest[0].totalDurationMs).toBe(250);
  });
});
