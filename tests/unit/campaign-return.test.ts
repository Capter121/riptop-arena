import { describe, expect, it } from 'vitest';
import { createNssBattleLoadout, nssCombinationFromId } from '../../src/nss/loadout';
import { buildCampaignCustomizerPath, parseCampaignReturn } from '../../src/campaign/campaignReturn';

const affinities = {
  core: 'LIGHT', blade: 'FIRE', assist: 'FIRE', gear: 'WATER', tip: 'EARTH',
} as const;
const loadout = createNssBattleLoadout(nssCombinationFromId('nss-p2c-0138')!, affinities);
const payload = 'sv=2&cv=1&rv=1&combo=nss-p2c-0138&a=LIGHT%2CFIRE%2CFIRE%2CWATER%2CEARTH';

describe('portal campaign customizer return', () => {
  it('accepts one known opponent and the canonical V2 loadout', () => {
    expect(parseCampaignReturn(`?return=campaign&opponent=blaze-fang&${payload}`)).toEqual({
      kind: 'ready',
      opponentId: 'blaze-fang',
      loadout,
    });
    expect(parseCampaignReturn('?opponent=blaze-fang')).toEqual({ kind: 'none' });
  });

  it('rejects unknown opponents, duplicate parameters, wrong sources, and external values', () => {
    for (const search of [
      `?return=campaign&opponent=missing&${payload}`,
      `?return=campaign&return=campaign&opponent=blaze-fang&${payload}`,
      `?return=challenge&opponent=blaze-fang&${payload}`,
      `?return=https%3A%2F%2Fevil.test&opponent=blaze-fang&${payload}`,
      `?return=campaign&opponent=https%3A%2F%2Fevil.test&${payload}`,
      `?return=campaign&opponent=%25E0%25A4%25A&${payload}`,
    ]) expect(parseCampaignReturn(search)).toEqual({ kind: 'invalid' });
  });

  it('builds one safe customizer target with or without an existing NSS loadout', () => {
    expect(buildCampaignCustomizerPath('blaze-fang', loadout)).toBe(
      `/customizer/?return=campaign&opponent=blaze-fang&${payload}`,
    );
    expect(buildCampaignCustomizerPath('blaze-fang', null)).toBe('/customizer/?return=campaign&opponent=blaze-fang');
    expect(() => buildCampaignCustomizerPath('missing', loadout)).toThrow('Invalid campaign opponent id');
  });
});
