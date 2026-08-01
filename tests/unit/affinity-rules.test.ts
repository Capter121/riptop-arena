import { describe, expect, it } from 'vitest';
import rules from '../../battle-top-designer/shared/nss/affinity-rules.json';
import {
  AFFINITIES,
  AFFINITY_DAMAGE_RULES,
  AFFINITY_RESONANCE_RULES,
  getAffinityRelation,
  type PartAffinity,
} from '../../battle-top-designer/shared/nss/affinity';

const advantages = new Set(rules.advantages.map(pair => `${pair.attacker}>${pair.defender}`));

describe('seven-affinity rules', () => {
  it('resolves all 49 attacker and defender combinations', () => {
    expect(AFFINITIES).toHaveLength(7);
    let checked = 0;

    for (const attacker of AFFINITIES) {
      for (const defender of AFFINITIES) {
        const direct = advantages.has(`${attacker}>${defender}`);
        const reverse = advantages.has(`${defender}>${attacker}`);
        const expected = direct ? 'advantage' : reverse ? 'disadvantage' : 'neutral';
        expect(getAffinityRelation(attacker, defender), `${attacker} -> ${defender}`).toBe(expected);
        checked += 1;
      }
    }

    expect(checked).toBe(49);
  });

  it('keeps LIGHT and DARK mutually advantaged and natural affinities neutral to them', () => {
    expect(getAffinityRelation('LIGHT', 'DARK')).toBe('advantage');
    expect(getAffinityRelation('DARK', 'LIGHT')).toBe('advantage');
    for (const affinity of ['WIND', 'FIRE', 'WATER', 'WOOD', 'EARTH'] as PartAffinity[]) {
      expect(getAffinityRelation(affinity, 'LIGHT')).toBe('neutral');
      expect(getAffinityRelation('DARK', affinity)).toBe('neutral');
    }
  });

  it('exposes the approved damage split, multipliers, and resonance thresholds', () => {
    expect(AFFINITY_DAMAGE_RULES).toEqual({
      physicalShare: 0.8,
      elementalShare: 0.2,
      advantageMultiplier: 1.25,
      disadvantageMultiplier: 0.8,
      neutralMultiplier: 1,
    });
    expect(AFFINITY_RESONANCE_RULES.offense).toEqual({ '3': 0.06, '4': 0.1, '5': 0.15 });
    expect(AFFINITY_RESONANCE_RULES.harmony).toEqual({
      '2-2-1': { defense: 0.05, stability: 0.06 },
      '2-1-1-1': { defense: 0.07, stability: 0.08 },
      '1-1-1-1-1': { defense: 0.09, stability: 0.1 },
    });
  });

  it('rejects unknown affinities', () => {
    expect(() => getAffinityRelation('ROCK', 'WATER')).toThrow('Unknown NSS affinity');
    expect(() => getAffinityRelation('FIRE', null)).toThrow('Unknown NSS affinity');
  });
});
