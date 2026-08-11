import { describe, expect, it } from 'vitest';
import { CURRENT_SAVE_SCHEMA_VERSION } from '../../src/app/saveMigration';
import type { ProgressionState } from '../../src/app/progression';
import { InviteApiError } from '../../src/auth/inviteClient';
import { ProgressionSyncError } from '../../src/progression/progressionClient';
import { createNssBattleLoadout, nssCombinationFromId } from '../../src/nss/loadout';
import {
  PORTAL_MODES,
  classifyPortalFailure,
  createBuildSummary,
} from '../../src/ui/portal';

function progression(): ProgressionState {
  return {
    saveSchemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
    unlockedParts: ['round', 'balanced', 'grip'],
    ladderIndex: 0,
    bestLadder: 0,
    championshipCount: 0,
    coins: 240,
    build: { attackRing: 'round', core: 'balanced', driver: 'grip' },
    upgrades: { attack: 0, defense: 0, stamina: 0 },
    partUpgrades: {},
    latestNssLoadout: null,
    unlockedSet: new Set(['round', 'balanced', 'grip']),
  };
}

describe('portal read model', () => {
  it('opens the campaign and keeps two later modes locked', () => {
    expect(PORTAL_MODES).toHaveLength(6);
    expect(PORTAL_MODES.filter(mode => mode.status === 'open')).toEqual([
      expect.objectContaining({ id: 'customizer', href: './customizer/' }),
      expect.objectContaining({ id: 'arena', href: './arena/' }),
      expect.objectContaining({ id: 'friend-challenge', href: '/challenges/' }),
      expect.objectContaining({ id: 'campaign', href: '/campaign/' }),
    ]);
    expect(PORTAL_MODES.filter(mode => mode.status === 'locked').map(mode => ({
      id: mode.id,
      unlockCondition: mode.unlockCondition,
      href: mode.href,
    }))).toEqual([
      { id: 'survival', unlockCondition: '阶段 7 解锁', href: undefined },
      { id: 'emblem-workshop', unlockCondition: '阶段 8 解锁', href: undefined },
    ]);
  });

  it('summarizes legacy and NSS builds without mutating progression', () => {
    const state = progression();
    const before = structuredClone(state);
    expect(createBuildSummary(state)).toBe('圆环 / 均衡 / 抓地');
    expect(state).toEqual(before);

    const combination = nssCombinationFromId('nss-p2c-0138');
    expect(combination).not.toBeNull();
    state.latestNssLoadout = createNssBattleLoadout(combination!);
    const nssBefore = structuredClone(state);
    expect(createBuildSummary(state)).toBe('NSS · nss-p2c-0138');
    expect(state).toEqual(nssBefore);
  });

  it('separates invalid identities from temporary connection failures', () => {
    expect(classifyPortalFailure(new InviteApiError(401, 'INVALID_IDENTITY', 'Invalid identity.')))
      .toBe('invalid-identity');
    expect(classifyPortalFailure(new InviteApiError(403, 'INVALID_IDENTITY', 'Invalid identity.')))
      .toBe('invalid-identity');
    expect(classifyPortalFailure(new ProgressionSyncError(401, 'AUTH_INVALID', 'Invalid identity.')))
      .toBe('invalid-identity');
    expect(classifyPortalFailure(new InviteApiError(503, 'UNAVAILABLE', 'Try again.')))
      .toBe('offline');
    expect(classifyPortalFailure(new TypeError('fetch failed'))).toBe('offline');
  });
});
