import { describe, expect, it } from 'vitest';
import {
  PHASE3B_MARKS,
  beginPartSwitch,
  endPartSwitch,
  markOnce,
} from '../../src/performance/marks';

class FakePerformance {
  entries: string[] = [];
  measures: string[] = [];
  getEntriesByName(name: string) { return this.entries.includes(name) ? [{ name }] : []; }
  mark(name: string) { this.entries.push(name); }
  measure(name: string) { this.measures.push(name); }
}

describe('Phase 3B stable performance markers', () => {
  it('defines the exact approved marker names', () => {
    expect(PHASE3B_MARKS).toEqual([
      'phase3b:shell-ready',
      'phase3b:scene-runtime-loaded',
      'phase3b:first-model-ready',
      'phase3b:interaction-ready',
      'phase3b:part-switch-start',
      'phase3b:part-switch-end',
    ]);
  });

  it('marks one-time milestones once', () => {
    const performance = new FakePerformance();
    markOnce('phase3b:shell-ready', performance as unknown as Performance);
    markOnce('phase3b:shell-ready', performance as unknown as Performance);
    expect(performance.entries).toEqual(['phase3b:shell-ready']);
  });

  it('records a switch duration only after a matching start', () => {
    const performance = new FakePerformance();
    expect(endPartSwitch(performance as unknown as Performance)).toBe(false);
    beginPartSwitch(performance as unknown as Performance);
    expect(endPartSwitch(performance as unknown as Performance)).toBe(true);
    expect(performance.measures).toEqual(['phase3b:part-switch-duration']);
  });
});
