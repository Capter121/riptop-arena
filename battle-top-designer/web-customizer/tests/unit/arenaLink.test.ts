import { describe, expect, it } from 'vitest';
import { combinationId, enumerateCombinations } from '../../src/domain';
import { createArenaLink } from '../../src/integration/arenaLink';
import { combinationFromId } from '../../src/sharing/combinationUrl';

describe('Arena links', () => {
  it('creates one reversible Arena URL for each NSS combination', () => {
    const urls = enumerateCombinations().map(combination => createArenaLink(
      combination,
      new URL('https://example.test/customizer/?test=1#preview'),
    ));
    expect(new Set(urls).size).toBe(288);
    for (const [index, urlText] of urls.entries()) {
      const url = new URL(urlText);
      const combination = enumerateCombinations()[index];
      expect(url.pathname).toBe('/arena/');
      expect(url.searchParams.get('loadoutVersion')).toBe('1');
      expect(combinationFromId(url.searchParams.get('combo')!)).toEqual(combination);
    }
  });

  it('uses the configured development Arena base without leaking presentation state', () => {
    const combination = enumerateCombinations()[137];
    const url = new URL(createArenaLink(
      combination,
      new URL('http://127.0.0.1:4175/customizer/?test=1'),
      'http://127.0.0.1:4176/',
    ));
    expect(url.href).toBe(`http://127.0.0.1:4176/?combo=${combinationId(combination)}&loadoutVersion=1`);
    expect([...url.searchParams.keys()]).toEqual(['combo', 'loadoutVersion']);
  });

  it('keeps a relative configured base on the current origin', () => {
    const combination = enumerateCombinations()[0];
    expect(createArenaLink(combination, new URL('https://demo.example/customizer/'), '../arena/'))
      .toBe('https://demo.example/arena/?combo=nss-p2c-0001&loadoutVersion=1');
  });
});
