import catalogJson from './generated/parts.catalog.json';

export const families = ['core', 'blade', 'assist', 'gear', 'tip'] as const;
export type Family = (typeof families)[number];
export type Combination = Record<Family, string>;
export type CameraPreset = 'top' | 'perspective' | 'side' | 'bottom';
export type FocusMode = 'assist' | 'gear' | 'tip' | null;

export interface PartRecord {
  id: string;
  displayName: string;
  family: Family;
  partType: string;
  interfaceId: 'NSS-V1';
  heightMm: number;
  specSha256: string;
}

export const catalog = (catalogJson.parts as PartRecord[]);
export const familyParts = Object.fromEntries(
  families.map(family => [family, catalog.filter(part => part.family === family)]),
) as Record<Family, PartRecord[]>;
export const partById = new Map(catalog.map(part => [part.id, part]));

export const stormAttack: Combination = {
  core: 'core_solar_wolf',
  blade: 'blade_storm_fang',
  assist: 'assist_heavy',
  gear: 'gear_low',
  tip: 'tip_flat_attack',
};

export function isCombination(value: unknown): value is Combination {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== [...families].sort().join(',')) return false;
  return families.every(family => {
    const part = typeof record[family] === 'string' ? partById.get(record[family]) : undefined;
    return part?.family === family;
  });
}

export function parseCombinationJson(text: string): Combination {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('The imported file is not valid JSON.'); }
  if (!isCombination(value)) throw new Error('The imported combination has unknown, missing, extra, or mismatched part IDs.');
  return value;
}

export function serializeCombination(combination: Combination): string {
  return `${JSON.stringify(Object.fromEntries(families.map(family => [family, combination[family]])), null, 2)}\n`;
}

export function enumerateCombinations(): Combination[] {
  const result: Combination[] = [];
  for (const core of familyParts.core)
    for (const blade of familyParts.blade)
      for (const assist of familyParts.assist)
        for (const gear of familyParts.gear)
          for (const tip of familyParts.tip)
            result.push({ core: core.id, blade: blade.id, assist: assist.id, gear: gear.id, tip: tip.id });
  return result;
}

export function combinationId(combination: Combination): string {
  const indexes = families.map(family => familyParts[family].findIndex(part => part.id === combination[family]));
  if (indexes.some(index => index < 0)) throw new Error('Illegal combination');
  const [, blades, assists, gears, tips] = families.map(family => familyParts[family].length);
  const rank = ((((indexes[0] * blades + indexes[1]) * assists + indexes[2]) * gears + indexes[3]) * tips + indexes[4]) + 1;
  return `nss-p2c-${String(rank).padStart(4, '0')}`;
}

export function combinationName(combination: Combination): string {
  return families.map(family => partById.get(combination[family])?.displayName ?? combination[family]).join(' · ');
}

export function randomCombination(random = Math.random): Combination {
  return Object.fromEntries(families.map(family => {
    const parts = familyParts[family];
    return [family, parts[Math.min(parts.length - 1, Math.floor(random() * parts.length))].id];
  })) as Combination;
}

export const assembledOffsets: Record<Family, number> = { core: 0, blade: 0, assist: 0, gear: 0, tip: 0 };
export const explodedOffsets: Record<Family, number> = { core: 0.03, blade: 0.014, assist: 0, gear: -0.022, tip: -0.045 };

export function presentationOffsets(exploded: boolean, focus: FocusMode): Record<Family, number> {
  if (focus === 'assist') return { core: 0.018, blade: 0.009, assist: 0.021, gear: -0.01, tip: -0.02 };
  if (focus === 'gear') return { core: 0.012, blade: 0.006, assist: 0, gear: -0.015, tip: -0.03 };
  if (focus === 'tip') return { core: 0.01, blade: 0.005, assist: 0, gear: -0.008, tip: -0.027 };
  return exploded ? explodedOffsets : assembledOffsets;
}
