import { describe, expect, it, vi } from 'vitest';
import { CAMPAIGN_OPPONENTS } from '../../src/data/campaign/opponents';
import { SurvivalApiError, type SurvivalRun } from '../../src/survival/survivalClient';
import { bootstrapSurvival } from '../../src/survival/survivalBootstrap';

const playerId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const identity = { version: 1 as const, playerId, displayName: 'Nova', deviceToken: 'A'.repeat(43) };
const loadout = { schemaVersion: 2 as const, interfaceId: 'NSS-V1' as const, ...CAMPAIGN_OPPONENTS[0].loadouts[0] };

function run(status: SurvivalRun['status'] = 'wave_ready'): SurvivalRun {
  const completed = status === 'completed';
  return {
    runId, configVersion: 'survival-v1', simulationVersion: 1, battleRulesVersion: 2,
    seed: 'ffeeddccbbaa99887766554433221100', status,
    player: { playerId, displayName: 'Nova', loadout, upgrades: { attack: 0, defense: 0, stamina: 0 }, maximumIntegrity: 2000 },
    wave: { configVersion: 'survival-v1', simulationVersion: 1, seed: '00112233445566778899aabbccddeeff', wave: 1, chapter: 1, type: 'normal', sourceOpponentId: CAMPAIGN_OPPONENTS[0].id, sourceLoadoutIndex: 0, enemy: loadout, arena: 'classic_grid', aiProfileId: 'assault', riskLevel: 0, strengthMultiplier: 1 },
    checkpoint: { currentWave: 1, integrity: 2000, burstRisk: 0, persistentDebuffs: [], growthLevels: { 'attack-calibration': 0, coordination: 0, 'affinity-tuning': 0, 'pickup-tuning': 0 }, nextWaveEffect: null, riskLevel: 0, score: 0, flawlessStreak: 0, bossesDefeated: 0 },
    finalSummary: completed ? { score: 0, highestCompletedWave: 0, bossesDefeated: 0, finalIntegrity: 2000, riskLevel: 0, achievedAt: '2026-08-12T10:00:00.000Z', abandoned: true } : null,
    createdAt: '2026-08-12T09:00:00.000Z', updatedAt: '2026-08-12T10:00:00.000Z', completedAt: completed ? '2026-08-12T10:00:00.000Z' : null,
  };
}

const hub = (activeRun: SurvivalRun | null) => ({ activeRun });

describe('survival Arena bootstrap', () => {
  it('loads only the requested active run for the current identity', async () => {
    const getHub = vi.fn().mockResolvedValue(hub(run()));
    const result = await bootstrapSurvival(`?survival=${runId}`, {
      loadIdentity: () => identity, createClient: () => ({ getHub }) as never,
    });
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') expect(result.controller.gameOptions()).toMatchObject({ runId, waveNumber: 1 });
  });

  it('rejects malformed or mixed mode links before API use', async () => {
    const getHub = vi.fn();
    for (const search of ['', '?survival=x', `?survival=${runId}&survival=${runId}`, `?survival=${runId}&campaign=x`, `?survival=${runId}&qa=2`]) {
      expect(await bootstrapSurvival(search, { loadIdentity: () => identity, createClient: () => ({ getHub }) as never })).toEqual({ kind: 'invalid_link' });
    }
    expect(getHub).not.toHaveBeenCalled();
    expect(await bootstrapSurvival(`?survival=${runId}`, { loadIdentity: () => null })).toEqual({ kind: 'missing_identity' });
  });

  it('classifies missing, mismatched, completed, reward-pending, unsupported, and offline states', async () => {
    const resolve = (value: unknown) => bootstrapSurvival(`?survival=${runId}`, {
      loadIdentity: () => identity, createClient: () => ({ getHub: vi.fn().mockResolvedValue(value) }) as never,
    });
    expect(await resolve(hub(null))).toEqual({ kind: 'forbidden' });
    expect(await resolve(hub({ ...run(), runId: '44444444-4444-4444-8444-444444444444' }))).toEqual({ kind: 'forbidden' });
    expect(await resolve(hub(run('completed')))).toEqual({ kind: 'completed' });
    expect(await resolve(hub(run('reward_pending')))).toEqual({ kind: 'reward_pending' });

    const reject = (error: Error) => bootstrapSurvival(`?survival=${runId}`, {
      loadIdentity: () => identity, createClient: () => ({ getHub: vi.fn().mockRejectedValue(error) }) as never,
    });
    expect(await reject(new SurvivalApiError(0, 'INVALID_RESPONSE', 'version'))).toEqual({ kind: 'unsupported' });
    expect(await reject(new TypeError('offline'))).toEqual({ kind: 'offline' });
  });

  it('allows only the exact qa=1 companion parameter', async () => {
    const result = await bootstrapSurvival(`?survival=${runId}&qa=1`, {
      loadIdentity: () => identity, createClient: () => ({ getHub: vi.fn().mockResolvedValue(hub(run())) }) as never,
    });
    expect(result.kind).toBe('ready');
  });
});
