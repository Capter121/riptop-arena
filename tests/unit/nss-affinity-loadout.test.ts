import { afterEach, describe, expect, it, vi } from 'vitest';
import { AFFINITIES, type PartAffinity } from '../../battle-top-designer/shared/nss/affinity';
import { loadProgression } from '../../src/app/progression';
import { buildNssBattleStats } from '../../src/nss/buildStats';
import {
  createNssBattleLoadout,
  enumerateNssCombinations,
  isNssBattleLoadoutV2,
  migrateNssBattleLoadout,
  nssCombinationId,
  parseNssBattleLoadout,
} from '../../src/nss/loadout';
import type { NssAffinitySelection, NssBattleLoadoutV1 } from '../../src/nss/types';

const firstCombination = enumerateNssCombinations()[0];

function allLayers(affinity: PartAffinity): NssAffinitySelection {
  return { core: affinity, blade: affinity, assist: affinity, gear: affinity, tip: affinity };
}

function legacyLoadout(core: 'core_solar_wolf' | 'core_void_falcon'): NssBattleLoadoutV1 {
  return {
    schemaVersion: 1,
    interfaceId: 'NSS-V1',
    combination: { ...firstCombination, core },
  };
}

describe('NSS A2 affinity loadouts', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('allows every affinity on all five model layers', () => {
    for (const affinity of AFFINITIES) {
      const loadout = createNssBattleLoadout(firstCombination, allLayers(affinity));
      expect(isNssBattleLoadoutV2(loadout)).toBe(true);
      expect(loadout.affinities).toEqual(allLayers(affinity));
    }
  });

  it('migrates legacy core models to LIGHT and DARK deterministically', () => {
    expect(migrateNssBattleLoadout(legacyLoadout('core_solar_wolf')).affinities).toEqual({
      core: 'LIGHT', blade: 'WIND', assist: 'FIRE', gear: 'WATER', tip: 'EARTH',
    });
    expect(migrateNssBattleLoadout(legacyLoadout('core_void_falcon')).affinities).toEqual({
      core: 'DARK', blade: 'WIND', assist: 'FIRE', gear: 'WATER', tip: 'EARTH',
    });
  });

  it('preserves the model combination ID and pre-affinity battle stats', () => {
    const legacy = legacyLoadout('core_solar_wolf');
    const migrated = migrateNssBattleLoadout(legacy);
    expect(nssCombinationId(migrated.combination)).toBe(nssCombinationId(legacy.combination));
    expect(buildNssBattleStats(migrated)).toEqual(buildNssBattleStats(legacy));
  });

  it('parses V1 as V2 and rejects missing or unknown affinities', () => {
    expect(parseNssBattleLoadout(JSON.stringify(legacyLoadout('core_void_falcon'))).schemaVersion).toBe(2);
    const valid = createNssBattleLoadout(firstCombination, allLayers('WOOD'));
    const { tip: _tip, ...missingTip } = valid.affinities;
    expect(isNssBattleLoadoutV2({ ...valid, affinities: missingTip })).toBe(false);
    expect(isNssBattleLoadoutV2({ ...valid, affinities: { ...valid.affinities, tip: 'ICE' } })).toBe(false);
  });

  it('migrates a V1 loadout read from the existing local progression save', () => {
    const saved = JSON.stringify({ latestNssLoadout: legacyLoadout('core_void_falcon') });
    vi.stubGlobal('window', { localStorage: { getItem: () => saved } });
    expect(loadProgression().latestNssLoadout).toMatchObject({
      schemaVersion: 2,
      affinities: { core: 'DARK', blade: 'WIND', assist: 'FIRE', gear: 'WATER', tip: 'EARTH' },
    });
  });
});
