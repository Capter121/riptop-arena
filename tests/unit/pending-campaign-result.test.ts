import { describe, expect, it, vi } from 'vitest';
import { CampaignApiError } from '../../src/campaign/campaignClient';
import {
  createPendingCampaignRetrySession,
  listPendingCampaignResults,
  loadPendingCampaignResult,
  pendingCampaignResultKey,
  retryPendingCampaignResultsOnce,
  savePendingCampaignResult,
} from '../../src/campaign/pendingCampaignResult';

const playerId = '11111111-1111-4111-8111-111111111111';
const otherPlayerId = '22222222-2222-4222-8222-222222222222';
const attemptId = '33333333-3333-4333-8333-333333333333';
const requestId = '44444444-4444-4444-8444-444444444444';
const outcome = {
  simulationVersion: 1,
  seed: '0123456789abcdef0123456789abcdef',
  winner: 'player',
  kind: 'timeout',
  turnCount: 0,
  tickCount: 1,
  player: { spin: 1, integrity: 1, stamina: 1, spirit: 0, burst: 0, tilt: 0, alive: true },
  enemy: { spin: 0, integrity: 0, stamina: 0, spirit: 0, burst: 0, tilt: 1, alive: false },
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

describe('pending campaign result queue', () => {
  it('isolates records by player and keeps insertion order', () => {
    const storage = memoryStorage();
    expect(savePendingCampaignResult(playerId, requestId, attemptId, outcome, storage)).toBe(true);
    expect(loadPendingCampaignResult(playerId, attemptId, storage)?.outcome).toEqual(outcome);
    expect(loadPendingCampaignResult(otherPlayerId, attemptId, storage)).toBeNull();
    expect(listPendingCampaignResults(playerId, storage)).toHaveLength(1);
    expect(pendingCampaignResultKey(playerId, attemptId)).not.toBe(pendingCampaignResultKey(otherPlayerId, attemptId));
  });

  it('removes success, keeps network failure, and persists conflict without retry loops', async () => {
    const storage = memoryStorage();
    savePendingCampaignResult(playerId, requestId, attemptId, outcome, storage);
    const offline = vi.fn().mockRejectedValue(new TypeError('offline'));
    await retryPendingCampaignResultsOnce(playerId, offline, { storage, session: createPendingCampaignRetrySession() });
    expect(loadPendingCampaignResult(playerId, attemptId, storage)?.status).toBe('pending');

    const conflict = vi.fn().mockRejectedValue(new CampaignApiError(409, 'CAMPAIGN_RESULT_CONFLICT', 'Conflict.'));
    await retryPendingCampaignResultsOnce(playerId, conflict, { storage, session: createPendingCampaignRetrySession() });
    expect(loadPendingCampaignResult(playerId, attemptId, storage)?.status).toBe('conflict');
    await retryPendingCampaignResultsOnce(playerId, conflict, { storage, session: createPendingCampaignRetrySession() });
    expect(conflict).toHaveBeenCalledTimes(1);

    savePendingCampaignResult(playerId, requestId, attemptId, outcome, storage);
    const success = vi.fn().mockResolvedValue({});
    await retryPendingCampaignResultsOnce(playerId, success, { storage, session: createPendingCampaignRetrySession() });
    expect(loadPendingCampaignResult(playerId, attemptId, storage)).toBeNull();
  });

  it('rejects malformed data and reports blocked storage', () => {
    const blocked = { ...memoryStorage(), setItem: () => { throw new Error('blocked'); } };
    expect(savePendingCampaignResult(playerId, requestId, attemptId, outcome, blocked)).toBe(false);
    const storage = memoryStorage();
    storage.setItem(pendingCampaignResultKey(playerId, attemptId), '{');
    expect(loadPendingCampaignResult(playerId, attemptId, storage)).toBeNull();
  });
});
