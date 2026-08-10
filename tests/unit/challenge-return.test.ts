import { describe, expect, it } from 'vitest';
import { createNssBattleLoadout, nssCombinationFromId } from '../../src/nss/loadout';
import { buildChallengeCustomizerPath, parseChallengeReturn } from '../../src/challenges/challengeReturn';

const offerId = '123e4567-e89b-12d3-a456-426614174000';
const affinities = {
  core: 'LIGHT', blade: 'FIRE', assist: 'FIRE', gear: 'WATER', tip: 'EARTH',
} as const;
const canonical = '?sv=2&cv=1&rv=1&combo=nss-p2c-0138&a=LIGHT%2CFIRE%2CFIRE%2CWATER%2CEARTH';

describe('portal challenge return', () => {
  it('strictly parses the same canonical V2 fixture as the customizer', () => {
    expect(parseChallengeReturn('')).toEqual({ kind: 'none' });
    expect(parseChallengeReturn(canonical)).toEqual({
      kind: 'ready',
      loadout: createNssBattleLoadout(nssCombinationFromId('nss-p2c-0138')!, affinities),
    });
  });

  it('rejects missing, repeated, unknown, and incompatible parameters', () => {
    for (const search of [
      '?sv=2&cv=1&rv=1&combo=nss-p2c-0138',
      `${canonical}&combo=nss-p2c-0138`,
      `${canonical}&extra=1`,
      canonical.replace('sv=2', 'sv=3'),
      canonical.replace('EARTH', 'ICE'),
      canonical.replace('nss-p2c-0138', 'nss-p2c-9999'),
    ]) expect(parseChallengeReturn(search)).toEqual({ kind: 'invalid' });
  });

  it('builds a customizer path with one safe returnTo and the current server loadout', () => {
    const loadout = createNssBattleLoadout(nssCombinationFromId('nss-p2c-0138')!, affinities);
    expect(buildChallengeCustomizerPath(offerId, loadout)).toBe(
      `/customizer/?returnTo=%2Fchallenge%2F${offerId}&sv=2&cv=1&rv=1&combo=nss-p2c-0138&a=LIGHT%2CFIRE%2CFIRE%2CWATER%2CEARTH`,
    );
    expect(() => buildChallengeCustomizerPath('not-a-uuid', loadout)).toThrow('Invalid challenge offer id');
  });
});
