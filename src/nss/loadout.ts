import { nssFamilyParts, nssPartById } from './catalog';
import { isPartAffinity } from '../../battle-top-designer/shared/nss/affinity';
import {
  NSS_FAMILIES,
  type NssAffinitySelection,
  type NssBattleLoadout,
  type NssBattleLoadoutV1,
  type NssBattleLoadoutV2,
  type NssCombination,
} from './types';

const combinationKeys = [...NSS_FAMILIES].sort().join(',');
const affinityKeys = combinationKeys;

export function isNssCombination(value: unknown): value is NssCombination {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== combinationKeys) return false;
  return NSS_FAMILIES.every(family => {
    const part = typeof record[family] === 'string' ? nssPartById.get(record[family]) : undefined;
    return part?.family === family;
  });
}

export function isNssBattleLoadoutV1(value: unknown): value is NssBattleLoadoutV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== 'combination,interfaceId,schemaVersion') return false;
  return record.schemaVersion === 1
    && record.interfaceId === 'NSS-V1'
    && isNssCombination(record.combination);
}

export function isNssAffinitySelection(value: unknown): value is NssAffinitySelection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).sort().join(',') === affinityKeys
    && NSS_FAMILIES.every(family => isPartAffinity(record[family]));
}

export function isNssBattleLoadoutV2(value: unknown): value is NssBattleLoadoutV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== 'affinities,combination,interfaceId,schemaVersion') return false;
  return record.schemaVersion === 2
    && record.interfaceId === 'NSS-V1'
    && isNssCombination(record.combination)
    && isNssAffinitySelection(record.affinities);
}

export function isNssBattleLoadout(value: unknown): value is NssBattleLoadout {
  return isNssBattleLoadoutV1(value) || isNssBattleLoadoutV2(value);
}

export function defaultNssAffinities(combination: NssCombination): NssAffinitySelection {
  if (!isNssCombination(combination)) throw new Error('Invalid NSS combination');
  return {
    core: combination.core === 'core_void_falcon' ? 'DARK' : 'LIGHT',
    blade: 'WIND',
    assist: 'FIRE',
    gear: 'WATER',
    tip: 'EARTH',
  };
}

export function createNssBattleLoadout(
  combination: NssCombination,
  affinities: NssAffinitySelection = defaultNssAffinities(combination),
): NssBattleLoadoutV2 {
  if (!isNssCombination(combination)) throw new Error('Invalid NSS combination');
  if (!isNssAffinitySelection(affinities)) throw new Error('Invalid NSS affinity selection');
  return {
    schemaVersion: 2,
    interfaceId: 'NSS-V1',
    combination: { ...combination },
    affinities: { ...affinities },
  };
}

export function migrateNssBattleLoadout(loadout: NssBattleLoadout): NssBattleLoadoutV2 {
  if (isNssBattleLoadoutV2(loadout)) {
    return createNssBattleLoadout(loadout.combination, loadout.affinities);
  }
  if (isNssBattleLoadoutV1(loadout)) return createNssBattleLoadout(loadout.combination);
  throw new Error('Invalid NSS battle loadout');
}

export function enumerateNssCombinations(): NssCombination[] {
  const result: NssCombination[] = [];
  for (const core of nssFamilyParts.core)
    for (const blade of nssFamilyParts.blade)
      for (const assist of nssFamilyParts.assist)
        for (const gear of nssFamilyParts.gear)
          for (const tip of nssFamilyParts.tip)
            result.push({ core: core.id, blade: blade.id, assist: assist.id, gear: gear.id, tip: tip.id });
  return result;
}

export function nssCombinationId(combination: NssCombination): string {
  if (!isNssCombination(combination)) throw new Error('Invalid NSS combination');
  const indexes = NSS_FAMILIES.map(family => nssFamilyParts[family].findIndex(part => part.id === combination[family]));
  const [, blades, assists, gears, tips] = NSS_FAMILIES.map(family => nssFamilyParts[family].length);
  const rank = ((((indexes[0] * blades + indexes[1]) * assists + indexes[2]) * gears + indexes[3]) * tips + indexes[4]) + 1;
  return `nss-p2c-${String(rank).padStart(4, '0')}`;
}

const combinationsById = new Map(enumerateNssCombinations().map(combination => [nssCombinationId(combination), combination]));

export function nssCombinationFromId(id: string): NssCombination | null {
  const combination = combinationsById.get(id);
  return combination ? { ...combination } : null;
}

export function parseNssBattleLoadout(text: string): NssBattleLoadoutV2 {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('Invalid NSS loadout JSON'); }
  if (!isNssBattleLoadout(value)) throw new Error('Invalid NSS battle loadout');
  return migrateNssBattleLoadout(value);
}
