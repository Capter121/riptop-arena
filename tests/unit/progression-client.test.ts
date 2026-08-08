import { describe, expect, it, vi } from 'vitest';
import type { ProgressionState } from '../../src/app/progression';
import type { LocalIdentity } from '../../src/auth/localIdentity';
import {
  ProgressionSyncError,
  commitProgressionSync,
  ensureProgressionSyncState,
  loadProgressionSyncState,
  progressionSyncStorageKey,
  recordWalletObservation,
  syncPlayerProgression,
} from '../../src/progression/progressionClient';

const identity: LocalIdentity = {
  version: 1,
  playerId: '123e4567-e89b-42d3-a456-426614174000',
  displayName: 'Nova',
  deviceToken: 'A'.repeat(43),
};

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    values,
  };
}

function progression(coins = 100): ProgressionState {
  return {
    saveSchemaVersion: 2,
    unlockedParts: ['round', 'balanced', 'grip'],
    unlockedSet: new Set(['round', 'balanced', 'grip']),
    ladderIndex: 0,
    bestLadder: 0,
    championshipCount: 0,
    coins,
    build: { attackRing: 'round', core: 'balanced', driver: 'grip' },
    upgrades: { attack: 0, defense: 0, stamina: 0 },
    partUpgrades: {},
    latestNssLoadout: null,
  };
}

function saveIdentity(storage: ReturnType<typeof memoryStorage>, value = identity) {
  storage.setItem('nss.inviteIdentity.v1', JSON.stringify(value));
}

function response(coins: number, acknowledgedEventIds: string[] = []) {
  return {
    progression: {
      schemaVersion: 1 as const,
      revision: 2,
      coins,
      snapshot: {
        saveSchemaVersion: 2 as const,
        unlockedParts: ['balanced', 'grip', 'round'],
        ladderIndex: 0,
        bestLadder: 0,
        championshipCount: 0,
        build: { attackRing: 'round', core: 'balanced', driver: 'grip' },
        upgrades: { attack: 0, defense: 0, stamina: 0 },
        partUpgrades: {},
        latestNssLoadout: null,
      },
    },
    acknowledgedEventIds,
  };
}

