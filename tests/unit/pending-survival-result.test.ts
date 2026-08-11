import { describe, expect, it, vi } from 'vitest';
import { SurvivalApiError } from '../../src/survival/survivalClient';
import {
  createPendingSurvivalRetrySession,
  listPendingSurvivalResults,
  loadPendingSurvivalResult,
  pendingSurvivalResultKey,
  retryPendingSurvivalResultsOnce,
  savePendingSurvivalResult,
  submitSurvivalResultWithQueue,
} from '../../src/survival/pendingSurvivalResult';

const playerId = '11111111-1111-4111-8111-111111111111';
const otherPlayerId = '22222222-2222-4222-8222-222222222222';
const runId = '33333333-3333-4333-8333-333333333333';
const requestId = '44444444-4444-4444-8444-444444444444';
const request = {
  requestId, configVersion: 'survival-v1' as const, simulationVersion: 1 as const,
  battleRulesVersion: 2 as const, wave: 2,
  outcome: {
    simulationVersion: 1, seed: '0123456789abcdef0123456789abcdef', winner: 'enemy', kind: 'timeout', turnCount: 0, tickCount: 1,
    player: { spin: 0, integrity: 0, stamina: 0, spirit: 0, burst: 0, tilt: 1, alive: false },
    enemy: { spin: 1, integrity: 1, stamina: 1, spirit: 0, burst: 0, tilt: 0, alive: true },
  },
};

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe('pending survival result queue', () => {
  it('writes before sending, removes success, and exposes authoritative progression', async () => {
    const storage = memoryStorage();
    const progression = { schemaVersion: 1, revision: 1, coins: 100, snapshot: {} };
    const submit = vi.fn(async () => {
      expect(loadPendingSurvivalResult(playerId, runId, 2, storage)).not.toBeNull();
      return { progression };
    });
    const result = await submitSurvivalResultWithQueue(playerId, runId, request, submit, { storage });
    expect(result).toEqual({ status: 'submitted', response: { progression } });
    expect(loadPendingSurvivalResult(playerId, runId, 2, storage)).toBeNull();
  });

  it('does not send when storage fails and only stores defeated waves', async () => {
    const blocked = { ...memoryStorage(), setItem: () => { throw new Error('blocked'); } };
    const submit = vi.fn();
    await expect(submitSurvivalResultWithQueue(playerId, runId, request, submit, { storage: blocked })).resolves.toEqual({ status: 'storage_failed' });
    expect(submit).not.toHaveBeenCalled();
    expect(savePendingSurvivalResult(playerId, runId, { ...request, outcome: { ...request.outcome, winner: 'player' } }, memoryStorage())).toBe(false);
  });

  it('isolates identities, removes malformed data, and retries each key once per session', async () => {
    const storage = memoryStorage();
    expect(savePendingSurvivalResult(playerId, runId, request, storage)).toBe(true);
    expect(loadPendingSurvivalResult(otherPlayerId, runId, 2, storage)).toBeNull();
    expect(listPendingSurvivalResults(playerId, storage)).toHaveLength(1);
    const session = createPendingSurvivalRetrySession();
    const offline = vi.fn().mockRejectedValue(new TypeError('offline'));
    await retryPendingSurvivalResultsOnce(playerId, offline, { storage, session });
    await retryPendingSurvivalResultsOnce(playerId, offline, { storage, session });
    expect(offline).toHaveBeenCalledTimes(1);
    storage.setItem(pendingSurvivalResultKey(playerId, runId, 3), '{');
    expect(loadPendingSurvivalResult(playerId, runId, 3, storage)).toBeNull();
  });

  it('marks contract conflicts and returns progression after a successful retry', async () => {
    const storage = memoryStorage();
    savePendingSurvivalResult(playerId, runId, request, storage);
    const conflict = vi.fn().mockRejectedValue(new SurvivalApiError(409, 'SURVIVAL_REQUEST_CONFLICT', 'Conflict.'));
    await retryPendingSurvivalResultsOnce(playerId, conflict, { storage, session: createPendingSurvivalRetrySession() });
    expect(loadPendingSurvivalResult(playerId, runId, 2, storage)?.status).toBe('conflict');

    savePendingSurvivalResult(playerId, runId, request, storage);
    const onProgression = vi.fn();
    await retryPendingSurvivalResultsOnce(playerId, vi.fn().mockResolvedValue({ progression: { revision: 2 } }), {
      storage, session: createPendingSurvivalRetrySession(), onProgression,
    });
    expect(onProgression).toHaveBeenCalledWith({ revision: 2 });
    expect(loadPendingSurvivalResult(playerId, runId, 2, storage)).toBeNull();
  });
});
