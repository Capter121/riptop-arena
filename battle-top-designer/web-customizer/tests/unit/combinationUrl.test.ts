import { describe, expect, it } from 'vitest';
import { combinationId, defaultAffinities, enumerateCombinations, stormAttack } from '../../src/domain';
import {
  combinationFromId, combinationToSearch, createShareLink, resolveInitialCombination,
} from '../../src/sharing/combinationUrl';

describe('stable combination URLs', () => {
  it('round-trips all 288 Phase 2C IDs without a second ordering', () => {
    for (const combination of enumerateCombinations()) {
      const id = combinationId(combination);
      expect(combinationFromId(id)).toEqual(combination);
      expect(combinationToSearch(combination)).toBe(`?combo=${id}`);
    }
  });

  it('rejects unknown, differently cased, and repeated IDs', () => {
    expect(combinationFromId('nss-p2c-9999')).toBeNull();
    expect(combinationFromId('NSS-P2C-0001')).toBeNull();
    expect(resolveInitialCombination('?combo=nss-p2c-0001&combo=nss-p2c-0002', null)).toMatchObject({ source: 'fallback', invalidUrl: true, combination: stormAttack });
    expect(resolveInitialCombination('?combo=%3Cscript%3E', null)).toMatchObject({ source: 'fallback', invalidUrl: true, combination: stormAttack });
  });

  it('uses legal URL, then legal local storage, then Storm Attack', () => {
    const target = enumerateCombinations()[137];
    const saved = JSON.stringify({ schemaVersion: 1, combination: target });
    const savedV2 = JSON.stringify({ schemaVersion: 2, combination: target, affinities: defaultAffinities(target) });
    expect(resolveInitialCombination(`?combo=${combinationId(target)}`, null)).toMatchObject({ source: 'url', combination: target });
    expect(resolveInitialCombination('', saved)).toMatchObject({ source: 'local', combination: target });
    expect(resolveInitialCombination('', savedV2)).toMatchObject({ source: 'local', combination: target });
    expect(resolveInitialCombination('', '{broken')).toMatchObject({ source: 'fallback', combination: stormAttack });
    expect(resolveInitialCombination('?combo=invalid&test=1', saved)).toMatchObject({ source: 'fallback', invalidUrl: true, testMode: true, combination: stormAttack });
  });

  it('creates canonical local or configured-base links and preserves test coexistence only during hydration', () => {
    const local = createShareLink(stormAttack, new URL('http://127.0.0.1:4174/customizer/?old=1'));
    expect(local.url).toBe('http://127.0.0.1:4174/customizer/?combo=nss-p2c-0138');
    expect(local.deviceOnly).toBe(true);
    const configured = createShareLink(stormAttack, new URL('http://localhost:4174/'), 'https://demo.example/nova/');
    expect(configured).toEqual({ url: 'https://demo.example/nova/?combo=nss-p2c-0138', deviceOnly: false });
  });
});
