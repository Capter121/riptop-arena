import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InstanceComponent } from '../../src/types/shopItems';
import { enumerateNssCombinations } from '../../src/nss/loadout';
import { loadProgression } from '../../src/app/progression';
import {
  CURRENT_SAVE_SCHEMA_VERSION,
  migrateLegacyAttribute,
  migrateLegacyInstanceComponent,
  migrateProgressionSave,
} from '../../src/app/saveMigration';

const combination = enumerateNssCombinations()[0];

function legacyAffinityLoadout(tip: unknown = 'DIVINE') {
  return {
    schemaVersion: 2,
    interfaceId: 'NSS-V1',
    combination,
    affinities: { core: 'LIGHTNING', blade: 'ROCK', assist: 'DIVINE', gear: 'FIRE', tip },
  };
}

describe('save attribute migration', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps approved legacy names and preserves all seven current affinities', () => {
    expect(migrateLegacyAttribute('ROCK').value).toBe('EARTH');
    expect(migrateLegacyAttribute('LIGHTNING').value).toBe('WIND');
    expect(migrateLegacyAttribute('DIVINE').value).toBe('LIGHT');
    for (const affinity of ['WIND', 'FIRE', 'WATER', 'WOOD', 'EARTH', 'LIGHT', 'DARK']) {
      expect(migrateLegacyAttribute(affinity)).toEqual({ value: affinity, diagnostic: null });
    }
  });

  it('migrates one legacy instance without changing its identity or tier', () => {
    const item: Omit<InstanceComponent, 'attribute'> & { attribute: unknown } = {
      instanceId: 'instance-7',
      baseTemplateId: 'layer_vanguard',
      category: 'LAYER',
      attribute: 'ROCK',
      tier: 'LEGENDARY',
      equippedOnTopId: 'top-2',
    };
    expect(migrateLegacyInstanceComponent(item)).toEqual({
      value: { ...item, attribute: 'EARTH' },
      diagnostic: null,
    });
  });

  it('invalidates only an item with an unknown attribute and returns a diagnostic', () => {
    const item = {
      instanceId: 'broken-1',
      baseTemplateId: 'layer_vanguard',
      category: 'LAYER' as const,
      attribute: 'ICE',
      tier: 'COMMON' as const,
    };
    expect(migrateLegacyInstanceComponent(item)).toEqual({
      value: null,
      diagnostic: 'Unknown element attribute at inventory[broken-1].attribute: ICE',
    });
    expect(migrateLegacyAttribute('toString')).toEqual({
      value: null,
      diagnostic: 'Unknown element attribute at attribute: toString',
    });
  });

  it('migrates an old progression payload once and rejects only an invalid NSS loadout', () => {
    const migrated = migrateProgressionSave({ latestNssLoadout: legacyAffinityLoadout() });
    expect(migrated.migrated).toBe(true);
    expect(migrated.diagnostics).toEqual([]);
    expect(migrated.data).toMatchObject({
      saveSchemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
      latestNssLoadout: {
        affinities: { core: 'WIND', blade: 'EARTH', assist: 'LIGHT', gear: 'FIRE', tip: 'LIGHT' },
      },
    });

    const repeated = migrateProgressionSave(migrated.data);
    expect(repeated).toEqual({ data: migrated.data, migrated: false, diagnostics: [] });

    const invalid = migrateProgressionSave({ latestNssLoadout: legacyAffinityLoadout('ICE') });
    expect(invalid.data.latestNssLoadout).toBeNull();
    expect(invalid.diagnostics).toEqual(['Unknown element attribute at latestNssLoadout.affinities.tip: ICE']);
  });

  it('writes the migrated progression once so later loads do not repeat migration', () => {
    let saved = JSON.stringify({ latestNssLoadout: legacyAffinityLoadout() });
    let writes = 0;
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => saved,
        setItem: (_key: string, value: string) => {
          saved = value;
          writes += 1;
        },
      },
    });

    expect(loadProgression().latestNssLoadout?.affinities.core).toBe('WIND');
    expect(JSON.parse(saved).saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(writes).toBe(1);

    loadProgression();
    expect(writes).toBe(1);
  });
});
