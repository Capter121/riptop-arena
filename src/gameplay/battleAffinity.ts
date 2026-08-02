import {
  AFFINITIES,
  resolveAffinityProfile,
  type AffinityProfile,
  type PartAffinity,
} from '../../battle-top-designer/shared/nss/affinity';
import { migrateNssBattleLoadout } from '../nss/loadout';
import type { NssBattleLoadout } from '../nss/types';
import type { ElementAttribute } from '../types/shopItems';

export type BattleAffinityProfile = Readonly<{
  source: 'nss' | 'legacy' | 'neutral';
  primary: PartAffinity | null;
  resonance: AffinityProfile['resonance'];
  modifiers: AffinityProfile['modifiers'];
}>;

const NO_RESONANCE = Object.freeze({ kind: 'none' as const });
const IDENTITY_MODIFIERS = Object.freeze({
  elementalPower: 1,
  defenseMultiplier: 1,
  spinDrainMultiplier: 1,
  tiltGrowthMultiplier: 1,
});

export const NEUTRAL_BATTLE_AFFINITY: BattleAffinityProfile = Object.freeze({
  source: 'neutral',
  primary: null,
  resonance: NO_RESONANCE,
  modifiers: IDENTITY_MODIFIERS,
});

const LEGACY_AFFINITY_MAP: Readonly<Record<ElementAttribute | PartAffinity, PartAffinity>> = Object.freeze({
  WIND: 'WIND',
  FIRE: 'FIRE',
  WATER: 'WATER',
  WOOD: 'WOOD',
  EARTH: 'EARTH',
  LIGHT: 'LIGHT',
  DARK: 'DARK',
  ROCK: 'EARTH',
  LIGHTNING: 'WIND',
  DIVINE: 'LIGHT',
});

export function resolveNssBattleAffinity(loadout: NssBattleLoadout): BattleAffinityProfile {
  const migrated = migrateNssBattleLoadout(loadout);
  const shared = resolveAffinityProfile(migrated.affinities);
  return Object.freeze({
    source: 'nss',
    primary: shared.primary,
    resonance: shared.resonance,
    modifiers: shared.modifiers,
  });
}

export function resolveLegacyBattleAffinity(
  attributes: Partial<Record<ElementAttribute | PartAffinity, number>>,
): BattleAffinityProfile {
  const counts = Object.fromEntries(AFFINITIES.map(affinity => [affinity, 0])) as Record<PartAffinity, number>;

  for (const [attribute, count] of Object.entries(attributes)) {
    const affinity = LEGACY_AFFINITY_MAP[attribute as ElementAttribute | PartAffinity];
    if (affinity && typeof count === 'number' && Number.isFinite(count) && count > 0) {
      counts[affinity] += count;
    }
  }

  const maximum = Math.max(...Object.values(counts));
  if (maximum <= 0) return NEUTRAL_BATTLE_AFFINITY;

  return Object.freeze({
    source: 'legacy',
    primary: AFFINITIES.find(affinity => counts[affinity] === maximum)!,
    resonance: NO_RESONANCE,
    modifiers: IDENTITY_MODIFIERS,
  });
}
