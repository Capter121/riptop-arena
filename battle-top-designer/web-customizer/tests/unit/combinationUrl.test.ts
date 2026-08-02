import { describe, expect, it } from 'vitest';
import { combinationId, defaultAffinities, enumerateCombinations, stormAttack, type AffinitySelection } from '../../src/domain';
import {
  buildToSearch, combinationFromId, createShareLink, parseShareSearch, resolveInitialCombination,
} from '../../src/sharing/combinationUrl';

const affinities: AffinitySelection = {
  core: 'LIGHT', blade: 'FIRE', assist: 'FIRE', gear: 'WATER', tip: 'EARTH',
};

describe('stable combination URLs', () => {
  it('round-trips all 288 combinations with five affinities without a second ordering', () => {
    for (const combination of enumerateCombinations()) {
      const id = combinationId(combination);
      expect(combinationFromId(id)).toEqual(combination);
      const search = buildToSearch({ combination, affinities });
      expect([...new URLSearchParams(search).keys()]).toEqual(['sv', 'cv', 'rv', 'combo', 'a']);
      expect(parseShareSearch(search)).toEqual({
        kind: 'current', combination, affinities, emblemId: null, testMode: false,
      });
    }
  });

  it('writes the canonical V2 contract and optional validated emblem', () => {
    expect(buildToSearch({ combination: stormAttack, affinities, emblemId: 'emblem_solar-wolf_2' }))
      .toBe('?sv=2&cv=1&rv=1&combo=nss-p2c-0138&a=LIGHT%2CFIRE%2CFIRE%2CWATER%2CEARTH&emblem=emblem_solar-wolf_2');
    const maximumEmblem = `emblem_${'a'.repeat(48)}`;
    expect(parseShareSearch(buildToSearch({ combination: stormAttack, affinities, emblemId: maximumEmblem })))
      .toMatchObject({ kind: 'current', emblemId: maximumEmblem });
    expect(() => buildToSearch({ combination: stormAttack, affinities, emblemId: `emblem_${'a'.repeat(49)}` }))
      .toThrow('Invalid share emblem');
  });

  it('rejects unknown, differently cased, repeated, mixed, and future-version parameters', () => {
    expect(combinationFromId('nss-p2c-9999')).toBeNull();
    expect(combinationFromId('NSS-P2C-0001')).toBeNull();
    const invalidSearches = [
      '?combo=nss-p2c-0001&combo=nss-p2c-0002',
      '?combo=%3Cscript%3E',
      '?sv=2&cv=1&rv=1&combo=nss-p2c-0001',
      '?sv=2&cv=1&rv=1&combo=nss-p2c-0001&a=LIGHT,FIRE,FIRE,WATER,EARTH&extra=1',
      '?sv=2&cv=1&rv=1&combo=nss-p2c-0001&a=LIGHT,FIRE,FIRE,WATER,EARTH&combo=nss-p2c-0002',
      '?sv=3&cv=1&rv=1&combo=nss-p2c-0001&a=LIGHT,FIRE,FIRE,WATER,EARTH',
      '?sv=2&cv=2&rv=1&combo=nss-p2c-0001&a=LIGHT,FIRE,FIRE,WATER,EARTH',
      '?sv=2&cv=1&rv=2&combo=nss-p2c-0001&a=LIGHT,FIRE,FIRE,WATER,EARTH',
      '?sv=2&cv=1&rv=1&combo=nss-p2c-0001&a=LIGHT,FIRE,FIRE,WATER,ICE',
      '?sv=2&cv=1&rv=1&combo=nss-p2c-0001&a=LIGHT,FIRE,FIRE,WATER,EARTH&emblem=bad',
    ];
    for (const search of invalidSearches) {
      expect(parseShareSearch(search)).toMatchObject({ kind: 'invalid' });
      expect(resolveInitialCombination(search, null)).toMatchObject({
        source: 'fallback', invalidUrl: true, combination: stormAttack,
      });
    }
  });

  it('uses legal URL, then legal local storage, then Storm Attack', () => {
    const target = enumerateCombinations()[137];
    const saved = JSON.stringify({ schemaVersion: 1, combination: target });
    const savedV2 = JSON.stringify({ schemaVersion: 2, combination: target, affinities: defaultAffinities(target) });
    expect(resolveInitialCombination(`?combo=${combinationId(target)}`, null)).toMatchObject({
      source: 'url', combination: target, affinities: defaultAffinities(target), legacyUrl: true,
    });
    expect(resolveInitialCombination('', saved)).toMatchObject({ source: 'local', combination: target, affinities: defaultAffinities(target) });
    expect(resolveInitialCombination('', savedV2)).toMatchObject({ source: 'local', combination: target, affinities: defaultAffinities(target) });
    expect(resolveInitialCombination('', '{broken')).toMatchObject({ source: 'fallback', combination: stormAttack });
    expect(resolveInitialCombination('?combo=invalid&test=1', saved)).toMatchObject({ source: 'fallback', invalidUrl: true, testMode: true, combination: stormAttack });
  });

  it('creates canonical local or configured-base links and strips test mode from output', () => {
    expect(resolveInitialCombination(`?sv=2&cv=1&rv=1&combo=nss-p2c-0138&a=LIGHT,FIRE,FIRE,WATER,EARTH&test=1`, null))
      .toMatchObject({ source: 'url', affinities, testMode: true, legacyUrl: false });
    const payload = { combination: stormAttack, affinities };
    const local = createShareLink(payload, new URL('http://127.0.0.1:4174/customizer/?test=1'));
    expect(local.url).toBe('http://127.0.0.1:4174/customizer/?sv=2&cv=1&rv=1&combo=nss-p2c-0138&a=LIGHT%2CFIRE%2CFIRE%2CWATER%2CEARTH');
    expect(local.deviceOnly).toBe(true);
    const configured = createShareLink(payload, new URL('http://localhost:4174/'), 'https://demo.example/nova/');
    expect(configured).toEqual({
      url: 'https://demo.example/nova/?sv=2&cv=1&rv=1&combo=nss-p2c-0138&a=LIGHT%2CFIRE%2CFIRE%2CWATER%2CEARTH',
      deviceOnly: false,
    });
  });
});
