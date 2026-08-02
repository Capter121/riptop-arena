import { describe, expect, it } from 'vitest';
import { resolveAffinityProfile, type AffinityLayers } from '../../../shared/nss/affinity';
import {
  resolveBuildProfile,
  type BuildProfileAttributes,
} from '../../../shared/nss/build-profile';

const harmony = resolveAffinityProfile({
  core: 'LIGHT', blade: 'WIND', assist: 'FIRE', gear: 'WATER', tip: 'EARTH',
});

function offense(count: 3 | 4 | 5) {
  const layers: AffinityLayers = count === 3
    ? { core: 'FIRE', blade: 'FIRE', assist: 'FIRE', gear: 'WATER', tip: 'EARTH' }
    : count === 4
      ? { core: 'FIRE', blade: 'FIRE', assist: 'FIRE', gear: 'FIRE', tip: 'EARTH' }
      : { core: 'FIRE', blade: 'FIRE', assist: 'FIRE', gear: 'FIRE', tip: 'FIRE' };
  return resolveAffinityProfile(layers);
}

const attributes = (
  attack: number, defense: number, stamina: number, balance: number, weight: number, height = 50,
): BuildProfileAttributes => ({ attack, defense, stamina, balance, weight, height });

describe('NSS build profile resolver', () => {
  it.each([
    ['ASSAULT', attributes(100, 20, 20, 80, 80)],
    ['FORTRESS', attributes(20, 100, 30, 70, 90)],
    ['ENDURANCE', attributes(25, 40, 100, 80, 40)],
    ['COUNTER', attributes(80, 80, 20, 80, 20)],
    ['BALANCED', attributes(70, 70, 70, 70, 50)],
  ] as const)('classifies a fixed %s example', (expected, values) => {
    expect(resolveBuildProfile(values, harmony).primary).toBe(expected);
  });

  it('activates burst only for offense resonance at the approved 3/4/5 scores', () => {
    const neutral = attributes(50, 50, 50, 50, 50);
    expect(resolveBuildProfile(neutral, harmony).primary).toBe('BALANCED');
    expect(resolveBuildProfile(neutral, offense(3)).primary).toBe('BALANCED');
    expect(resolveBuildProfile(neutral, offense(4)).primary).toBe('BURST');
    expect(resolveBuildProfile(neutral, offense(5))).toMatchObject({
      primary: 'BURST',
      reasons: [{ kind: 'offense-resonance', affinity: 'FIRE', count: 5, bonus: 0.15 }],
    });
  });

  it('uses the approved fixed tie order and limits secondary tendencies to two', () => {
    expect(resolveBuildProfile(attributes(100, 100, 100, 100, 100), offense(5))).toMatchObject({
      primary: 'BURST',
      secondary: ['COUNTER', 'ENDURANCE'],
    });
  });

  it('includes secondary tendencies at the six-point and 55-point boundaries only', () => {
    expect(resolveBuildProfile(attributes(70, 60, 0, 70, 70), harmony).secondary).toEqual(['FORTRESS']);
    expect(resolveBuildProfile(attributes(70, 59, 0, 70, 70), harmony).secondary).toEqual([]);
    expect(resolveBuildProfile(attributes(60, 51.67, 0, 60, 60), harmony).secondary).toEqual(['FORTRESS']);
    expect(resolveBuildProfile(attributes(60, 51.65, 0, 60, 60), harmony).secondary).toEqual([]);
  });

  it('applies harmony only to balanced scoring and returns stable structured reasons', () => {
    expect(resolveBuildProfile(attributes(70, 70, 70, 70, 50), harmony)).toEqual({
      primary: 'BALANCED',
      secondary: [],
      reasons: [
        { kind: 'balance-spread', value: 0 },
        { kind: 'harmony', distribution: '1-1-1-1-1', defenseBonus: 0.09, stabilityBonus: 0.1 },
      ],
    });
    expect(resolveBuildProfile(attributes(80, 80, 20, 80, 20), harmony).reasons).toEqual([
      { kind: 'counter-floor', attribute: 'attack', value: 80 },
      { kind: 'attribute', attribute: 'defense', value: 80 },
      { kind: 'attribute', attribute: 'balance', value: 80 },
    ]);
  });

  it('does not mutate inputs and returns equal results for repeated calls', () => {
    const values = Object.freeze(attributes(100, 20, 20, 80, 80));
    const before = structuredClone(values);
    const first = resolveBuildProfile(values, harmony);
    const second = resolveBuildProfile(values, harmony);
    expect(values).toEqual(before);
    expect(second).toEqual(first);
  });

  it.each([
    [{ attack: 50, defense: 50, stamina: 50, balance: 50, weight: 50 }],
    [attributes(Number.NaN, 50, 50, 50, 50)],
    [attributes(Number.POSITIVE_INFINITY, 50, 50, 50, 50)],
    [attributes(-1, 50, 50, 50, 50)],
    [attributes(101, 50, 50, 50, 50)],
  ])('rejects incomplete or out-of-range attributes', value => {
    expect(() => resolveBuildProfile(value as BuildProfileAttributes, harmony)).toThrow('Invalid NSS build profile attributes');
  });
});
