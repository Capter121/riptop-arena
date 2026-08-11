import { describe, expect, it, vi } from 'vitest';
import { CAMPAIGN_OPPONENTS } from '../../src/data/campaign/opponents';
import { CampaignApiError, type CampaignAttempt } from '../../src/campaign/campaignClient';
import { bootstrapCampaign } from '../../src/campaign/campaignBootstrap';
import { CampaignController } from '../../src/campaign/campaignController';

const playerId = '11111111-1111-4111-8111-111111111111';
const attemptId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const identity = { version: 1 as const, playerId, displayName: 'Nova', deviceToken: 'A'.repeat(43) };
const loadout = { schemaVersion: 2 as const, interfaceId: 'NSS-V1' as const, ...CAMPAIGN_OPPONENTS[0].loadouts[0] };

function attempt(overrides: Partial<CampaignAttempt> = {}): CampaignAttempt {
  return {
    attemptId, configVersion: 'campaign-v1', simulationVersion: 1,
    seed: '00112233445566778899aabbccddeeff', loadoutIndex: 0, arena: 'neon_magma', aiProfileId: 'assault',
    opponent: { id: 'blaze-fang', index: 0, name: '烈焰獠牙', theme: '火属性强攻', tutorial: '保持防守。' },
    objectives: CAMPAIGN_OPPONENTS[0].objectives,
    player: { playerId, displayName: 'Nova', loadout, upgrades: { attack: 2, defense: 1, stamina: 3 }, maxIntegrity: 1500 },
    enemy: { displayName: '烈焰獠牙', loadout, upgrades: { attack: 0, defense: 0, stamina: 0 } },
    startedAt: '2026-08-11T00:00:00.000Z', ...overrides,
  };
}

