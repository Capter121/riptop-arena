import { describe, expect, it, vi } from 'vitest';
import type { LocalIdentity } from '../../src/auth/localIdentity';
import { CAMPAIGN_OPPONENTS } from '../../src/data/campaign/opponents';
import { createSurvivalClient, SurvivalApiError } from '../../src/survival/survivalClient';

const identity: LocalIdentity = {
  version: 1,
  playerId: '11111111-1111-4111-8111-111111111111',
  displayName: 'Nova',
  deviceToken: 'A'.repeat(43),
};
const runId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const seed = '0123456789abcdef0123456789abcdef';
const loadout = { schemaVersion: 2, interfaceId: 'NSS-V1', ...CAMPAIGN_OPPONENTS[0].loadouts[0] };
const wave = {
  configVersion: 'survival-v1', simulationVersion: 1, seed, wave: 1, chapter: 1, type: 'normal',
  sourceOpponentId: CAMPAIGN_OPPONENTS[0].id, sourceLoadoutIndex: 0, enemy: loadout,
  arena: 'classic_grid', aiProfileId: 'assault', riskLevel: 0, strengthMultiplier: 1,
};
const summary = {
  score: 100, highestCompletedWave: 1, bossesDefeated: 0, finalIntegrity: 1000,
  riskLevel: 0, achievedAt: '2026-08-12T10:00:00.000Z', abandoned: false,
};
const run = {
  runId, configVersion: 'survival-v1', simulationVersion: 1, battleRulesVersion: 2, seed,
  status: 'wave_ready',
  player: { playerId: identity.playerId, displayName: 'Nova', loadout, upgrades: { attack: 0, defense: 0, stamina: 0 }, maximumIntegrity: 2000 },
  wave,
  checkpoint: {
    currentWave: 1, integrity: 2000, burstRisk: 0, persistentDebuffs: [],
    growthLevels: { 'attack-calibration': 0, coordination: 0, 'affinity-tuning': 0, 'pickup-tuning': 0 },
    nextWaveEffect: null, riskLevel: 0, score: 0, flawlessStreak: 0, bossesDefeated: 0,
  },
  finalSummary: null,
  createdAt: '2026-08-12T09:00:00.000Z', updatedAt: '2026-08-12T09:00:00.000Z', completedAt: null,
};
const best = {
  runId, score: summary.score, highestCompletedWave: summary.highestCompletedWave,
  bossesDefeated: summary.bossesDefeated, finalIntegrity: summary.finalIntegrity,
  riskLevel: summary.riskLevel, loadoutSummary: loadout, achievedAt: summary.achievedAt,
};
const leaderboard = {
  entries: [{ rank: 1, playerId: identity.playerId, displayName: 'Nova', ...best }],
  nextCursor: null, currentRank: 1,
};
const history = { items: [best], nextCursor: 'next_page' };
const hub = {
  configVersion: 'survival-v1', activeRun: run, personalBest: best,
  milestones: [
    { wave: 5, coins: 100, earned: false }, { wave: 10, coins: 200, earned: false },
    { wave: 15, coins: 350, earned: false }, { wave: 20, coins: 500, earned: false },
  ],
  leaderboard,
};
const progression = {
  schemaVersion: 1, revision: 1, coins: 100,
  snapshot: {
    saveSchemaVersion: 2, unlockedParts: [], ladderIndex: 0, bestLadder: 0, championshipCount: 0,
    build: { attackRing: 'round', core: 'balanced', driver: 'grip' },
    upgrades: { attack: 0, defense: 0, stamina: 0 }, partUpgrades: {}, latestNssLoadout: loadout,
  },
};
const outcome = {
  simulationVersion: 1, seed, winner: 'enemy', kind: 'spin finish', turnCount: 6, tickCount: 900,
  player: { spin: 0, integrity: 0, stamina: 0, spirit: 0, burst: 100, tilt: 1, alive: false },
  enemy: { spin: 50, integrity: 100, stamina: 30, spirit: 20, burst: 10, tilt: 0.5, alive: true },
};
const settlement = {
  run: { ...run, status: 'reward_pending' },
  score: { base: 100, waveTypeBonus: 0, finishBonus: 25, flawlessBonus: 0, flawlessStreakBonus: 0, subtotal: 125, riskMultiplier: 1, score: 125 },
  rewardOptions: [{ kind: 'growth', id: 'attack-calibration', level: 1 }],
  milestone: null,
  progression,
};

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

