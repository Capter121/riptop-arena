import { describe, expect, it } from 'vitest';
import { advanceTurnChargeCadence } from '../../src/fx/turnChargeCadence';

function countEmissions(fps: number) {
  let elapsed = 0;
  let emissions = 0;

  for (let frame = 0; frame < fps; frame += 1) {
    const next = advanceTurnChargeCadence(elapsed, 1 / fps);
    elapsed = next.elapsed;
    if (next.emit) emissions += 1;
  }

  return emissions;
}

describe('turn charge particle cadence', () => {
  it.each([30, 60, 144])('emits about fifteen times per second at %iHz', (fps) => {
    expect(countEmissions(fps)).toBeGreaterThanOrEqual(14);
    expect(countEmissions(fps)).toBeLessThanOrEqual(15);
  });

  it('emits at most once for a long frame', () => {
    expect(advanceTurnChargeCadence(0, 0.5).emit).toBe(true);
  });

  it('does not inherit partial progress after the caller resets elapsed time', () => {
    const partial = advanceTurnChargeCadence(0, 1 / 30);
    expect(partial.emit).toBe(false);
    expect(advanceTurnChargeCadence(0, 1 / 30).emit).toBe(false);
  });

  it('ignores zero, negative, and non-finite frame deltas', () => {
    for (const dt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(advanceTurnChargeCadence(0.02, dt)).toEqual({ elapsed: 0.02, emit: false });
    }
  });
});
