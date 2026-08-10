import { describe, expect, it, vi } from 'vitest';
import {
  createPendingRetrySession,
  listPendingResultsForPlayer,
  loadPendingResult,
  pendingResultStorageKey,
  removePendingResult,
  retryPendingResultsOnce,
  savePendingResult,
} from '../../src/challenges/pendingChallengeResult';

const playerId = '11111111-1111-4111-8111-111111111111';
const challengeId = '22222222-2222-4222-8222-222222222222';
const otherPlayerId = '33333333-3333-4333-8333-333333333333';
const envelope = {
  submissionId: '44444444-4444-4444-8444-444444444444',
  inputLog: {
    simulationVersion: 1,
    seed: '00112233445566778899aabbccddeeff',
    launch: { playerPower: 1, playerAngleDeg: 0, enemyPower: 1, enemyAngleDeg: 0 },
    playerVoiceFrames: [0],
    turns: [],
  },
  outcome: {
    simulationVersion: 1,
    seed: '00112233445566778899aabbccddeeff',
    winner: 'player',
    kind: 'timeout',
    turnCount: 0,
    tickCount: 1,
    player: { spin: 1, integrity: 1, stamina: 1, spirit: 0, burst: 0, tilt: 0, alive: true },
    enemy: { spin: 0, integrity: 0, stamina: 0, spirit: 0, burst: 0, tilt: 1, alive: false },
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
    values,
  };
}

describe('pending challenge result storage', () => {
  it('isolates, saves, loads, lists, and removes by player and challenge', () => {
    const storage = memoryStorage();
    expect(savePendingResult(playerId, challengeId, envelope, storage)).toBe(true);
    expect(loadPendingResult(playerId, challengeId, storage)?.envelope).toEqual(envelope);
    expect(loadPendingResult(otherPlayerId, challengeId, storage)).toBeNull();
    expect(listPendingResultsForPlayer(playerId, storage)).toHaveLength(1);
    expect(pendingResultStorageKey(playerId, challengeId)).not.toBe(pendingResultStorageKey(otherPlayerId, challengeId));
    expect(removePendingResult(playerId, challengeId, storage)).toBe(true);
    expect(loadPendingResult(playerId, challengeId, storage)).toBeNull();
  });

  it('reports write failure and ignores malformed, wrong-version, or cross-identity records', () => {
    const blocked = { ...memoryStorage(), setItem: () => { throw new Error('blocked'); } };
    expect(savePendingResult(playerId, challengeId, envelope, blocked)).toBe(false);
    const storage = memoryStorage();
    const key = pendingResultStorageKey(playerId, challengeId);
    storage.setItem(key, '{');
    expect(loadPendingResult(playerId, challengeId, storage)).toBeNull();
    storage.setItem(key, JSON.stringify({ version: 2, playerId, challengeId, envelope }));
    expect(loadPendingResult(playerId, challengeId, storage)).toBeNull();
    storage.setItem(key, JSON.stringify({ version: 1, playerId: otherPlayerId, challengeId, envelope }));
    expect(loadPendingResult(playerId, challengeId, storage)).toBeNull();
  });

  it('auto-retries each record once per session and removes only successful submissions', async () => {
    const storage = memoryStorage();
    savePendingResult(playerId, challengeId, envelope, storage);
    const session = createPendingRetrySession();
    const submit = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce({});
    await retryPendingResultsOnce(playerId, submit, { storage, session });
    await retryPendingResultsOnce(playerId, submit, { storage, session });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(loadPendingResult(playerId, challengeId, storage)).not.toBeNull();

    const nextSession = createPendingRetrySession();
    await retryPendingResultsOnce(playerId, submit, { storage, session: nextSession });
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1][1]).toEqual(envelope);
    expect(loadPendingResult(playerId, challengeId, storage)).toBeNull();
  });
});
