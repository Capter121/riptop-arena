import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/battle-baseline.json';
import { buildStats, type BattleStats } from '../../src/gameplay/build';
import { calculateTurnDamage } from '../../src/gameplay/damage';
import type { TopEntity } from '../../src/gameplay/top';
import { buildNssBattleStats } from '../../src/nss/buildStats';
import { createNssBattleLoadout } from '../../src/nss/loadout';
import type { BuildSelection } from '../../src/data/parts';
import type { NssCombination } from '../../src/nss/types';

function statsFor(testCase: (typeof fixture.cases)[number]): BattleStats {
  return testCase.kind === 'legacy'
    ? buildStats(testCase.build as BuildSelection)
    : buildNssBattleStats(createNssBattleLoadout(testCase.combination as NssCombination));
}

function damageTop(side: 'player' | 'enemy', stats: BattleStats): TopEntity {
  return { side, stats } as TopEntity;
}

describe('pre-affinity battle baseline', () => {
  const defenderCase = fixture.cases.find(testCase => testCase.id === fixture.damageContext.defenderCase)!;
  const defenderStats = statsFor(defenderCase);

  it.each(fixture.cases)('freezes public stats and damage for $id', (testCase) => {
    const stats = statsFor(testCase);
    const expected = testCase.expected;

    expect(stats).toHaveProperty('affinity');
    expect(stats.maxSpin).toBeCloseTo(expected.maxSpin, 8);
    expect(stats.maxIntegrity).toBeCloseTo(expected.maxIntegrity, 8);
    expect(stats.armor).toBeCloseTo(expected.armor * stats.affinity.modifiers.defenseMultiplier, 8);
    expect(stats.evasion).toBeCloseTo(expected.evasion, 8);
    expect(stats.weight).toBeCloseTo(expected.weight, 8);

    const damage = calculateTurnDamage({
      attacker: damageTop('player', stats),
      defender: damageTop('enemy', defenderStats),
      skillTier: 2,
      isCounter: false,
      isClash: false,
      isBlockOrMiss: false,
      random: () => fixture.damageContext.random,
    });

    expect(damage.finalDamage).toBe(expected.damageAgainstLegacy);
    expect(damage.didCrit).toBe(false);
    expect(damage.didMiss).toBe(false);
  });
});