describe('survival client', () => {
  it('uses authenticated endpoints and parses hub, run, settlement, reward, abandon, and leaderboard', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json(hub))
      .mockResolvedValueOnce(json({ created: true, run }, 201))
      .mockResolvedValueOnce(json(settlement))
      .mockResolvedValueOnce(json({ run }))
      .mockResolvedValueOnce(json({ ...run, status: 'completed', finalSummary: summary, completedAt: summary.achievedAt }))
      .mockResolvedValueOnce(json(leaderboard))
      .mockResolvedValueOnce(json(history));
    const client = createSurvivalClient(identity, { baseUrl: 'https://arena.test/', fetchImpl });

    expect((await client.getHub()).activeRun?.runId).toBe(runId);
    expect((await client.startRun({ requestId })).created).toBe(true);
    expect((await client.submitWaveResult(runId, 1, { requestId, configVersion: 'survival-v1', simulationVersion: 1, battleRulesVersion: 2, wave: 1, outcome })).progression.coins).toBe(100);
    expect((await client.selectReward(runId, 1, { requestId, reward: settlement.rewardOptions[0] })).run.runId).toBe(runId);
    expect((await client.abandonRun(runId, { requestId })).status).toBe('completed');
    expect((await client.getLeaderboard({ limit: 20 })).entries[0].rank).toBe(1);
    expect((await client.getHistory({ limit: 20, cursor: 'page_1' })).items[0].runId).toBe(runId);
    expect(fetchImpl.mock.calls.map(call => [call[0], call[1]?.method ?? 'GET'])).toEqual([
      ['https://arena.test/api/survival', 'GET'],
      ['https://arena.test/api/survival/runs', 'POST'],
      [`https://arena.test/api/survival/runs/${runId}/waves/1/result`, 'POST'],
      [`https://arena.test/api/survival/runs/${runId}/waves/1/reward`, 'POST'],
      [`https://arena.test/api/survival/runs/${runId}/abandon`, 'POST'],
      ['https://arena.test/api/survival/leaderboard?limit=20', 'GET'],
      ['https://arena.test/api/survival/history?limit=20&cursor=page_1', 'GET'],
    ]);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init.headers).toMatchObject({ Authorization: `Bearer ${identity.deviceToken}`, 'X-Player-Id': identity.playerId });
    }
  });

  it('rejects extra fields, unknown versions, invalid loadouts, reward candidates, and ranking fields', async () => {
    const invalidValues = [
      { ...hub, extra: true },
      { ...hub, configVersion: 'survival-v2' },
      { ...hub, activeRun: { ...run, player: { ...run.player, loadout: { ...loadout, schemaVersion: 1 } } } },
      { ...settlement, rewardOptions: [{ kind: 'instant', id: 'unknown' }] },
      { ...leaderboard, entries: [{ ...leaderboard.entries[0], rank: 0 }] },
      { ...history, items: [{ ...best, achievedAt: 'invalid' }] },
      { ...history, nextCursor: '*' },
    ];
    const calls = [
      (client: ReturnType<typeof createSurvivalClient>) => client.getHub(),
      (client: ReturnType<typeof createSurvivalClient>) => client.getHub(),
      (client: ReturnType<typeof createSurvivalClient>) => client.getHub(),
      (client: ReturnType<typeof createSurvivalClient>) => client.submitWaveResult(runId, 1, { requestId, configVersion: 'survival-v1', simulationVersion: 1, battleRulesVersion: 2, wave: 1, outcome }),
      (client: ReturnType<typeof createSurvivalClient>) => client.getLeaderboard(),
      (client: ReturnType<typeof createSurvivalClient>) => client.getHistory(),
      (client: ReturnType<typeof createSurvivalClient>) => client.getHistory(),
    ];
    for (let index = 0; index < invalidValues.length; index += 1) {
      const client = createSurvivalClient(identity, { fetchImpl: vi.fn().mockResolvedValue(json(invalidValues[index])) });
      await expect(calls[index](client)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  });

  it('maps server and non-JSON failures', async () => {
    const api = createSurvivalClient(identity, { fetchImpl: vi.fn().mockResolvedValue(json({ error: { code: 'STALE_SURVIVAL_STATE', message: 'Stale.' } }, 409)) });
    await expect(api.getHub()).rejects.toMatchObject<Partial<SurvivalApiError>>({ status: 409, code: 'STALE_SURVIVAL_STATE' });
    const invalid = createSurvivalClient(identity, { fetchImpl: vi.fn().mockResolvedValue(new Response('nope')) });
    await expect(invalid.getHub()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
