import { describe, expect, it } from 'vitest';
import type { PartAffinity } from '../../battle-top-designer/shared/nss/affinity';
import type { BattleAffinityProfile } from '../../src/gameplay/battleAffinity';
import { buildStats, type BattleStats } from '../../src/gameplay/build';
import { calculateTurnDamage } from '../../src/gameplay/damage';
import { getSkillVisualSchool } from '../../src/gameplay/skills';
import type { TopEntity } from '../../src/gameplay/top';
import { DEFAULT_BUILD } from '../../src/data/parts';
import { ELEMENT_ATTACKS } from '../../src/types/battle';

const expectedAttacks = [
  { skillId: 'wind_blade', label: '风刃', icon: '🌪️', tier: 1, spiritCost: 20, color: '#7ef0ff', visualSchool: 'wind' },
  { skillId: 'aqua_surge', label: '水波', icon: '💧', tier: 2, spiritCost: 40, color: '#32b8ff', visualSchool: 'water' },
  { skillId: 'lightning_bolt', label: '闪电', icon: '⚡', tier: 3, spiritCost: 60, color: '#f7fbff', visualSchool: 'lightning' },
  { skillId: 'blazing_meteor', label: '火焰', icon: '🔥', tier: 4, spiritCost: 80, color: '#ff7b3d', visualSchool: 'fire' },
  { skillId: 'phantom_clone', label: '分身', icon: '👥', tier: 5, spiritCost: 100, color: '#b78cff', visualSchool: 'phantom' },
] as const;

function profile(primary: PartAffinity): BattleAffinityProfile {
  return {
    source: 'nss',
    primary,
    resonance: { kind: 'none' },
    modifiers: {
      elementalPower: 1,
      defenseMultiplier: 1,
      spinDrainMultiplier: 1,
      tiltGrowthMultiplier: 1,
    },
  };
}

function top(side: 'player' | 'enemy', primary: PartAffinity): TopEntity {
  const stats: BattleStats = {
    ...buildStats(DEFAULT_BUILD),
    attack: 0,
    armor: 30,
    evasion: 0,
    critChance: 0,
    affinity: profile(primary),
  };
  return { side, stats } as TopEntity;
}

describe('skill visuals and battle affinity', () => {
  it('adds a visual school without changing attack metadata or order', () => {
    expect(Object.values(ELEMENT_ATTACKS)).toEqual(expectedAttacks);
  });

  it('keeps frost presentation outside the five direct attack buttons', () => {
    expect(getSkillVisualSchool('frost_bite')).toBe('frost');
    expect(Object.keys(ELEMENT_ATTACKS)).not.toContain('frost_bite');
  });

  it('uses the same skill presentation while damage follows the attacker primary', () => {
    const fireDamage = calculateTurnDamage({
      attacker: top('player', 'FIRE'),
      defender: top('enemy', 'WOOD'),
      skillTier: ELEMENT_ATTACKS.wind_blade.tier,
      isCounter: false,
      isClash: false,
      isBlockOrMiss: false,
      random: () => 0.5,
    });
    const waterDamage = calculateTurnDamage({
      attacker: top('player', 'WATER'),
      defender: top('enemy', 'WOOD'),
      skillTier: ELEMENT_ATTACKS.wind_blade.tier,
      isCounter: false,
      isClash: false,
      isBlockOrMiss: false,
      random: () => 0.5,
    });

    expect(ELEMENT_ATTACKS.wind_blade.visualSchool).toBe('wind');
    expect(fireDamage).toMatchObject({ attackerAffinity: 'FIRE', affinityRelation: 'advantage' });
    expect(waterDamage).toMatchObject({ attackerAffinity: 'WATER', affinityRelation: 'neutral' });
    expect(fireDamage.finalDamage).toBeGreaterThan(waterDamage.finalDamage);
  });
});
