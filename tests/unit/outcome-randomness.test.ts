import { describe, expect, it } from 'vitest';
import { DEFAULT_BUILD } from '../../src/data/parts';
import { buildStats } from '../../src/gameplay/build';
import { calculateTurnDamage } from '../../src/gameplay/damage';
import { createPickupSpawnPosition } from '../../src/gameplay/pickups';
import { selectPhantomCloneIndex } from '../../src/gameplay/skills';
import type { TopEntity } from '../../src/gameplay/top';
import type { RandomSource } from '../../src/sim/rng';

function sequenceRandom(values: number[]): RandomSource {
  let index = 0;
  const next = () => {
    const value = values[index];
    if (value === undefined) throw new Error(`Missing random value at index ${index}.`);
    index += 1;
    return value;
  };
  return {
    nextFloat: next,
    nextUint32: () => Math.floor(next() * 0x1_0000_0000) >>> 0,
    nextInt: (min, maxExclusive) => min + Math.floor(next() * (maxExclusive - min)),
  };
}

function damageTop(side: 'player' | 'enemy', overrides = {}) {
  return {
    side,
    stats: { ...buildStats(DEFAULT_BUILD), evasion: 0, critChance: 0, ...overrides },
  } as TopEntity;
}

describe('deterministic outcome randomness', () => {
  it('uses the combat stream for miss, critical, and normal hit branches', () => {
    const attacker = damageTop('player', { critChance: 0.5 });
    const evasive = damageTop('enemy', { evasion: 0.5 });
    const steady = damageTop('enemy');
    const base = {
      attacker,
      skillTier: 1 as const,
      isCounter: false,
      isClash: false,
      isBlockOrMiss: false,
    };

    expect(calculateTurnDamage({ ...base, defender: evasive, random: sequenceRandom([0.2]) }).didMiss).toBe(true);
    expect(calculateTurnDamage({ ...base, defender: steady, random: sequenceRandom([0.8, 0.2]) }).didCrit).toBe(true);
    expect(calculateTurnDamage({ ...base, defender: steady, random: sequenceRandom([0.8, 0.8]) }).tags).toContain('hit');
  });

  it('selects the phantom destination from the physics stream', () => {
    expect(selectPhantomCloneIndex(2, sequenceRandom([0]))).toBe(0);
    expect(selectPhantomCloneIndex(2, sequenceRandom([0.999]))).toBe(1);
  });

  it('creates pickup coordinates from exactly two spawn draws', () => {
    const position = createPickupSpawnPosition(sequenceRandom([0.25, 0.5]));
    expect(position.x).toBeCloseTo(0, 12);
    expect(position.z).toBeCloseTo(4.3, 12);
  });
});
