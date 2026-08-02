import { describe, expect, it } from 'vitest';
import {
  calculateCollisionTiltGain,
  calculateLowSpinTiltDelta,
  calculateNaturalSpinLoss,
} from '../../src/gameplay/affinityPhysics';
import { buildNssBattleStats } from '../../src/nss/buildStats';
import { createNssBattleLoadout, enumerateNssCombinations } from '../../src/nss/loadout';
import type { NssAffinitySelection } from '../../src/nss/types';

const combination = enumerateNssCombinations()[0];
const offense = buildNssBattleStats(createNssBattleLoadout(combination, {
  core: 'LIGHT',
  blade: 'LIGHT',
  assist: 'LIGHT',
  gear: 'LIGHT',
  tip: 'LIGHT',
}));

const harmonyCases = [
  {
    distribution: '2-2-1',
    affinities: { core: 'LIGHT', blade: 'LIGHT', assist: 'FIRE', gear: 'FIRE', tip: 'EARTH' },
    defenseMultiplier: 1.05,
    stabilityMultiplier: 0.94,
  },
  {
    distribution: '2-1-1-1',
    affinities: { core: 'LIGHT', blade: 'LIGHT', assist: 'FIRE', gear: 'WATER', tip: 'EARTH' },
    defenseMultiplier: 1.07,
    stabilityMultiplier: 0.92,
  },
  {
    distribution: '1-1-1-1-1',
    affinities: { core: 'LIGHT', blade: 'WIND', assist: 'FIRE', gear: 'WATER', tip: 'EARTH' },
    defenseMultiplier: 1.09,
    stabilityMultiplier: 0.90,
  },
] as const satisfies ReadonlyArray<{
  distribution: string;
  affinities: NssAffinitySelection;
  defenseMultiplier: number;
  stabilityMultiplier: number;
}>;

describe('harmony defense and stability', () => {
  it.each(harmonyCases)('applies $distribution only to derived armor', ({ affinities, defenseMultiplier }) => {
    const harmony = buildNssBattleStats(createNssBattleLoadout(combination, affinities));
    expect(harmony.armor).toBeCloseTo(offense.armor * defenseMultiplier, 10);
    expect(harmony.defense).toBe(offense.defense);
    expect(harmony.maxIntegrity).toBe(offense.maxIntegrity);
    expect(harmony.weight).toBe(offense.weight);
    expect(harmony.collisionRadius).toBe(offense.collisionRadius);
  });

  it.each(harmonyCases)('applies $distribution once to natural spin loss', ({ affinities, stabilityMultiplier }) => {
    const harmony = buildNssBattleStats(createNssBattleLoadout(combination, affinities));
    expect(calculateNaturalSpinLoss(0.5, 1.2, harmony.affinity)).toBeCloseTo(0.6 * stabilityMultiplier, 10);
  });

  it.each(harmonyCases)('scales only low-spin tilt growth for $distribution', ({ affinities, stabilityMultiplier }) => {
    const harmony = buildNssBattleStats(createNssBattleLoadout(combination, affinities));
    const expectedGrowth = 0.8 * 0.28 * 0.1 * 7 * stabilityMultiplier;
    const unchangedRecovery = 0.5 * 0.16 * 0.1 * 7;
    expect(calculateLowSpinTiltDelta(0.5, 0.8, 0.1, harmony.affinity))
      .toBeCloseTo(expectedGrowth - unchangedRecovery, 10);
    expect(calculateLowSpinTiltDelta(0.5, 0, 0.1, harmony.affinity))
      .toBeCloseTo(-unchangedRecovery, 10);
  });

  it.each(harmonyCases)('scales and caps collision tilt for $distribution', ({ affinities, stabilityMultiplier }) => {
    const harmony = buildNssBattleStats(createNssBattleLoadout(combination, affinities));
    expect(calculateCollisionTiltGain(10, harmony.affinity, false, false))
      .toBeCloseTo(0.025 * stabilityMultiplier, 10);
    expect(calculateCollisionTiltGain(100, harmony.affinity, false, false))
      .toBeCloseTo(0.04 * stabilityMultiplier, 10);
    expect(calculateCollisionTiltGain(10, harmony.affinity, true, false)).toBe(0);
    expect(calculateCollisionTiltGain(10, harmony.affinity, false, true)).toBe(0);
  });

  it('does not grant stability or defense to offense resonance', () => {
    expect(offense.affinity.resonance.kind).toBe('offense');
    expect(offense.affinity.modifiers).toMatchObject({
      defenseMultiplier: 1,
      spinDrainMultiplier: 1,
      tiltGrowthMultiplier: 1,
    });
    expect(calculateNaturalSpinLoss(0.5, 1.2, offense.affinity)).toBeCloseTo(0.6, 10);
    expect(calculateCollisionTiltGain(10, offense.affinity, false, false)).toBeCloseTo(0.025, 10);
  });
});
