import { describe, expect, it } from 'vitest';
import sharedCatalog from '../../../shared/nss/parts.catalog.json';
import loadoutSchema from '../../../shared/nss/loadout.schema.json';
import generatedCatalog from '../../src/generated/parts.catalog.json';
import { combinationId, enumerateCombinations, families, familyParts } from '../../src/domain';
import {
  createNssBattleLoadout, enumerateNssCombinations, isNssBattleLoadoutV1,
  nssCombinationFromId, nssCombinationId,
} from '../../../../src/nss/loadout';

describe('shared NSS contract', () => {
  it('keeps generated and shared part catalogs byte-equivalent in data', () => {
    expect(sharedCatalog).toEqual(generatedCatalog);
    expect(sharedCatalog.parts).toHaveLength(16);
    expect(new Set(sharedCatalog.parts.map(part => part.id)).size).toBe(16);
    expect(sharedCatalog.parts.every(part => part.interfaceId === 'NSS-V1')).toBe(true);
  });

  it('locks the V1 loadout to the five NSS families', () => {
    expect(loadoutSchema.additionalProperties).toBe(false);
    expect(loadoutSchema.required).toEqual(['schemaVersion', 'interfaceId', 'combination']);
    expect(loadoutSchema.properties.combination.additionalProperties).toBe(false);
    expect(loadoutSchema.properties.combination.required).toEqual(families);
    expect(loadoutSchema.properties.interfaceId.const).toBe('NSS-V1');
  });

  it('preserves all 288 canonical combination IDs', () => {
    expect(families.map(family => familyParts[family].length)).toEqual([2, 4, 3, 3, 4]);
    const ids = enumerateCombinations().map(combinationId);
    expect(ids).toHaveLength(288);
    expect(new Set(ids).size).toBe(288);
    expect(ids[0]).toBe('nss-p2c-0001');
    expect(ids.at(-1)).toBe('nss-p2c-0288');
  });

  it('round-trips the root game mapping against every customizer combination', () => {
    const customizerCombinations = enumerateCombinations();
    const gameCombinations = enumerateNssCombinations();
    expect(gameCombinations).toEqual(customizerCombinations);
    for (const combination of gameCombinations) {
      const id = nssCombinationId(combination);
      expect(nssCombinationFromId(id)).toEqual(combination);
      expect(isNssBattleLoadoutV1(createNssBattleLoadout(combination))).toBe(true);
    }
  });

  it('rejects malformed and family-mismatched root game loadouts', () => {
    const valid = createNssBattleLoadout(enumerateNssCombinations()[0]);
    expect(isNssBattleLoadoutV1({ ...valid, extra: true })).toBe(false);
    expect(isNssBattleLoadoutV1({ ...valid, schemaVersion: 2 })).toBe(false);
    expect(isNssBattleLoadoutV1({ ...valid, combination: { ...valid.combination, core: 'blade_storm_fang' } })).toBe(false);
    expect(nssCombinationFromId('NSS-P2C-0001')).toBeNull();
    expect(nssCombinationFromId('nss-p2c-9999')).toBeNull();
  });
});
