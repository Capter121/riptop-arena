import battleCatalogJson from '../../battle-top-designer/shared/nss/battle-parts.json';
import { nssPartById } from './catalog';
import type { NssBattlePartRecord } from './types';

export const nssBattleParts = battleCatalogJson.parts as NssBattlePartRecord[];
export const nssBattlePartById = new Map(nssBattleParts.map(part => [part.id, part]));

export function assertNssBattleCatalog(): void {
  if (battleCatalogJson.schemaVersion !== 1 || nssBattleParts.length !== 16 || nssBattlePartById.size !== 16) {
    throw new Error('Invalid NSS battle part catalog');
  }

  for (const part of nssBattleParts) {
    const catalogPart = nssPartById.get(part.id);
    if (!catalogPart || catalogPart.family !== part.family) throw new Error(`Invalid NSS battle part: ${part.id}`);
    const values = [...Object.values(part.stats), part.physics.weight];
    if (values.some(value => !Number.isFinite(value) || value < 0) || part.physics.weight === 0) {
      throw new Error(`Invalid NSS battle values: ${part.id}`);
    }
    if (part.family === 'blade' && (!part.physics.collisionRadius || part.physics.collisionRadius <= 0)) {
      throw new Error(`Missing NSS blade collision radius: ${part.id}`);
    }
    if (part.family !== 'blade' && part.physics.collisionRadius !== undefined) {
      throw new Error(`Unexpected NSS collision radius: ${part.id}`);
    }
  }
}

assertNssBattleCatalog();
