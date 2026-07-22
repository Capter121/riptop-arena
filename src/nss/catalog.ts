import catalogJson from '../../battle-top-designer/shared/nss/parts.catalog.json';
import { NSS_FAMILIES, type NssFamily, type NssPartRecord } from './types';

export const nssParts = catalogJson.parts as NssPartRecord[];
export const nssPartById = new Map(nssParts.map(part => [part.id, part]));
export const nssFamilyParts = Object.fromEntries(
  NSS_FAMILIES.map(family => [family, nssParts.filter(part => part.family === family)]),
) as Record<NssFamily, NssPartRecord[]>;

export function assertNssCatalog(): void {
  const expectedCounts: Record<NssFamily, number> = { core: 2, blade: 4, assist: 3, gear: 3, tip: 4 };
  if (catalogJson.schemaVersion !== 1 || nssParts.length !== 16 || nssPartById.size !== 16) {
    throw new Error('Invalid NSS part catalog');
  }
  for (const family of NSS_FAMILIES) {
    if (nssFamilyParts[family].length !== expectedCounts[family]) throw new Error(`Invalid NSS ${family} count`);
  }
  for (const part of nssParts) {
    if (part.interfaceId !== 'NSS-V1' || !NSS_FAMILIES.includes(part.family)) {
      throw new Error(`Invalid NSS part: ${part.id}`);
    }
  }
}

assertNssCatalog();
