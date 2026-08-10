import { describe, expect, it } from 'vitest';
import { stormAttack, type AffinitySelection } from '../../src/domain';
import { buildToSearch } from '../../src/sharing/combinationUrl';
import { createChallengeReturnLink, parseChallengeReturnPath } from '../../src/integration/challengeReturn';

const offerId = '123e4567-e89b-12d3-a456-426614174000';
const affinities: AffinitySelection = {
  core: 'LIGHT', blade: 'FIRE', assist: 'FIRE', gear: 'WATER', tip: 'EARTH',
};

describe('customizer challenge return', () => {
  it('accepts only one same-origin challenge UUID path', () => {
    expect(parseChallengeReturnPath(`?returnTo=%2Fchallenge%2F${offerId}`)).toBe(`/challenge/${offerId}`);
    for (const value of [
      `http://evil.test/challenge/${offerId}`,
      `//evil.test/challenge/${offerId}`,
      `/challenge/../challenge/${offerId}`,
      `/challenges/${offerId}`,
      `/challenge/not-a-uuid`,
    ]) {
      expect(parseChallengeReturnPath(`?returnTo=${encodeURIComponent(value)}`)).toBeNull();
    }
    expect(parseChallengeReturnPath(`?returnTo=%2Fchallenge%2F${offerId}&returnTo=%2Fchallenge%2F${offerId}`)).toBeNull();
  });

  it('reuses the canonical V2 encoding and preserves all five affinities', () => {
    const search = `${buildToSearch({ combination: stormAttack, affinities })}&returnTo=${encodeURIComponent(`/challenge/${offerId}`)}`;
    const returnTo = parseChallengeReturnPath(search);
    expect(createChallengeReturnLink(returnTo!, { combination: stormAttack, affinities }))
      .toBe(`/challenge/${offerId}?sv=2&cv=1&rv=1&combo=nss-p2c-0138&a=LIGHT%2CFIRE%2CFIRE%2CWATER%2CEARTH`);
  });
});
