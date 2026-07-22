import { nssFamilyParts, nssPartById } from './catalog';
import { NSS_FAMILIES, type NssBattleLoadoutV1, type NssCombination } from './types';

const combinationKeys = [...NSS_FAMILIES].sort().join(',');

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

export function createNssBattleLoadout(combination: NssCombination): NssBattleLoadoutV1 {
  if (!isNssCombination(combination)) throw new Error('Invalid NSS combination');
  return { schemaVersion: 1, interfaceId: 'NSS-V1', combination: { ...combination } };
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

export function parseNssBattleLoadout(text: string): NssBattleLoadoutV1 {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('Invalid NSS loadout JSON'); }
  if (!isNssBattleLoadoutV1(value)) throw new Error('Invalid NSS battle loadout');
  return createNssBattleLoadout(value.combination);
}
