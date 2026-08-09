import { describe, expect, it } from 'vitest';
import {
  AFFINITIES,
  AFFINITY_RESONANCE_RULES,
  resolveAffinityProfile,
  type AffinityLayers,
  type PartAffinity,
} from '../../battle-top-designer/shared/nss/affinity';
import type { BattleAffinityProfile } from '../../src/gameplay/battleAffinity';
import { calculateTurnDamage } from '../../src/gameplay/damage';
import type { BattleStats } from '../../src/gameplay/build';
import type { TopEntity } from '../../src/gameplay/top';
import { buildNssBattleStats } from '../../src/nss/buildStats';
import { createNssBattleLoadout, enumerateNssCombinations, nssCombinationId } from '../../src/nss/loadout';
import type { RandomSource } from '../../src/sim/rng';

const HIGH_RANDOM: RandomSource = {
  nextFloat: () => 1,
  nextUint32: () => 0xffff_ffff,
  nextInt: (_min, maxExclusive) => maxExclusive - 1,
};

const IDENTITY_MODIFIERS = {
  elementalPower: 1,
  defenseMultiplier: 1,
  spinDrainMultiplier: 1,
  tiltGrowthMultiplier: 1,
} as const;

function profile(primary: PartAffinity, elementalPower = 1): BattleAffinityProfile {
  return {
    source: 'nss',
    primary,
    resonance: elementalPower > 1
      ? { kind: 'offense', affinity: primary, count: 5, bonus: elementalPower - 1 }
      : { kind: 'none' },
    modifiers: { ...IDENTITY_MODIFIERS, elementalPower },
  };
}

function withAffinity(stats: BattleStats, affinity: BattleAffinityProfile): BattleStats {
  return { ...stats, affinity, armor: stats.armor / stats.affinity.modifiers.defenseMultiplier };
}

function fixedDamage(attacker: BattleStats, defender: BattleStats) {
  return calculateTurnDamage({
    attacker: { side: 'player', stats: attacker } as TopEntity,
    defender: { side: 'enemy', stats: defender } as TopEntity,
    skillTier: 2,
    isCounter: false,
    isClash: false,
    isBlockOrMiss: false,
    random: HIGH_RANDOM,
  }).finalDamage;
}

describe('affinity balance matrix gates', () => {
  it('keeps all 288 NSS combinations unique and buildable with affinity profiles', () => {
    const combinations = enumerateNssCombinations();
    expect(combinations).toHaveLength(288);
    expect(new Set(combinations.map(nssCombinationId)).size).toBe(288);
    for (const combination of combinations) {
      const stats = buildNssBattleStats(createNssBattleLoadout(combination));
      expect(stats.affinity.primary).not.toBeNull();
      expect(Number.isFinite(stats.attack + stats.armor + stats.maxSpin + stats.maxIntegrity)).toBe(true);
    }
  });

  it('exhausts all 7^5 affinity selections deterministically with exclusive resonance', () => {
    let count = 0;
    for (const core of AFFINITIES)
      for (const blade of AFFINITIES)
        for (const assist of AFFINITIES)
          for (const gear of AFFINITIES)
            for (const tip of AFFINITIES) {
              const layers: AffinityLayers = { core, blade, assist, gear, tip };
              const first = resolveAffinityProfile(layers);
              const second = resolveAffinityProfile({ ...layers });
              expect(second).toEqual(first);
              expect(AFFINITIES).toContain(first.primary);
              expect(Object.values(first.counts).reduce((sum, value) => sum + value, 0)).toBe(5);
              if (first.resonance.kind === 'offense') {
                expect(first.resonance.count).toBeGreaterThanOrEqual(3);
                expect(first.modifiers.defenseMultiplier).toBe(1);
                expect(first.modifiers.spinDrainMultiplier).toBe(1);
              } else if (first.resonance.kind === 'harmony') {
                expect(first.modifiers.elementalPower).toBe(1);
                expect(first.modifiers.defenseMultiplier).toBeGreaterThan(1);
                expect(first.modifiers.spinDrainMultiplier).toBeLessThan(1);
              } else {
                expect(first.modifiers).toEqual(IDENTITY_MODIFIERS);
              }
              count += 1;
            }
    expect(count).toBe(16_807);
  });

  it('bounds fixed affinity damage near -4% and +8.75%', () => {
    const base = buildNssBattleStats(createNssBattleLoadout(enumerateNssCombinations()[0]));
    const neutral = fixedDamage(withAffinity(base, profile('FIRE')), withAffinity(base, profile('EARTH')));
    const disadvantaged = fixedDamage(withAffinity(base, profile('FIRE')), withAffinity(base, profile('WATER')));
    const strongest = fixedDamage(
      withAffinity(base, profile('FIRE', 1 + AFFINITY_RESONANCE_RULES.offense['5'])),
      withAffinity(base, profile('WOOD')),
    );

    expect(disadvantaged / neutral).toBeCloseTo(0.96, 2);
    expect(strongest / neutral).toBeCloseTo(1.0875, 2);
  });

  it('preserves a 15% stronger neutral build against maximum affinity swing', () => {
    const builds = enumerateNssCombinations().map(combination =>
      buildNssBattleStats(createNssBattleLoadout(combination)));
    const defenderBase = builds[Math.floor(builds.length / 2)];
    const neutralDefender = withAffinity(defenderBase, profile('EARTH'));
    const disadvantagedDefender = withAffinity(defenderBase, profile('WATER'));
    const advantagedDefender = withAffinity(defenderBase, profile('WOOD'));
    const rows = builds.map(stats => ({
      stats,
      neutral: fixedDamage(withAffinity(stats, profile('FIRE')), neutralDefender),
      disadvantaged: fixedDamage(withAffinity(stats, profile('FIRE')), disadvantagedDefender),
      strongest: fixedDamage(
        withAffinity(stats, profile('FIRE', 1 + AFFINITY_RESONANCE_RULES.offense['5'])),
        advantagedDefender,
      ),
    }));
    let comparisons = 0;

    for (const stronger of rows) {
      for (const weaker of rows) {
        if (stronger.neutral < weaker.neutral * 1.15) continue;
        comparisons += 1;
        expect(stronger.disadvantaged).toBeGreaterThanOrEqual(weaker.strongest - 1);
      }
    }
    expect(comparisons).toBeGreaterThan(0);
  });
});
