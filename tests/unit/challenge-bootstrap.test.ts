import { describe, expect, it, vi } from 'vitest';
import versions from '../../battle-top-designer/shared/nss/versions.json';
import { NSS_BATTLE_CATALOG_SHA256 } from '../../src/nss/battleCatalog';
import { bootstrapChallenge, parseGameChallengeInput } from '../../src/challenges/challengeBootstrap';
import { buildNssBattleStats } from '../../src/nss/buildStats';

const playerId = '11111111-1111-4111-8111-111111111111';
const enemyId = '22222222-2222-4222-8222-222222222222';
const challengeId = '33333333-3333-4333-8333-333333333333';
const offerId = '44444444-4444-4444-8444-444444444444';
const loadout = {
  schemaVersion: 2 as const, interfaceId: 'NSS-V1' as const,
  combination: { core: 'core_solar_wolf', blade: 'blade_storm_fang', assist: 'assist_air', gear: 'gear_medium', tip: 'tip_ball_defense' },
  affinities: { core: 'LIGHT', blade: 'WIND', assist: 'FIRE', gear: 'WATER', tip: 'EARTH' } as const,
};
const upgrades = { upgrades: { attack: 2, defense: 1, stamina: 3 }, partUpgrades: { balanced: 0, bulwark: 0, drift: 0, grip: 0, heavy: 0, light: 0, round: 0, rush: 0, slash: 0 } };

function input(mode: 'fair' | 'full_power' = 'full_power') {
  const selected = mode === 'fair' ? { ...upgrades, upgrades: { attack: 0, defense: 0, stamina: 0 } } : upgrades;
  return {
    challengeSchemaVersion: versions.challengeSchemaVersion,
    catalogVersion: versions.catalogVersion,
    catalogSha256: NSS_BATTLE_CATALOG_SHA256,
    affinityRulesVersion: versions.affinityRulesVersion,
    battleRulesVersion: versions.battleRulesVersion,
    simulationVersion: versions.simulationVersion,
    offerId, parentChallengeId: null, seed: '00112233445566778899aabbccddeeff', mode,
    arena: 'absolute_zero', aiConfig: 'deterministic-v1',
    player: { playerId, displayName: 'Responder', loadout, upgrades: selected },
    enemy: { playerId: enemyId, displayName: 'Creator', loadout: { ...loadout, combination: { ...loadout.combination, tip: 'tip_flat_attack' } }, upgrades: selected },
  };
}

function view(overrides: Record<string, unknown> = {}) {
  return { id: challengeId, status: 'pending', creatorPlayerId: enemyId, recipientPlayerId: playerId, offerId, parentChallengeId: null,
    createdAt: '', updatedAt: '', completedAt: null, input: input(), result: null, actions: { canBattle: true, canRematch: false }, ...overrides } as never;
}

describe('challenge Arena bootstrap', () => {
  it('uses immutable responder/enemy loadouts, seed, arena, and frozen upgrades', () => {
    const parsed = parseGameChallengeInput(challengeId, input());
    expect(parsed.player.displayName).toBe('Responder');
    expect(parsed.enemy.displayName).toBe('Creator');
    expect(parsed.enemy.loadout.combination.tip).toBe('tip_flat_attack');
    expect(parsed.player.upgrades).toEqual({ attack: 2, defense: 1, stamina: 3 });
    expect(parsed).toMatchObject({ id: challengeId, mode: 'full_power', arena: 'absolute_zero', seed: '00112233445566778899aabbccddeeff' });
    const replay = parseGameChallengeInput(challengeId, structuredClone(input()));
    expect(buildNssBattleStats(replay.player.loadout, replay.player.upgrades)).toEqual(
      buildNssBattleStats(parsed.player.loadout, parsed.player.upgrades),
    );
  });

  it('keeps fair upgrades at zero and rejects version or shape drift', () => {
    expect(parseGameChallengeInput(challengeId, input('fair')).player.upgrades).toEqual({ attack: 0, defense: 0, stamina: 0 });
    expect(() => parseGameChallengeInput(challengeId, { ...input(), simulationVersion: 99 })).toThrow('Unsupported challenge version');
    expect(() => parseGameChallengeInput(challengeId, { ...input(), extra: true })).toThrow('Invalid challenge input');
  });

  it('does not call the API without identity and classifies completed, forbidden, and offline states', async () => {
    const getChallenge = vi.fn();
    expect(await bootstrapChallenge(`?challenge=${challengeId}`, { loadIdentity: () => null, createClient: () => ({ getChallenge }) as never }))
      .toEqual({ kind: 'missing_identity' });
    expect(getChallenge).not.toHaveBeenCalled();

    const identity = { version: 1 as const, playerId, displayName: 'Responder', deviceToken: 'token' };
    const run = (value: unknown) => bootstrapChallenge(`?challenge=${challengeId}`, {
      loadIdentity: () => identity,
      createClient: () => ({ getChallenge: vi.fn().mockImplementation(() => value instanceof Error ? Promise.reject(value) : Promise.resolve(value)) }) as never,
    });
    expect(await run(view({ status: 'completed', actions: { canBattle: false, canRematch: true } }))).toEqual({ kind: 'completed' });
    expect(await run(view({ recipientPlayerId: enemyId, actions: { canBattle: false, canRematch: false } }))).toEqual({ kind: 'forbidden' });
    expect(await run(new TypeError('offline'))).toEqual({ kind: 'offline' });
  });

  it('rejects invalid, repeated, or additional challenge query parameters', async () => {
    for (const search of ['', '?challenge=nope', `?challenge=${challengeId}&challenge=${challengeId}`, `?challenge=${challengeId}&qa=1`]) {
      expect(await bootstrapChallenge(search)).toEqual({ kind: 'invalid_link' });
    }
  });
});
