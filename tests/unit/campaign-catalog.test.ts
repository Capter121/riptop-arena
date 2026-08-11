import { describe, expect, it } from 'vitest';
import { AFFINITIES } from '../../battle-top-designer/shared/nss/affinity';
import { nssPartById } from '../../src/nss/catalog';
import {
  CAMPAIGN_CONFIG_VERSION,
  CAMPAIGN_OPPONENTS,
  CAMPAIGN_OPPONENT_BY_ID,
  assertCampaignCatalog,
} from '../../src/data/campaign/opponents';

const expectedOpponents = [
  ['blaze-fang', '烈焰獠牙', 'assault', [0, 0, 0], 2],
  ['sky-gale', '苍穹风刃', 'skirmisher', [1, 0, 1], 2],
  ['abyss-tide', '碧潮回旋', 'control', [1, 1, 1], 2],
  ['forest-crown', '森罗根冠', 'sustain', [2, 1, 2], 2],
  ['rift-drift', '裂隙漂移', 'ringout', [2, 2, 3], 2],
  ['dawn-verdict', '曙光裁决', 'counter', [3, 3, 3], 2],
  ['night-eclipse', '永夜蚀翼', 'mixup', [4, 4, 4], 2],
  ['atlas-guardian', '阿特拉斯守卫', 'fortress', [5, 5, 5], 3],
] as const;

describe('campaign-v1 catalog', () => {
  it('contains the approved eight rivals in fixed order', () => {
    expect(CAMPAIGN_CONFIG_VERSION).toBe('campaign-v1');
    expect(CAMPAIGN_OPPONENTS).toHaveLength(8);
    expect(CAMPAIGN_OPPONENT_BY_ID.size).toBe(8);
    expect(CAMPAIGN_OPPONENTS.map(opponent => [
      opponent.id,
      opponent.name,
      opponent.aiProfileId,
      [opponent.upgrades.attack, opponent.upgrades.defense, opponent.upgrades.stamina],
      opponent.loadouts.length,
    ])).toEqual(expectedOpponents);
  });

  it('contains exactly 17 valid five-layer NSS loadouts', () => {
    const loadouts = CAMPAIGN_OPPONENTS.flatMap(opponent => opponent.loadouts);
    expect(loadouts).toHaveLength(17);

    for (const loadout of loadouts) {
      expect(Object.keys(loadout.combination).sort()).toEqual(['assist', 'blade', 'core', 'gear', 'tip']);
      expect(Object.keys(loadout.affinities).sort()).toEqual(['assist', 'blade', 'core', 'gear', 'tip']);
      for (const [family, partId] of Object.entries(loadout.combination)) {
        expect(nssPartById.get(partId)?.family).toBe(family);
      }
      for (const affinity of Object.values(loadout.affinities)) expect(AFFINITIES).toContain(affinity);
      expect(['LIGHT', 'DARK']).toContain(loadout.affinities.core);
    }
  });

  it('uses only approved arenas, objectives, rewards, and AI profiles', () => {
    expect(CAMPAIGN_OPPONENTS.flatMap(opponent => opponent.arenas).every(arena => (
      ['classic_grid', 'neon_magma', 'absolute_zero'].includes(arena)
    ))).toBe(true);
    expect(CAMPAIGN_OPPONENTS.map(opponent => opponent.rewards.firstWinCoins))
      .toEqual([100, 125, 150, 175, 225, 275, 350, 500]);
    expect(CAMPAIGN_OPPONENTS.map(opponent => opponent.rewards.starCoins))
      .toEqual([40, 50, 60, 70, 90, 110, 140, 200]);
    expect(CAMPAIGN_OPPONENTS.map(opponent => opponent.rewards.unlockPartId))
      .toEqual(['slash', 'drift', 'light', 'bulwark', 'heavy', 'rush', null, null]);
    expect(() => assertCampaignCatalog()).not.toThrow();
  });
});
