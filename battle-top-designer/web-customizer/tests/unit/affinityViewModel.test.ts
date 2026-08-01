import { describe, expect, it } from 'vitest';
import { resolveAffinityProfile } from '../../../shared/nss/affinity';
import { createAffinityViewModel } from '../../src/affinity/affinityViewModel';

describe('Chinese affinity view model', () => {
  it('explains a pure offense resonance and its matchup', () => {
    const view = createAffinityViewModel(resolveAffinityProfile({
      core: 'FIRE', blade: 'FIRE', assist: 'FIRE', gear: 'FIRE', tip: 'WATER',
    }));
    expect(view).toMatchObject({
      primary: { affinity: 'FIRE', label: '火' },
      resonance: { kind: 'offense', label: '纯属性进攻共鸣（4件）' },
      strengths: [{ affinity: 'WOOD', label: '木' }],
      weaknesses: [{ affinity: 'WATER', label: '水' }],
      bonuses: ['元素进攻 +10%'],
    });
    expect(view.counts.find(entry => entry.affinity === 'FIRE')?.count).toBe(4);
    expect(view.counts).toHaveLength(7);
  });

  it('explains harmony defense and stability without inventing elemental offense', () => {
    const view = createAffinityViewModel(resolveAffinityProfile({
      core: 'LIGHT', blade: 'WIND', assist: 'FIRE', gear: 'WATER', tip: 'EARTH',
    }));
    expect(view.primary.label).toBe('光');
    expect(view.resonance).toEqual({ kind: 'harmony', label: '协调共鸣（1-1-1-1-1）' });
    expect(view.strengths).toEqual([{ affinity: 'DARK', label: '暗' }]);
    expect(view.weaknesses).toEqual([{ affinity: 'DARK', label: '暗' }]);
    expect(view.bonuses).toEqual(['防御 +9%', '稳定性 +10%']);
  });
});
