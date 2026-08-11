import { describe, expect, it, vi } from 'vitest';
import type { LocalIdentity } from '../../src/auth/localIdentity';
import { CAMPAIGN_AI_PROFILE_WEIGHTS, CAMPAIGN_OPPONENTS } from '../../src/data/campaign/opponents';
import { CampaignApiError, createCampaignClient } from '../../src/campaign/campaignClient';

const identity: LocalIdentity = {
  version: 1,
  playerId: '11111111-1111-4111-8111-111111111111',
  displayName: 'Nova',
  deviceToken: 'A'.repeat(43),
};
const attemptId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const seed = '0123456789abcdef0123456789abcdef';
const loadout = { schemaVersion: 2, interfaceId: 'NSS-V1', ...CAMPAIGN_OPPONENTS[0].loadouts[0] };
const archive = {
  configVersion: 'campaign-v1',
  aiProfiles: CAMPAIGN_AI_PROFILE_WEIGHTS,
  opponents: CAMPAIGN_OPPONENTS.map((opponent, index) => ({
    ...opponent,
    unlocked: index === 0,
    starsMask: 0,
    defeated: false,
    attemptCount: 0,
    bestOutcome: null,
  })),
  totalStars: 0,
  nextOpponentId: 'blaze-fang',
  championshipCount: 0,
};
const attempt = {
  attemptId,
  configVersion: 'campaign-v1',
  simulationVersion: 1,
  seed,
  loadoutIndex: 0,
  arena: 'neon_magma',
  aiProfileId: 'assault',
  opponent: { id: 'blaze-fang', index: 0, name: '烈焰獠牙', theme: '火属性强攻', tutorial: CAMPAIGN_OPPONENTS[0].tutorial },
  objectives: CAMPAIGN_OPPONENTS[0].objectives,
  player: { playerId: identity.playerId, displayName: 'Nova', loadout, upgrades: { attack: 0, defense: 0, stamina: 0 }, maxIntegrity: 2000 },
  enemy: { displayName: '烈焰獠牙', loadout, upgrades: { attack: 0, defense: 0, stamina: 0 } },
  startedAt: '2026-08-11T12:00:00.000Z',
};
const progression = {
  schemaVersion: 1,
  revision: 1,
  coins: 325,
  snapshot: {
    saveSchemaVersion: 2,
    unlockedParts: ['balanced', 'grip', 'round', 'slash'],
    ladderIndex: 0,
    bestLadder: 0,
    championshipCount: 0,
    build: { attackRing: 'round', core: 'balanced', driver: 'grip' },
    upgrades: { attack: 0, defense: 0, stamina: 0 },
    partUpgrades: { balanced: 0, bulwark: 0, drift: 0, grip: 0, heavy: 0, light: 0, round: 0, rush: 0, slash: 0 },
    latestNssLoadout: loadout,
  },
};
const outcome = {
  simulationVersion: 1, seed, winner: 'player', kind: 'spin finish', turnCount: 6, tickCount: 900,
  player: { spin: 50, integrity: 100, stamina: 30, spirit: 20, burst: 10, tilt: 0.5, alive: true },
  enemy: { spin: 0, integrity: 0, stamina: 0, spirit: 0, burst: 100, tilt: 1, alive: false },
};
const settlement = {
  attemptId,
  opponentId: 'blaze-fang',
  earnedStarsMask: 7,
  newStarsMask: 7,
  rewards: { battleCoins: 145, firstWinCoins: 100, starCoins: 80, partUnlocked: 'slash', partConversionCoins: 0, championshipCrowns: 0 },
  rewardEvents: [],
  progression,
  progress: { ...archive, opponents: archive.opponents.map((opponent, index) => index === 0 ? { ...opponent, defeated: true, starsMask: 7 } : { ...opponent, unlocked: index === 1 }) , totalStars: 3, nextOpponentId: 'sky-gale' },
  completedAt: '2026-08-11T12:05:00.000Z',
};

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

describe('campaign client', () => {
  it('uses authenticated exact endpoints and parses the three responses', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json(archive))
      .mockResolvedValueOnce(json(attempt, 201))
      .mockResolvedValueOnce(json(settlement));
    const client = createCampaignClient(identity, { baseUrl: 'https://arena.test/', fetchImpl });
    expect((await client.getArchive()).nextOpponentId).toBe('blaze-fang');
    expect((await client.startAttempt({ requestId, opponentId: 'blaze-fang' })).attemptId).toBe(attemptId);
    expect((await client.submitResult(attemptId, { requestId, outcome })).progression.coins).toBe(325);
    expect(fetchImpl.mock.calls.map(call => [call[0], call[1]?.method ?? 'GET'])).toEqual([
      ['https://arena.test/api/campaign', 'GET'],
      ['https://arena.test/api/campaign/attempts', 'POST'],
      [`https://arena.test/api/campaign/attempts/${attemptId}/result`, 'POST'],
    ]);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init.headers).toMatchObject({ Authorization: `Bearer ${identity.deviceToken}`, 'X-Player-Id': identity.playerId });
    }
  });

  it('rejects version, shape, and numeric drift', async () => {
    for (const invalid of [
      { ...archive, configVersion: 'campaign-v2' },
      { ...archive, totalStars: 25 },
      { ...archive, extra: true },
    ]) {
      const client = createCampaignClient(identity, { fetchImpl: vi.fn().mockResolvedValue(json(invalid)) });
      await expect(client.getArchive()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  });

  it('maps server and non-JSON failures', async () => {
    const api = createCampaignClient(identity, { fetchImpl: vi.fn().mockResolvedValue(json({ error: { code: 'CAMPAIGN_OPPONENT_LOCKED', message: 'Locked.' } }, 409)) });
    await expect(api.getArchive()).rejects.toMatchObject<Partial<CampaignApiError>>({ status: 409, code: 'CAMPAIGN_OPPONENT_LOCKED' });
    const invalid = createCampaignClient(identity, { fetchImpl: vi.fn().mockResolvedValue(new Response('nope')) });
    await expect(invalid.getArchive()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