describe('progression sync client', () => {
  it('does not create sync metadata without a local identity', () => {
    const storage = memoryStorage();
    expect(recordWalletObservation(100, { storage })).toBeNull();
    expect(storage.values.size).toBe(0);
  });

  it('freezes first coins without emitting an event', () => {
    const storage = memoryStorage();
    saveIdentity(storage);
    const state = ensureProgressionSyncState(identity, 120, storage);
    expect(state).toMatchObject({ initialCoins: 120, lastObservedCoins: 120, pendingWalletEvents: [] });
    expect(loadProgressionSyncState(identity.playerId, storage)).toEqual(state);
  });

  it('journals credit, debit, and no-change observations', () => {
    const storage = memoryStorage();
    saveIdentity(storage);
    ensureProgressionSyncState(identity, 100, storage);
    const ids = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ];
    expect(recordWalletObservation(150, {
      storage,
      uuid: () => ids.shift()!,
      now: () => new Date('2026-08-09T09:00:00.000Z'),
    })?.pendingWalletEvents[0]).toEqual({
      eventId: '11111111-1111-4111-8111-111111111111',
      kind: 'credit',
      delta: 50,
      source: 'local_progression',
      createdAt: '2026-08-09T09:00:00.000Z',
    });
    expect(recordWalletObservation(120, {
      storage,
      uuid: () => ids.shift()!,
      now: () => new Date('2026-08-09T09:01:00.000Z'),
    })?.pendingWalletEvents[1]).toMatchObject({ kind: 'debit', delta: -30 });
    expect(recordWalletObservation(120, { storage })?.pendingWalletEvents).toHaveLength(2);
  });

  it('keeps different players in separate storage keys', () => {
    const storage = memoryStorage();
    const other = { ...identity, playerId: '223e4567-e89b-42d3-a456-426614174000' };
    ensureProgressionSyncState(identity, 100, storage);
    ensureProgressionSyncState(other, 300, storage);
    expect(progressionSyncStorageKey(identity.playerId)).not.toBe(progressionSyncStorageKey(other.playerId));
    expect(loadProgressionSyncState(identity.playerId, storage)?.initialCoins).toBe(100);
    expect(loadProgressionSyncState(other.playerId, storage)?.initialCoins).toBe(300);
  });

  it('preserves pending events on network failure', async () => {
    const storage = memoryStorage();
    saveIdentity(storage);
    ensureProgressionSyncState(identity, 100, storage);
    recordWalletObservation(150, {
      storage,
      uuid: () => '33333333-3333-4333-8333-333333333333',
    });
    await expect(syncPlayerProgression(identity, progression(150), {
      storage,
      fetchImpl: vi.fn().mockRejectedValue(new TypeError('offline')),
    })).rejects.toThrow('offline');
    expect(loadProgressionSyncState(identity.playerId, storage)?.pendingWalletEvents).toHaveLength(1);
  });

  it('defers final acknowledgements until the authoritative save commits', async () => {
    const storage = memoryStorage();
    saveIdentity(storage);
    ensureProgressionSyncState(identity, 100, storage);
    const eventId = '44444444-4444-4444-8444-444444444444';
    recordWalletObservation(150, { storage, uuid: () => eventId });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(response(150, [eventId])), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const result = await syncPlayerProgression(identity, progression(150), { storage, fetchImpl });
    expect(loadProgressionSyncState(identity.playerId, storage)?.pendingWalletEvents).toHaveLength(1);
    commitProgressionSync(identity, result, storage);
    expect(loadProgressionSyncState(identity.playerId, storage)).toMatchObject({
      migrationComplete: true,
      lastObservedCoins: 150,
      pendingWalletEvents: [],
    });
  });

  it('keeps final events when the caller cannot save authoritative progression', async () => {
    const storage = memoryStorage();
    saveIdentity(storage);
    ensureProgressionSyncState(identity, 100, storage);
    const eventId = '55555555-5555-4555-8555-555555555555';
    recordWalletObservation(130, { storage, uuid: () => eventId });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(response(130, [eventId])), { status: 200 }));
    await syncPlayerProgression(identity, progression(130), { storage, fetchImpl });
    expect(loadProgressionSyncState(identity.playerId, storage)?.pendingWalletEvents[0].eventId).toBe(eventId);
  });

  it('returns and commits authoritative state after a 409 conflict', async () => {
    const storage = memoryStorage();
    saveIdentity(storage);
    ensureProgressionSyncState(identity, 100, storage);
    const eventId = '66666666-6666-4666-8666-666666666666';
    recordWalletObservation(10, { storage, uuid: () => eventId });
    const conflict = {
      error: { code: 'INSUFFICIENT_COINS', message: 'Coin balance would become negative.', rejectedEventId: eventId },
      progression: response(40).progression,
    };
    const result = await syncPlayerProgression(identity, progression(10), {
      storage,
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify(conflict), { status: 409 })),
    });
    expect(result.status).toBe('conflict');
    expect(result.progression.coins).toBe(40);
    expect(loadProgressionSyncState(identity.playerId, storage)?.pendingWalletEvents).toHaveLength(1);
    commitProgressionSync(identity, result, storage);
    expect(loadProgressionSyncState(identity.playerId, storage)).toMatchObject({
      lastObservedCoins: 40,
      pendingWalletEvents: [],
    });
  });

  it('throws safe API errors without discarding events', async () => {
    const storage = memoryStorage();
    saveIdentity(storage);
    ensureProgressionSyncState(identity, 100, storage);
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'INVALID_PROGRESSION', message: 'Invalid progression.' },
    }), { status: 400 }));
    await expect(syncPlayerProgression(identity, progression(), { storage, fetchImpl }))
      .rejects.toEqual(expect.objectContaining<Partial<ProgressionSyncError>>({
        status: 400,
        code: 'INVALID_PROGRESSION',
      }));
  });

  it('submits long queues oldest-first in batches and commits only the final batch', async () => {
    const storage = memoryStorage();
    saveIdentity(storage);
    ensureProgressionSyncState(identity, 0, storage);
    const syncState = loadProgressionSyncState(identity.playerId, storage)!;
    syncState.pendingWalletEvents = Array.from({ length: 401 }, (_, index) => ({
      eventId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      kind: 'credit' as const,
      delta: 1,
      source: 'local_progression' as const,
      createdAt: '2026-08-09T09:00:00.000Z',
    }));
    storage.setItem(progressionSyncStorageKey(identity.playerId), JSON.stringify(syncState));
    const fetchImpl = vi.fn()
      .mockImplementationOnce(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        expect(body.walletEvents).toHaveLength(400);
        return new Response(JSON.stringify(response(400, body.walletEvents.map((event: { eventId: string }) => event.eventId))), { status: 200 });
      })
      .mockImplementationOnce(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        expect(body.walletEvents).toHaveLength(1);
        return new Response(JSON.stringify(response(401, [body.walletEvents[0].eventId])), { status: 200 });
      });
    const result = await syncPlayerProgression(identity, progression(401), { storage, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(loadProgressionSyncState(identity.playerId, storage)?.pendingWalletEvents).toHaveLength(1);
    commitProgressionSync(identity, result, storage);
    expect(loadProgressionSyncState(identity.playerId, storage)?.pendingWalletEvents).toHaveLength(0);
  });

  it('coalesces simultaneous sync calls for one player', async () => {
    const storage = memoryStorage();
    saveIdentity(storage);
    ensureProgressionSyncState(identity, 100, storage);
    let resolveFetch!: (response: Response) => void;
    const fetchImpl = vi.fn(() => new Promise<Response>(resolve => { resolveFetch = resolve; }));
    const first = syncPlayerProgression(identity, progression(), { storage, fetchImpl });
    const second = syncPlayerProgression(identity, progression(), { storage, fetchImpl });
    expect(first).toBe(second);
    resolveFetch(new Response(JSON.stringify(response(100)), { status: 200 }));
    await first;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
