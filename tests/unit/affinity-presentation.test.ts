import { describe, expect, it } from 'vitest';
import type { BattleAffinityProfile } from '../../src/gameplay/battleAffinity';
import type { DamageResult } from '../../src/gameplay/damage';
import {
  accumulateAffinityDamageSummary,
  createAffinityMatchupPresentation,
  createEmptyAffinityDamageSummary,
  formatAffinityDamageLog,
  getAffinityBadge,
  getResonanceLabel,
} from '../../src/ui/affinityPresentation';

const IDENTITY_MODIFIERS = {
  elementalPower: 1,
  defenseMultiplier: 1,
  spinDrainMultiplier: 1,
  tiltGrowthMultiplier: 1,
} as const;

function profile(
  primary: BattleAffinityProfile['primary'],
  resonance: BattleAffinityProfile['resonance'] = { kind: 'none' },
): BattleAffinityProfile {
  return {
    source: primary ? 'nss' : 'neutral',
    primary,
    resonance,
    modifiers: IDENTITY_MODIFIERS,
  };
}

function damage(overrides: Partial<DamageResult> = {}): DamageResult {
  return {
    skillTier: 2,
    skillBaseDamage: 18,
    attackBonus: 10,
    contextMultiplier: 1,
    rawDamage: 28,
    finalDamage: 24,
    armorReduced: 4,
    physicalDamage: 18,
    elementalDamage: 6,
    attackerAffinity: 'FIRE',
    defenderAffinity: 'WOOD',
    affinityRelation: 'advantage',
    resonanceContribution: 2,
    relationContribution: 3,
    didCrit: false,
    didMiss: false,
    lockDamage: 10,
    tags: ['hit'],
    defender: 'enemy',
    ...overrides,
  };
}

describe('affinity presentation', () => {
  it('maps every affinity and neutral to stable player-facing badges', () => {
    expect(getAffinityBadge('FIRE')).toEqual({ key: 'FIRE', label: '火', color: '#ff6b45' });
    expect(getAffinityBadge('LIGHT')).toEqual({ key: 'LIGHT', label: '光', color: '#fff1a8' });
    expect(getAffinityBadge(null)).toEqual({ key: 'NEUTRAL', label: '无', color: '#93a4b8' });
  });

  it('formats offense, harmony, and absent resonance without recalculating it', () => {
    expect(getResonanceLabel(profile('FIRE', { kind: 'offense', affinity: 'FIRE', count: 4, bonus: 0.16 })))
      .toBe('火系进攻共鸣 · 4件 · +16%');
    expect(getResonanceLabel(profile('WIND', {
      kind: 'harmony',
      distribution: '2-2-1',
      defenseBonus: 0.08,
      stabilityBonus: 0.1,
    }))).toBe('调和共鸣 · 防御 +8% · 稳定 +10%');
    expect(getResonanceLabel(profile(null))).toBe('无共鸣');
  });

  it('presents ordinary and light-dark matchups from supplied relations', () => {
    expect(createAffinityMatchupPresentation(
      profile('FIRE'),
      profile('WOOD'),
      'advantage',
      'disadvantage',
    ).relationLabel).toBe('我方克制敌方');

    expect(createAffinityMatchupPresentation(
      profile('LIGHT'),
      profile('DARK'),
      'advantage',
      'advantage',
    ).relationLabel).toBe('光暗双向克制');
  });

  it('explains effective advantage, disadvantage, and offense resonance contributions', () => {
    expect(formatAffinityDamageLog(damage())).toBe('属性优势 +3 · 进攻共鸣 +2');
    expect(formatAffinityDamageLog(damage({ affinityRelation: 'disadvantage', relationContribution: -3, resonanceContribution: 0 })))
      .toBe('属性劣势 -3');
    expect(formatAffinityDamageLog(damage({ didMiss: true, finalDamage: 0 }))).toBe('');
  });

  it('accumulates dealt and taken damage from the local player perspective', () => {
    let summary = createEmptyAffinityDamageSummary();
    summary = accumulateAffinityDamageSummary(summary, damage());
    summary = accumulateAffinityDamageSummary(summary, damage({
      defender: 'player',
      physicalDamage: 12,
      elementalDamage: 4,
      resonanceContribution: 1,
      relationContribution: -2,
    }));
    summary = accumulateAffinityDamageSummary(summary, damage({ didMiss: true, finalDamage: 0 }));

    expect(summary).toEqual({
      dealt: { physical: 18, elemental: 6, resonance: 2, relation: 3 },
      taken: { physical: 12, elemental: 4, resonance: 1, relation: -2 },
    });
  });
});
