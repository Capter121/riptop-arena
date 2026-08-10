import { describe, expect, it } from 'vitest';
import { LOCAL_IDENTITY_STORAGE_KEY, type LocalIdentity } from '../../src/auth/localIdentity';
import {
  ONLINE_GUEST_NAME_STORAGE_KEY,
  loadOnlineIdentity,
  normalizeOnlineDisplayName,
  saveOnlineGuestName,
} from '../../src/network/onlineIdentity';

const identity: LocalIdentity = {
  version: 1,
  playerId: '123e4567-e89b-42d3-a456-426614174000',
  displayName: 'Nova',
  deviceToken: 'A'.repeat(43),
};

function memoryStorage(entries: Record<string, string> = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    value: (key: string) => values.get(key) ?? null,
  };
}

describe('online identity', () => {
  it('prefers an invite identity over a saved guest name', () => {
    const storage = memoryStorage({
      [LOCAL_IDENTITY_STORAGE_KEY]: JSON.stringify(identity),
      [ONLINE_GUEST_NAME_STORAGE_KEY]: 'Guest',
    });
    expect(loadOnlineIdentity(storage)).toEqual({ displayName: 'Nova', kind: 'identity' });
  });

  it('loads and normalizes a saved guest name', () => {
    const storage = memoryStorage({ [ONLINE_GUEST_NAME_STORAGE_KEY]: '  Rin  ' });
    expect(loadOnlineIdentity(storage)).toEqual({ displayName: 'Rin', kind: 'guest' });
  });

  it('saves a normalized guest name', () => {
    const storage = memoryStorage();
    expect(saveOnlineGuestName('  Mika  ', storage)).toBe('Mika');
    expect(storage.value(ONLINE_GUEST_NAME_STORAGE_KEY)).toBe('Mika');
  });

  it('rejects blank and overlong display names', () => {
    expect(normalizeOnlineDisplayName('   ')).toBeNull();
    expect(normalizeOnlineDisplayName('A'.repeat(33))).toBeNull();
  });

  it('degrades safely when storage is blocked', () => {
    const blocked = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(loadOnlineIdentity(blocked)).toBeNull();
    expect(saveOnlineGuestName('Guest', blocked)).toBeNull();
  });
});
