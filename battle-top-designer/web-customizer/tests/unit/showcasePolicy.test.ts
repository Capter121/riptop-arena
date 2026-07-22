import { describe, expect, it } from 'vitest';
import { showcasePolicy, turntableRotationDelta } from '../../src/rendering/showcasePolicy';

describe('showcase turntable policy', () => {
  it('is deterministic and stationary unless enabled', () => {
    expect(turntableRotationDelta(false, false, 'slow', 1)).toBe(0);
    expect(turntableRotationDelta(true, true, 'normal', 1)).toBe(0);
    expect(turntableRotationDelta(true, false, 'slow', 2)).toBe(showcasePolicy.turntableRadiansPerSecond.slow * 2);
  });

  it('keeps Normal faster than Slow without binding motion to frame rate', () => {
    expect(showcasePolicy.turntableRadiansPerSecond.normal).toBeGreaterThan(showcasePolicy.turntableRadiansPerSecond.slow);
    expect(turntableRotationDelta(true, false, 'normal', 0.5)).toBe(turntableRotationDelta(true, false, 'normal', 1) / 2);
  });
});
