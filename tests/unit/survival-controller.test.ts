import { describe, expect, it, vi } from 'vitest';
import { CAMPAIGN_OPPONENTS } from '../../src/data/campaign/opponents';
import type { SurvivalRun } from '../../src/survival/survivalClient';
import { SurvivalController } from '../../src/survival/survivalController';
import { pendingSurvivalResultKey } from '../../src/survival/pendingSurvivalResult';

const playerId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const identity = { version: 1 as const, playerId, displayName: 'Nova', deviceToken: 'A'.repeat(43) };
const loadout = { schemaVersion: 2 as const, interfaceId: 'NSS-V1' as const, ...CAMPAIGN_OPPONENTS[0].loadouts[0] };
const seed = '00112233445566778899aabbccddeeff';

function run(overrides: Partial<SurvivalRun> = {}): SurvivalRun {
  return {
    runId, configVersion: 'survival-v1', simulationVersion: 1, battleRulesVersion: 2,
    seed: 'ffeeddccbbaa99887766554433221100', status: 'wave_ready',
    player: { playerId, displayName: 'Nova', loadout, upgrades: { attack: 0, defense: 0, stamina: 0 }, maximumIntegrity: 2000 },
    wave: {
      configVersion: 'survival-v1', simulationVersion: 1, seed, wave: 6, chapter: 2, type: 'normal',
      sourceOpponentId: CAMPAIGN_OPPONENTS[0].id, sourceLoadoutIndex: 0, enemy: loadout,
      arena: 'absolute_zero', aiProfileId: 'fortress', riskLevel: 2, strengthMultiplier: 1.32,
    },
    checkpoint: {
      currentWave: 6, integrity: 1234, burstRisk: 18, persistentDebuffs: ['scuffed'],
      growthLevels: { 'attack-calibration': 2, coordination: 1, 'affinity-tuning': 3, 'pickup-tuning': 0 },
      nextWaveEffect: 'temporary-bulwark', riskLevel: 2, score: 2200, flawlessStreak: 1, bossesDefeated: 1,
    },
    finalSummary: null, createdAt: '2026-08-12T09:00:00.000Z', updatedAt: '2026-08-12T10:00:00.000Z', completedAt: null,
    ...overrides,
  };
}

function outcome(winner: 'player' | 'enemy' = 'enemy') {
  return {
    simulationVersion: 1 as const, seed, winner, kind: 'spin finish' as const, turnCount: 6, tickCount: 900,
    player: { spin: winner === 'player' ? 50 : 0, integrity: winner === 'player' ? 900 : 0, stamina: 30, spirit: 20, burst: 10, tilt: 0.5, alive: winner === 'player' },
    enemy: { spin: winner === 'enemy' ? 50 : 0, integrity: winner === 'enemy' ? 100 : 0, stamina: 30, spirit: 20, burst: 10, tilt: 0.5, alive: winner === 'enemy' },
  };
}

function memoryStorage(blocked = false) {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { if (blocked) throw new Error('blocked'); values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    },
  };
}

describe('survival controller', () => {
  it('passes the frozen wave and checkpoint to Game without generating replacements', () => {
    const controller = new SurvivalController(run(), identity, {} as never);
    expect(controller.gameOptions()).toMatchObject({
      battleKind: 'survival', runId, waveNumber: 6, arena: 'absolute_zero', seed,
      aiProfileId: 'fortress', waveType: 'normal',
      player: { displayName: 'Nova', loadout, upgrades: { attack: 0, defense: 0, stamina: 0 } },
      enemy: { displayName: CAMPAIGN_OPPONENTS[0].name, loadout, upgrades: { attack: 0, defense: 0, stamina: 0 } },
      runtime: {
        maximumIntegrity: 2000, integrity: 1234, burstRisk: 18, persistentDebuffs: ['scuffed'],
        growthLevels: { 'attack-calibration': 2, coordination: 1, 'affinity-tuning': 3, 'pickup-tuning': 0 },
        nextWaveEffect: 'temporary-bulwark', riskLevel: 2, strengthMultiplier: 1.32,
      },
    });
  });

  it('rejects outcomes that do not match the frozen version, wave seed, or active state', async () => {
    const controller = new SurvivalController(run(), identity, { submitWaveResult: vi.fn() } as never);
    await expect(controller.settle({ ...outcome(), seed: '0'.repeat(32) })).rejects.toThrow('frozen wave');
    expect(() => new SurvivalController(run({ status: 'reward_pending' }), identity, {} as never)).toThrow('not battle-ready');
    expect(() => new SurvivalController(run({ player: { ...run().player, playerId: '44444444-4444-4444-8444-444444444444' } }), identity, {} as never)).toThrow('identity');
  });

  it('writes a defeat before sending, removes it after confirmation, and reuses one in-flight settlement', async () => {
    const local = memoryStorage();
    const settlement = { run: run({ status: 'completed' }), progression: { revision: 2 } };
    const submitWaveResult = vi.fn(async () => {
      expect(local.values.has(pendingSurvivalResultKey(playerId, runId, 6))).toBe(true);
      return settlement;
    });
    const controller = new SurvivalController(run(), identity, { submitWaveResult } as never);
    const first = controller.settle(outcome(), { storage: local.storage, randomUUID: () => requestId });
    const second = controller.settle(structuredClone(outcome()), { storage: local.storage, randomUUID: () => crypto.randomUUID() });
    expect(second).toBe(first);
    await expect(first).resolves.toEqual({ status: 'submitted', settlement });
    expect(submitWaveResult).toHaveBeenCalledTimes(1);
    expect(local.values.size).toBe(0);
  });

  it('does not send a defeat when storage is blocked, and keeps the same request for an online win retry', async () => {
    const blockedSubmit = vi.fn();
    const blocked = new SurvivalController(run(), identity, { submitWaveResult: blockedSubmit } as never);
    await expect(blocked.settle(outcome(), { storage: memoryStorage(true).storage, randomUUID: () => requestId })).resolves.toEqual({ status: 'storage_failed' });
    expect(blockedSubmit).not.toHaveBeenCalled();

    const submitWaveResult = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce({ progression: { revision: 3 } });
    const winner = new SurvivalController(run(), identity, { submitWaveResult } as never);
    await expect(winner.settle(outcome('player'), { randomUUID: () => requestId })).resolves.toEqual({ status: 'pending' });
    await expect(winner.settle(outcome('player'), { randomUUID: () => crypto.randomUUID() })).resolves.toMatchObject({ status: 'submitted' });
    expect(submitWaveResult.mock.calls[0][2].requestId).toBe(requestId);
    expect(submitWaveResult.mock.calls[1][2].requestId).toBe(requestId);
  });
});
