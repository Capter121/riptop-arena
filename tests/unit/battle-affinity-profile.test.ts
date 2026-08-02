import { describe, expect, it } from 'vitest';
import {
  NEUTRAL_BATTLE_AFFINITY,
  resolveLegacyBattleAffinity,
  resolveNssBattleAffinity,
} from '../../src/gameplay/battleAffinity';
import { buildStats, PLAYER_INVENTORY } from '../../src/gameplay/build';
import { DEFAULT_BUILD } from '../../src/data/parts';
import { buildNssBattleStats } from '../../src/nss/buildStats';
import {
  createNssBattleLoadout,
  enumerateNssCombinations,
  migrateNssBattleLoadout,
} from '../../src/nss/loadout';
import type { NssBattleLoadoutV1 } from '../../src/nss/types';
import { resolveAffinityProfile } from '../../battle-top-designer/shared/nss/affinity';

describe('battle affinity profiles', () => {
  const combination = enumerateNssCombinations()[0];

  it('adapts an NSS V2 loadout from the shared five-layer profile', () => {
    const loadout = createNssBattleLoadout(combination, {
      core: 'DARK',
      blade: 'DARK',
      assist: 'DARK',
      gear: 'FIRE',
      tip: 'WATER',
    });
    const shared = resolveAffinityProfile(loadout.affinities);

    expect(resolveNssBattleAffinity(loadout)).toEqual({
      source: 'nss',
      primary: shared.primary,
      resonance: shared.resonance,
      modifiers: shared.modifiers,
    });
    expect(buildNssBattleStats(loadout).affinity).toEqual(resolveNssBattleAffinity(loadout));
  });

  it('migrates an NSS V1 loadout before resolving its profile', () => {
    const loadout: NssBattleLoadoutV1 = {
      schemaVersion: 1,
      interfaceId: 'NSS-V1',
      combination,
    };
    const migrated = migrateNssBattleLoadout(loadout);

    expect(resolveNssBattleAffinity(loadout)).toEqual({
      source: 'nss',
      primary: resolveAffinityProfile(migrated.affinities).primary,
      resonance: resolveAffinityProfile(migrated.affinities).resonance,
      modifiers: resolveAffinityProfile(migrated.affinities).modifiers,
    });
  });

  it('maps legacy aliases and uses the fixed affinity order for ties', () => {
    expect(resolveLegacyBattleAffinity({ ROCK: 3 })).toMatchObject({ source: 'legacy', primary: 'EARTH' });
    expect(resolveLegacyBattleAffinity({ LIGHTNING: 3 })).toMatchObject({ source: 'legacy', primary: 'WIND' });
    expect(resolveLegacyBattleAffinity({ DIVINE: 3 })).toMatchObject({ source: 'legacy', primary: 'LIGHT' });
    expect(resolveLegacyBattleAffinity({ FIRE: 2, WIND: 2, DARK: 1 })).toMatchObject({
      source: 'legacy',
      primary: 'WIND',
    });
    expect(resolveLegacyBattleAffinity({ ROCK: 2, WATER: 2 })).toMatchObject({
      source: 'legacy',
      primary: 'WATER',
    });
  });

  it('never grants legacy resonance or modifiers', () => {
    const profile = resolveLegacyBattleAffinity({ FIRE: 5 });
    expect(profile).toEqual({
      source: 'legacy',
      primary: 'FIRE',
      resonance: { kind: 'none' },
      modifiers: {
        elementalPower: 1,
        defenseMultiplier: 1,
        spinDrainMultiplier: 1,
        tiltGrowthMultiplier: 1,
      },
    });
  });

  it('attaches the resolved legacy profile without replacing the compatibility attributes', () => {
    const inventoryStart = PLAYER_INVENTORY.length;
    PLAYER_INVENTORY.push(
      { instanceId: 'affinity-ring', baseTemplateId: 'round', category: 'LAYER', attribute: 'FIRE', tier: 'COMMON' },
      { instanceId: 'affinity-core', baseTemplateId: 'balanced', category: 'CHIP', attribute: 'WIND', tier: 'COMMON' },
      { instanceId: 'affinity-driver', baseTemplateId: 'grip', category: 'DRIVER', attribute: 'DARK', tier: 'COMMON' },
    );

    try {
      const stats = buildStats({
        attackRing: 'affinity-ring',
        core: 'affinity-core',
        driver: 'affinity-driver',
      });
      expect(stats.attributes).toEqual({ FIRE: 1, WIND: 1, DARK: 1 });
      expect(stats.affinity).toMatchObject({ source: 'legacy', primary: 'WIND' });
    } finally {
      PLAYER_INVENTORY.splice(inventoryStart);
    }
  });

  it('uses the frozen neutral profile only for an empty legacy attribute set', () => {
    expect(resolveLegacyBattleAffinity({})).toBe(NEUTRAL_BATTLE_AFFINITY);
    expect(buildStats(DEFAULT_BUILD).affinity).toBe(NEUTRAL_BATTLE_AFFINITY);
    expect(NEUTRAL_BATTLE_AFFINITY).toEqual({
      source: 'neutral',
      primary: null,
      resonance: { kind: 'none' },
      modifiers: {
        elementalPower: 1,
        defenseMultiplier: 1,
        spinDrainMultiplier: 1,
        tiltGrowthMultiplier: 1,
      },
    });
    expect(Object.isFrozen(NEUTRAL_BATTLE_AFFINITY)).toBe(true);
    expect(Object.isFrozen(NEUTRAL_BATTLE_AFFINITY.resonance)).toBe(true);
    expect(Object.isFrozen(NEUTRAL_BATTLE_AFFINITY.modifiers)).toBe(true);
  });

  it('rejects malformed NSS affinity input instead of making it neutral', () => {
    expect(() => resolveNssBattleAffinity({
      schemaVersion: 2,
      interfaceId: 'NSS-V1',
      combination,
      affinities: {
        core: 'ICE',
        blade: 'WIND',
        assist: 'FIRE',
        gear: 'WATER',
        tip: 'EARTH',
      },
    } as never)).toThrow('Invalid NSS battle loadout');
  });
});
