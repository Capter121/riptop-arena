import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_VERSION,
  isOnlineLoadout,
  parseServerMessage,
  type OnlineLoadout,
} from '../../../../src/network/protocol';
import { NSS_BATTLE_CATALOG_SHA256 } from '../../../../src/nss/battleCatalog';
import {
  createNssBattleLoadout,
  enumerateNssCombinations,
  nssCombinationId,
} from '../../../../src/nss/loadout';

const upgrades = { attack: 0, defense: 0, stamina: 0 };

function nssLoadout(index = 0): OnlineLoadout {
  const loadout = createNssBattleLoadout(enumerateNssCombinations()[index]);
  return {
    kind: 'nss-v1',
    comboId: nssCombinationId(loadout.combination),
    loadout,
    upgrades,
    catalogSha256: NSS_BATTLE_CATALOG_SHA256,
  };
}

describe('NSS network protocol V2', () => {
  it('accepts all 288 NSS combinations without transmitting derived stats', () => {
    const combinations = enumerateNssCombinations();
    expect(combinations).toHaveLength(288);
    for (let index = 0; index < combinations.length; index += 1) {
      const value = nssLoadout(index);
      expect(isOnlineLoadout(value)).toBe(true);
      expect(value).not.toHaveProperty('stats');
    }
  });

  it('accepts a strict legacy loadout', () => {
    expect(isOnlineLoadout({
      kind: 'legacy',
      build: { attackRing: 'round', core: 'balanced', driver: 'grip' },
      upgrades,
      partUpgrades: {},
    })).toBe(true);
  });

  it.each([
    ['catalog hash', { ...nssLoadout(), catalogSha256: '0'.repeat(64) }],
    ['combination id', { ...nssLoadout(), comboId: 'nss-p2c-9999' }],
    ['derived stats', { ...nssLoadout(), stats: { attack: 999 } }],
    ['upgrade ceiling', { ...nssLoadout(), upgrades: { attack: 6, defense: 0, stamina: 0 } }],
  ])('rejects an NSS loadout with an invalid %s', (_name, value) => {
    expect(isOnlineLoadout(value)).toBe(false);
  });

  it('rejects protocol V1 server messages', () => {
    expect(parseServerMessage(JSON.stringify({ v: 1, type: 'QUEUED' }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ v: PROTOCOL_VERSION, type: 'QUEUED' }))).not.toBeNull();
  });
});
