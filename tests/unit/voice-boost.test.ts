import { describe, expect, it } from 'vitest';
import { createBattleSimulationContext } from '../../src/sim/battleSeed';
import { FIXED_BATTLE_DT } from '../../src/sim/fixedStep';
import type { RandomSource } from '../../src/sim/rng';
import {
  DeterministicAiVoiceBoost,
  decodePlayerVoiceFrame,
  encodePlayerVoiceFrame,
} from '../../src/sim/voiceBoost';

const SEED = '0123456789abcdef0123456789abcdef';

function countingRandom(value = 0.5) {
  let calls = 0;
  const random: RandomSource = {
    nextUint32: () => { calls += 1; return Math.floor(value * 0x1_0000_0000) >>> 0; },
    nextFloat: () => { calls += 1; return value; },
    nextInt: (min) => { calls += 1; return min; },
  };
  return { random, calls: () => calls };
}

describe('player voice frames', () => {
  it.each([
    [-1, 0],
    [0, 0],
    [0.5, 128],
    [1, 255],
    [2, 255],
    [Number.NaN, 0],
  ])('encodes %s as %i', (raw, encoded) => {
    expect(encodePlayerVoiceFrame(raw)).toBe(encoded);
  });

  it('decodes only canonical byte values', () => {
    expect(decodePlayerVoiceFrame(0)).toBe(0);
    expect(decodePlayerVoiceFrame(128)).toBeCloseTo(128 / 255, 12);
    expect(decodePlayerVoiceFrame(255)).toBe(1);
    for (const invalid of [-1, 1.5, 256]) {
      expect(() => decodePlayerVoiceFrame(invalid)).toThrow(RangeError);
    }
  });
});

describe('deterministic AI voice boost', () => {
  it('replays the same fixed-tick sequence from the same AI stream', () => {
    const first = new DeterministicAiVoiceBoost(createBattleSimulationContext(SEED).random.ai);
    const second = new DeterministicAiVoiceBoost(createBattleSimulationContext(SEED).random.ai);
    first.triggerShout(0.5);
    second.triggerShout(0.5);
    expect(Array.from({ length: 60 }, () => first.update()))
      .toEqual(Array.from({ length: 60 }, () => second.update()));
  });

  it('consumes one initial value and one value per shout tick only', () => {
    const source = countingRandom();
    const boost = new DeterministicAiVoiceBoost(source.random);
    expect(source.calls()).toBe(1);
    boost.update();
    boost.update();
    expect(source.calls()).toBe(1);
    boost.triggerShout(FIXED_BATTLE_DT * 2);
    boost.update();
    boost.update();
    expect(source.calls()).toBe(3);
    boost.update();
    expect(source.calls()).toBe(3);
  });

  it('resets all state against a fresh stream', () => {
    const boost = new DeterministicAiVoiceBoost(createBattleSimulationContext(SEED).random.ai);
    boost.triggerShout(0.25);
    const expected = Array.from({ length: 30 }, () => boost.update());
    boost.reset(createBattleSimulationContext(SEED).random.ai);
    boost.triggerShout(0.25);
    expect(Array.from({ length: 30 }, () => boost.update())).toEqual(expected);
  });

  it('always returns a normalized volume', () => {
    const boost = new DeterministicAiVoiceBoost(createBattleSimulationContext(SEED).random.ai);
    boost.triggerShout(2);
    for (let index = 0; index < 240; index += 1) {
      const volume = boost.update();
      expect(volume).toBeGreaterThanOrEqual(0);
      expect(volume).toBeLessThanOrEqual(1);
    }
  });
});
