import { describe, expect, it, vi } from 'vitest';
import { settleChallengeResult } from '../../src/challenges/pendingChallengeResult';

const playerId = '11111111-1111-4111-8111-111111111111';
const challengeId = '22222222-2222-4222-8222-222222222222';
const envelope = {
  submissionId: '44444444-4444-4444-8444-444444444444',
  inputLog: { simulationVersion: 1, seed: '00112233445566778899aabbccddeeff', launch: { playerPower: 1, playerAngleDeg: 0, enemyPower: 1, enemyAngleDeg: 0 }, playerVoiceFrames: [0], turns: [] },
  outcome: { simulationVersion: 1, seed: '00112233445566778899aabbccddeeff', winner: 'player', kind: 'timeout', turnCount: 0, tickCount: 1,
    player: { spin: 1, integrity: 1, stamina: 1, spirit: 0, burst: 0, tilt: 0, alive: true }, enemy: { spin: 0, integrity: 0, stamina: 0, spirit: 0, burst: 0, tilt: 1, alive: false } },
};

function storage(blocked = false) {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { if (blocked) throw new Error('blocked'); values.set(key, value); }, removeItem: (key: string) => values.delete(key), values };
}

describe('challenge settlement boundaries', () => {
  it('persists the exact envelope before sending and removes it only after success', async () => {
    const local = storage();
    const submit = vi.fn(async () => { expect(local.values.size).toBe(1); });
    expect(await settleChallengeResult(playerId, challengeId, envelope, submit, local)).toBe('submitted');
    expect(submit).toHaveBeenCalledWith(challengeId, envelope);
    expect(local.values.size).toBe(0);
  });

  it('does not send when safe local persistence fails', async () => {
    const submit = vi.fn();
    expect(await settleChallengeResult(playerId, challengeId, envelope, submit, storage(true))).toBe('storage_failed');
    expect(submit).not.toHaveBeenCalled();
  });

  it('keeps the same submission for manual retry after network failure', async () => {
    const local = storage();
    const submit = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce({});
    expect(await settleChallengeResult(playerId, challengeId, envelope, submit, local)).toBe('pending');
    expect(await settleChallengeResult(playerId, challengeId, envelope, submit, local)).toBe('submitted');
    expect(submit.mock.calls[0][1].submissionId).toBe(submit.mock.calls[1][1].submissionId);
  });
});
