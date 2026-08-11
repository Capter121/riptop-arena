import { describe, expect, it } from 'vitest';
import { stormAttack, type AffinitySelection } from '../../src/domain';
import {
  createCampaignCancelLink,
  createCampaignReturnLink,
  parseCampaignReturnTarget,
} from '../../src/integration/campaignReturn';

const affinities: AffinitySelection = {
  core: 'LIGHT', blade: 'FIRE', assist: 'FIRE', gear: 'WATER', tip: 'EARTH',
};

describe('customizer campaign return', () => {
  it('accepts only one known campaign source and opponent', () => {
    expect(parseCampaignReturnTarget('?return=campaign&opponent=blaze-fang')).toEqual({ opponentId: 'blaze-fang' });
    for (const search of [
      '?return=challenge&opponent=blaze-fang',
      '?return=https%3A%2F%2Fevil.test&opponent=blaze-fang',
      '?return=campaign&opponent=missing',
      '?return=campaign&opponent=%2F%2Fevil.test',
      '?return=campaign&return=campaign&opponent=blaze-fang',
      '?return=campaign&opponent=blaze-fang&opponent=sky-gale',
    ]) expect(parseCampaignReturnTarget(search)).toBeNull();
  });

  it('creates safe save and cancel links to the original rival', () => {
    const target = { opponentId: 'blaze-fang' };
    expect(createCampaignReturnLink(target, { combination: stormAttack, affinities }))
      .toBe('/campaign/?return=campaign&opponent=blaze-fang&sv=2&cv=1&rv=1&combo=nss-p2c-0138&a=LIGHT%2CFIRE%2CFIRE%2CWATER%2CEARTH');
    expect(createCampaignCancelLink(target)).toBe('/campaign/?opponent=blaze-fang');
  });
});
