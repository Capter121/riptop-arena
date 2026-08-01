import { describe, expect, it } from 'vitest';
import { stormAttack, defaultAffinities } from '../../src/domain';
import { compareAffinityCandidate, comparePartCandidate } from '../../src/comparison/comparisonModel';

describe('customizer comparison model', () => {
  it('compares a candidate part in stable attribute order without mutating the combination', () => {
    const current = structuredClone(stormAttack);
    const before = structuredClone(current);

    expect(comparePartCandidate(current, 'blade', 'blade_orbit_halo')).toEqual({
      key: 'part:blade:blade_orbit_halo',
      kind: 'part',
      title: 'Storm Fang → Orbit Halo',
      items: [
        { key: 'attack', label: '攻击', kind: 'delta', delta: -11 },
        { key: 'defense', label: '防御', kind: 'delta', delta: 5 },
        { key: 'stamina', label: '持久', kind: 'delta', delta: 11 },
        { key: 'balance', label: '平衡', kind: 'delta', delta: 3 },
        { key: 'weight', label: '重量倾向', kind: 'delta', delta: -3 },
        { key: 'height', label: '高度倾向', kind: 'delta', delta: -1 },
      ],
    });
    expect(current).toEqual(before);
  });

  it('rejects the current, unknown, and family-mismatched part candidates', () => {
    expect(comparePartCandidate(stormAttack, 'blade', 'blade_storm_fang')).toBeNull();
    expect(comparePartCandidate(stormAttack, 'blade', 'unknown_part')).toBeNull();
    expect(comparePartCandidate(stormAttack, 'blade', 'assist_guard')).toBeNull();
  });

  it('compares affinity counts, primary, harmony, and bonuses without mutating affinities', () => {
    const current = defaultAffinities(stormAttack);
    const before = structuredClone(current);

    expect(compareAffinityCandidate(current, 'blade', 'FIRE')).toEqual({
      key: 'affinity:blade:FIRE',
      kind: 'affinity',
      title: '风 → 火',
      items: [
        { key: 'count-WIND', label: '风数量', kind: 'transition', before: '1', after: '0', direction: 'down' },
        { key: 'count-FIRE', label: '火数量', kind: 'transition', before: '1', after: '2', direction: 'up' },
        { key: 'primary', label: '主属性', kind: 'transition', before: '光', after: '火', direction: 'change' },
        { key: 'resonance', label: '共鸣', kind: 'transition', before: '协调共鸣（1-1-1-1-1）', after: '协调共鸣（2-1-1-1）', direction: 'change' },
        { key: 'bonuses', label: '加成', kind: 'transition', before: '防御 +9% · 稳定性 +10%', after: '防御 +7% · 稳定性 +8%', direction: 'change' },
      ],
    });
    expect(current).toEqual(before);
  });

  it('explains gaining and losing offense resonance and returns null for the current affinity', () => {
    const twoFire = { core: 'LIGHT', blade: 'FIRE', assist: 'FIRE', gear: 'WATER', tip: 'EARTH' } as const;
    const gained = compareAffinityCandidate(twoFire, 'gear', 'FIRE');
    expect(gained?.items.find(item => item.key === 'resonance')).toEqual({
      key: 'resonance', label: '共鸣', kind: 'transition', before: '协调共鸣（2-1-1-1）', after: '纯属性进攻共鸣（3件）', direction: 'change',
    });
    expect(gained?.items.find(item => item.key === 'bonuses')).toEqual({
      key: 'bonuses', label: '加成', kind: 'transition', before: '防御 +7% · 稳定性 +8%', after: '元素进攻 +6%', direction: 'change',
    });

    const threeFire = { ...twoFire, gear: 'FIRE' } as const;
    const lost = compareAffinityCandidate(threeFire, 'gear', 'WATER');
    expect(lost?.items.find(item => item.key === 'resonance')).toEqual({
      key: 'resonance', label: '共鸣', kind: 'transition', before: '纯属性进攻共鸣（3件）', after: '协调共鸣（2-1-1-1）', direction: 'change',
    });
    expect(compareAffinityCandidate(twoFire, 'blade', 'FIRE')).toBeNull();
  });
});
