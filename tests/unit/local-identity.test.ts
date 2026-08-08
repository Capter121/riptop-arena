import { describe, expect, it } from 'vitest';
import {
  LOCAL_IDENTITY_STORAGE_KEY,
  clearLocalIdentity,
  loadLocalIdentity,
  probeIdentityStorage,
  saveLocalIdentity,
  type LocalIdentity,
} from '../../src/auth/localIdentity';

const identity: LocalIdentity = {
  version: 1,
  playerId: '123e4567-e89b-42d3-a456-426614174000',
  displayName: 'Nova',
  deviceToken: 'A'.repeat(43),
};

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(LOCAL_IDENTITY_STORAGE_KEY, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    has: (key: string) => values.has(key),
  };
}

describe('local invite identity', () => {
  it('round-trips a valid identity', () => {
    const storage = memoryStorage();
    expect(saveLocalIdentity(identity, storage)).toBe(true);
    expect(loadLocalIdentity(storage)).toEqual(identity);
  });

  it('removes malformed or structurally invalid data', () => {
    for (const value of ['{', JSON.stringify({ ...identity, deviceToken: 'short' })]) {
      const storage = memoryStorage(value);
      expect(loadLocalIdentity(storage)).toBeNull();
      expect(storage.has(LOCAL_IDENTITY_STORAGE_KEY)).toBe(false);
    }
  });

  it('degrades safely when browser storage is unavailable', () => {
    const unavailable = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(loadLocalIdentity(unavailable)).toBeNull();
    expect(saveLocalIdentity(identity, unavailable)).toBe(false);
    expect(clearLocalIdentity(unavailable)).toBe(false);
  });

  it('probes storage without changing the saved identity', () => {
    const storage = memoryStorage(JSON.stringify(identity));
    expect(probeIdentityStorage(storage)).toBe(true);
    expect(loadLocalIdentity(storage)).toEqual(identity);
  });

  it('reports that storage is unavailable when a probe write fails', () => {
    const unavailable = {
      getItem: () => null,
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => undefined,
    };
    expect(probeIdentityStorage(unavailable)).toBe(false);
  });
});
