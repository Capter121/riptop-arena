import { describe, expect, it } from 'vitest';
import {
  FIXED_BATTLE_DT,
  MAX_BATTLE_STEPS_PER_FRAME,
  FixedStepClock,
} from '../../src/sim/fixedStep';

function runCadence(framesPerSecond: number) {
  const clock = new FixedStepClock();
  let callbackCount = 0;
  for (let frame = 0; frame < framesPerSecond; frame += 1) {
    clock.advance(1 / framesPerSecond, () => {
      callbackCount += 1;
    });
  }
  while (clock.advance(0, () => { callbackCount += 1; }) > 0) {
    // Drain only backlog retained by the per-frame step cap.
  }
  return { clock, callbackCount };
}

describe('FixedStepClock', () => {
  it('uses a fixed 60 Hz battle step', () => {
    expect(FIXED_BATTLE_DT).toBe(1 / 60);
    expect(MAX_BATTLE_STEPS_PER_FRAME).toBe(4);
  });

  it.each([30, 60, 144])('executes 60 ticks for one second rendered at %i Hz', (fps) => {
    const { clock, callbackCount } = runCadence(fps);
    expect(callbackCount).toBe(60);
    expect(clock.tickCount).toBe(60);
    expect(clock.pendingTime).toBeLessThan(1e-10);
  });

  it('caps a frame at four ticks and retains the backlog', () => {
    const clock = new FixedStepClock();
    const ticks: number[] = [];

    expect(clock.advance(FIXED_BATTLE_DT * 12, (_dt, tick) => ticks.push(tick))).toBe(4);
    expect(clock.tickCount).toBe(4);
    expect(clock.pendingTime).toBeCloseTo(FIXED_BATTLE_DT * 8, 12);
    expect(clock.advance(0, (_dt, tick) => ticks.push(tick))).toBe(4);
    expect(clock.advance(0, (_dt, tick) => ticks.push(tick))).toBe(4);
    expect(ticks).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
    expect(clock.pendingTime).toBe(0);
  });

  it('handles floating point tick boundaries without losing a tick', () => {
    const clock = new FixedStepClock();
    let ticks = 0;
    expect(clock.advance(FIXED_BATTLE_DT - 1e-8, () => { ticks += 1; })).toBe(0);
    expect(clock.advance(1e-8, () => { ticks += 1; })).toBe(1);
    expect(ticks).toBe(1);
    expect(clock.pendingTime).toBe(0);
  });

  it('resets the accumulator and tick count', () => {
    const clock = new FixedStepClock();
    clock.advance(FIXED_BATTLE_DT * 2.5, () => {});
    expect(clock.tickCount).toBe(2);
    expect(clock.pendingTime).toBeGreaterThan(0);
    clock.reset();
    expect(clock.tickCount).toBe(0);
    expect(clock.pendingTime).toBe(0);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid frame dt %s', (dt) => {
    const clock = new FixedStepClock();
    expect(() => clock.advance(dt, () => {})).toThrow(RangeError);
  });
});