describe('campaign Arena bootstrap', () => {
  it('freezes every server field into the game controller', async () => {
    const startAttempt = vi.fn().mockResolvedValue(attempt());
    const result = await bootstrapCampaign('?campaign=blaze-fang', {
      loadIdentity: () => identity,
      createClient: () => ({ startAttempt }) as never,
      randomUUID: () => requestId,
    });
    expect(startAttempt).toHaveBeenCalledWith({ requestId, opponentId: 'blaze-fang' });
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    expect(result.controller.gameOptions()).toMatchObject({
      battleKind: 'campaign', attemptId, opponentId: 'blaze-fang', opponentName: '烈焰獠牙',
      arena: 'neon_magma', seed: '00112233445566778899aabbccddeeff', aiProfileId: 'assault',
      player: { loadout, upgrades: { attack: 2, defense: 1, stamina: 3 } },
      enemy: { loadout, upgrades: { attack: 0, defense: 0, stamina: 0 } },
    });
  });

  it('rejects invalid modes before API use and classifies start failures', async () => {
    const startAttempt = vi.fn();
    for (const search of ['', '?campaign=missing', '?campaign=blaze-fang&campaign=blaze-fang', '?campaign=blaze-fang&challenge=x', '?campaign=blaze-fang&qa=2']) {
      expect(await bootstrapCampaign(search, { loadIdentity: () => identity, createClient: () => ({ startAttempt }) as never })).toEqual({ kind: 'invalid_link' });
    }
    expect(startAttempt).not.toHaveBeenCalled();
    expect(await bootstrapCampaign('?campaign=blaze-fang', { loadIdentity: () => null })).toEqual({ kind: 'missing_identity' });

    const run = (error: Error) => bootstrapCampaign('?campaign=blaze-fang', {
      loadIdentity: () => identity,
      createClient: () => ({ startAttempt: vi.fn().mockRejectedValue(error) }) as never,
      randomUUID: () => requestId,
    });
    expect(await run(new CampaignApiError(409, 'CAMPAIGN_OPPONENT_LOCKED', 'locked'))).toEqual({ kind: 'locked' });
    expect(await run(new CampaignApiError(409, 'NSS_LOADOUT_REQUIRED', 'loadout'))).toEqual({ kind: 'nss_required' });
    expect(await run(new CampaignApiError(400, 'INVALID_RESPONSE', 'version'))).toEqual({ kind: 'unsupported' });
    expect(await run(new TypeError('offline'))).toEqual({ kind: 'offline' });
  });

  it('allows only the exact qa=1 companion parameter', async () => {
    const result = await bootstrapCampaign('?campaign=blaze-fang&qa=1', {
      loadIdentity: () => identity,
      createClient: () => ({ startAttempt: vi.fn().mockResolvedValue(attempt()) }) as never,
      randomUUID: () => requestId,
    });
    expect(result.kind).toBe('ready');
  });

  it('persists one normalized result before submitting and reuses the in-flight settlement', async () => {
    const values = new Map<string, string>();
    const storage = { get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null,
      getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
    const settlement = { attemptId, opponentId: 'blaze-fang' };
    const submitResult = vi.fn(async () => { expect(values.size).toBe(1); return settlement; });
    const controller = new CampaignController(attempt(), identity, { submitResult } as never);
    const outcome = {
      simulationVersion: 1 as const, seed: '00112233445566778899aabbccddeeff', winner: 'player' as const,
      kind: 'burst finish' as const, turnCount: 4, tickCount: 720,
      player: { spin: 1, integrity: 1200, stamina: 1, spirit: 0, burst: 0, tilt: 0, alive: true },
      enemy: { spin: 0, integrity: 0, stamina: 0, spirit: 0, burst: 1, tilt: 1, alive: false },
    };
    const first = controller.settle(outcome, { storage, randomUUID: () => requestId });
    const second = controller.settle(structuredClone(outcome), { storage, randomUUID: () => crypto.randomUUID() });
    expect(second).toBe(first);
    await expect(first).resolves.toEqual({ status: 'submitted', settlement });
    expect(submitResult).toHaveBeenCalledTimes(1);
    expect(values.size).toBe(0);
  });

  it('keeps offline results, blocks unsafe storage, and marks conflicts', async () => {
    const outcome = {
      simulationVersion: 1 as const, seed: '00112233445566778899aabbccddeeff', winner: 'enemy' as const,
      kind: 'timeout' as const, turnCount: 8, tickCount: 900,
      player: { spin: 0, integrity: 0, stamina: 0, spirit: 0, burst: 0, tilt: 1, alive: false },
      enemy: { spin: 1, integrity: 900, stamina: 1, spirit: 0, burst: 0, tilt: 0, alive: true },
    };
    const memory = () => {
      const values = new Map<string, string>();
      return { values, storage: { get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null,
        getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } };
    };
    const offline = memory();
    const pending = new CampaignController(attempt(), identity, { submitResult: vi.fn().mockRejectedValue(new TypeError('offline')) } as never);
    await expect(pending.settle(outcome, { storage: offline.storage, randomUUID: () => requestId })).resolves.toEqual({ status: 'pending' });
    expect(offline.values.size).toBe(1);

    const blockedSubmit = vi.fn();
    const blocked = new CampaignController(attempt(), identity, { submitResult: blockedSubmit } as never);
    const blockedStorage = { ...memory().storage, setItem: () => { throw new Error('blocked'); } };
    await expect(blocked.settle(outcome, { storage: blockedStorage, randomUUID: () => requestId })).resolves.toEqual({ status: 'storage_failed' });
    expect(blockedSubmit).not.toHaveBeenCalled();

    const conflictMemory = memory();
    const conflict = new CampaignController(attempt(), identity, { submitResult: vi.fn().mockRejectedValue(new CampaignApiError(409, 'CAMPAIGN_RESULT_CONFLICT', 'conflict')) } as never);
    await expect(conflict.settle(outcome, { storage: conflictMemory.storage, randomUUID: () => requestId })).resolves.toEqual({ status: 'conflict' });
    expect([...conflictMemory.values.values()][0]).toContain('"status":"conflict"');
  });
});
