import catalogJson from '../../../shared/campaign/campaign-v1.json';
import { AFFINITIES, type AffinityLayers, type PartAffinity } from '../../../battle-top-designer/shared/nss/affinity';
import { nssPartById } from '../../nss/catalog';
import type { NssCombination } from '../../nss/types';

export const CAMPAIGN_ARENAS = ['classic_grid', 'neon_magma', 'absolute_zero'] as const;
export type CampaignArena = (typeof CAMPAIGN_ARENAS)[number];
export const CAMPAIGN_AI_PROFILES = ['assault', 'skirmisher', 'control', 'sustain', 'ringout', 'counter', 'mixup', 'fortress'] as const;
export type CampaignAiProfileId = (typeof CAMPAIGN_AI_PROFILES)[number];

export type CampaignObjective =
  | { kind: 'primary_affinity'; affinity: PartAffinity }
  | { kind: 'harmony' }
  | { kind: 'turn_limit'; maximum: number }
  | { kind: 'integrity_ratio'; minimum: number }
  | { kind: 'finish'; finish: 'ringout' | 'spin' | 'burst' | 'timeout' }
  | { kind: 'tilt_limit'; maximum: number };

export type CampaignLoadout = Readonly<{
  combination: NssCombination;
  affinities: AffinityLayers;
}>;

export type CampaignOpponent = Readonly<{
  index: number;
  id: string;
  name: string;
  theme: string;
  description: string;
  tutorial: string;
  coreAffinity: 'LIGHT' | 'DARK';
  upgrades: Readonly<{ attack: number; defense: number; stamina: number }>;
  aiProfileId: CampaignAiProfileId;
  arenas: readonly CampaignArena[];
  objectives: Readonly<{ strategy: CampaignObjective; performance: CampaignObjective }>;
  rewards: Readonly<{ firstWinCoins: number; starCoins: number; unlockPartId: string | null; championshipCrowns: number }>;
  loadouts: readonly CampaignLoadout[];
}>;

type CampaignCatalog = Readonly<{
  schemaVersion: 1;
  configVersion: 'campaign-v1';
  aiProfiles: Readonly<Record<CampaignAiProfileId, Readonly<Record<string, number>>>>;
  opponents: readonly CampaignOpponent[];
}>;

const FAMILIES = ['core', 'blade', 'assist', 'gear', 'tip'] as const;

export function assertCampaignCatalog(value: unknown = catalogJson): asserts value is CampaignCatalog {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid campaign catalog');
  const catalog = value as Record<string, unknown>;
  if (catalog.schemaVersion !== 1 || catalog.configVersion !== 'campaign-v1') throw new Error('Invalid campaign version');
  if (!catalog.aiProfiles || typeof catalog.aiProfiles !== 'object' || Array.isArray(catalog.aiProfiles)) throw new Error('Invalid campaign AI profiles');
  const profiles = catalog.aiProfiles as Record<string, unknown>;
  if (Object.keys(profiles).sort().join(',') !== [...CAMPAIGN_AI_PROFILES].sort().join(',')) throw new Error('Invalid campaign AI profile IDs');
  for (const profileId of CAMPAIGN_AI_PROFILES) {
    const weights = profiles[profileId];
    if (!weights || typeof weights !== 'object' || Array.isArray(weights)
      || Object.values(weights).some(weight => !Number.isInteger(weight) || Number(weight) < 0)) {
      throw new Error(`Invalid campaign AI profile: ${profileId}`);
    }
  }
  if (!Array.isArray(catalog.opponents) || catalog.opponents.length !== 8) throw new Error('Invalid campaign opponent count');
  const ids = new Set<string>();
  let loadoutCount = 0;
  for (const [index, raw] of catalog.opponents.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid campaign opponent');
    const opponent = raw as Record<string, any>;
    if (opponent.index !== index || typeof opponent.id !== 'string' || !opponent.id || ids.has(opponent.id)) throw new Error('Invalid campaign opponent identity');
    ids.add(opponent.id);
    if (typeof opponent.name !== 'string' || typeof opponent.theme !== 'string' || typeof opponent.description !== 'string' || typeof opponent.tutorial !== 'string') throw new Error(`Invalid campaign copy: ${opponent.id}`);
    if (!CAMPAIGN_AI_PROFILES.includes(opponent.aiProfileId) || !['LIGHT', 'DARK'].includes(opponent.coreAffinity)) throw new Error(`Invalid campaign profile: ${opponent.id}`);
    if (!Array.isArray(opponent.arenas) || opponent.arenas.length === 0 || opponent.arenas.some((arena: unknown) => !CAMPAIGN_ARENAS.includes(arena as CampaignArena))) throw new Error(`Invalid campaign arena: ${opponent.id}`);
    if (!opponent.upgrades || ['attack', 'defense', 'stamina'].some(key => !Number.isInteger(opponent.upgrades[key]) || opponent.upgrades[key] < 0 || opponent.upgrades[key] > 5)) throw new Error(`Invalid campaign upgrades: ${opponent.id}`);
    if (!Array.isArray(opponent.loadouts) || opponent.loadouts.length !== (index === 7 ? 3 : 2)) throw new Error(`Invalid campaign loadout count: ${opponent.id}`);
    for (const loadout of opponent.loadouts) {
      loadoutCount += 1;
      if (!loadout?.combination || !loadout?.affinities) throw new Error(`Invalid campaign loadout: ${opponent.id}`);
      if (Object.keys(loadout.combination).sort().join(',') !== [...FAMILIES].sort().join(',')
        || Object.keys(loadout.affinities).sort().join(',') !== [...FAMILIES].sort().join(',')) throw new Error(`Invalid campaign layers: ${opponent.id}`);
      for (const family of FAMILIES) {
        if (nssPartById.get(loadout.combination[family])?.family !== family) throw new Error(`Invalid campaign part: ${opponent.id}`);
        if (!AFFINITIES.includes(loadout.affinities[family])) throw new Error(`Invalid campaign affinity: ${opponent.id}`);
      }
      if (!['LIGHT', 'DARK'].includes(loadout.affinities.core)) throw new Error(`Invalid campaign core affinity: ${opponent.id}`);
    }
  }
  if (loadoutCount !== 17) throw new Error('Invalid campaign loadout total');
}

assertCampaignCatalog(catalogJson);

const catalog = catalogJson as CampaignCatalog;
export const CAMPAIGN_CONFIG_VERSION = catalog.configVersion;
export const CAMPAIGN_AI_PROFILE_WEIGHTS = catalog.aiProfiles;
export const CAMPAIGN_OPPONENTS = catalog.opponents;
export const CAMPAIGN_OPPONENT_BY_ID = new Map(CAMPAIGN_OPPONENTS.map(opponent => [opponent.id, opponent]));
