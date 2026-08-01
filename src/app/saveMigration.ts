import { isPartAffinity, type PartAffinity } from '../../battle-top-designer/shared/nss/affinity';
import {
  createNssBattleLoadout,
  isNssBattleLoadout,
  isNssCombination,
  migrateNssBattleLoadout,
} from '../nss/loadout';
import { NSS_FAMILIES, type NssAffinitySelection, type NssBattleLoadoutV2 } from '../nss/types';
import type { InstanceComponent } from '../types/shopItems';

export const CURRENT_SAVE_SCHEMA_VERSION = 2 as const;

export type SaveMigrationResult<T> = {
  value: T | null;
  diagnostic: string | null;
};

export type MigratedInstanceComponent = Omit<InstanceComponent, 'attribute'> & {
  attribute: PartAffinity;
};

const legacyAffinityMap = new Map<string, PartAffinity>([
  ['ROCK', 'EARTH'],
  ['LIGHTNING', 'WIND'],
  ['DIVINE', 'LIGHT'],
]);

export function migrateLegacyAttribute(value: unknown, path = 'attribute'): SaveMigrationResult<PartAffinity> {
  if (isPartAffinity(value)) return { value, diagnostic: null };
  const migrated = typeof value === 'string' ? legacyAffinityMap.get(value) : undefined;
  if (migrated) {
    return { value: migrated, diagnostic: null };
  }
  return { value: null, diagnostic: `Unknown element attribute at ${path}: ${String(value)}` };
}

export function migrateLegacyInstanceComponent(
  item: Omit<InstanceComponent, 'attribute'> & { attribute: unknown },
): SaveMigrationResult<MigratedInstanceComponent> {
  const migrated = migrateLegacyAttribute(item.attribute, `inventory[${item.instanceId}].attribute`);
  return migrated.value
    ? { value: { ...item, attribute: migrated.value }, diagnostic: null }
    : { value: null, diagnostic: migrated.diagnostic };
}

function migrateStoredNssLoadout(value: unknown): SaveMigrationResult<NssBattleLoadoutV2> {
  if (isNssBattleLoadout(value)) return { value: migrateNssBattleLoadout(value), diagnostic: null };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { value: null, diagnostic: 'Invalid NSS loadout at latestNssLoadout' };
  }

  const record = value as Record<string, unknown>;
  const affinityValue = record.affinities;
  if (record.schemaVersion !== 2
    || record.interfaceId !== 'NSS-V1'
    || !isNssCombination(record.combination)
    || !affinityValue
    || typeof affinityValue !== 'object'
    || Array.isArray(affinityValue)) {
    return { value: null, diagnostic: 'Invalid NSS loadout at latestNssLoadout' };
  }

  const affinityRecord = affinityValue as Record<string, unknown>;
  if (Object.keys(affinityRecord).sort().join(',') !== [...NSS_FAMILIES].sort().join(',')) {
    return { value: null, diagnostic: 'Invalid NSS loadout at latestNssLoadout' };
  }

  const affinities = {} as NssAffinitySelection;
  for (const family of NSS_FAMILIES) {
    const migrated = migrateLegacyAttribute(
      affinityRecord[family],
      `latestNssLoadout.affinities.${family}`,
    );
    if (!migrated.value) return { value: null, diagnostic: migrated.diagnostic };
    affinities[family] = migrated.value;
  }
  return { value: createNssBattleLoadout(record.combination, affinities), diagnostic: null };
}

export function migrateProgressionSave(value: unknown): {
  data: Record<string, unknown>;
  migrated: boolean;
  diagnostics: string[];
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      data: { saveSchemaVersion: CURRENT_SAVE_SCHEMA_VERSION },
      migrated: true,
      diagnostics: ['Invalid progression save root'],
    };
  }

  const record = value as Record<string, unknown>;
  if (record.saveSchemaVersion === CURRENT_SAVE_SCHEMA_VERSION) {
    return { data: record, migrated: false, diagnostics: [] };
  }

  const data: Record<string, unknown> = { ...record, saveSchemaVersion: CURRENT_SAVE_SCHEMA_VERSION };
  const diagnostics: string[] = [];
  if (record.latestNssLoadout !== undefined && record.latestNssLoadout !== null) {
    const migratedLoadout = migrateStoredNssLoadout(record.latestNssLoadout);
    data.latestNssLoadout = migratedLoadout.value;
    if (migratedLoadout.diagnostic) diagnostics.push(migratedLoadout.diagnostic);
  }

  return { data, migrated: true, diagnostics };
}
