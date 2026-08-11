import { readFileSync } from 'node:fs';

const catalogUrl = new URL('../../shared/campaign/campaign-v1.json', import.meta.url);
const partCatalogUrl = new URL('../../battle-top-designer/shared/nss/parts.catalog.json', import.meta.url);

export const CAMPAIGN_CATALOG = JSON.parse(readFileSync(catalogUrl, 'utf8'));
const partCatalog = JSON.parse(readFileSync(partCatalogUrl, 'utf8'));

const ARENAS = new Set(['classic_grid', 'neon_magma', 'absolute_zero']);
const AFFINITIES = new Set(['WIND', 'FIRE', 'WATER', 'WOOD', 'EARTH', 'LIGHT', 'DARK']);
const PROFILES = new Set(['assault', 'skirmisher', 'control', 'sustain', 'ringout', 'counter', 'mixup', 'fortress']);
const FAMILIES = ['core', 'blade', 'assist', 'gear', 'tip'];
const partById = new Map(partCatalog.parts.map(part => [part.id, part]));

export function assertCampaignCatalog(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.schemaVersion !== 1 || value.configVersion !== 'campaign-v1') throw new Error('Invalid campaign catalog');
  if (!value.aiProfiles || typeof value.aiProfiles !== 'object' || Array.isArray(value.aiProfiles)
    || Object.keys(value.aiProfiles).sort().join(',') !== [...PROFILES].sort().join(',')) throw new Error('Invalid campaign AI profiles');
  for (const profileId of PROFILES) {
    const weights = value.aiProfiles[profileId];
    if (!weights || typeof weights !== 'object' || Array.isArray(weights)
      || Object.values(weights).some(weight => !Number.isInteger(weight) || weight < 0)) throw new Error(`Invalid campaign AI profile: ${profileId}`);
  }
  if (!Array.isArray(value.opponents) || value.opponents.length !== 8) throw new Error('Invalid campaign opponent count');
  const ids = new Set();
  let loadoutCount = 0;
  for (const [index, opponent] of value.opponents.entries()) {
    if (!opponent || typeof opponent !== 'object' || Array.isArray(opponent)
      || opponent.index !== index || typeof opponent.id !== 'string' || !opponent.id || ids.has(opponent.id)) throw new Error('Invalid campaign opponent identity');
    ids.add(opponent.id);
    if (![opponent.name, opponent.theme, opponent.description, opponent.tutorial].every(text => typeof text === 'string' && text)) throw new Error(`Invalid campaign copy: ${opponent.id}`);
    if (!PROFILES.has(opponent.aiProfileId) || !['LIGHT', 'DARK'].includes(opponent.coreAffinity)) throw new Error(`Invalid campaign profile: ${opponent.id}`);
    if (!Array.isArray(opponent.arenas) || opponent.arenas.length === 0 || opponent.arenas.some(arena => !ARENAS.has(arena))) throw new Error(`Invalid campaign arena: ${opponent.id}`);
    if (!opponent.upgrades || ['attack', 'defense', 'stamina'].some(key => !Number.isInteger(opponent.upgrades[key]) || opponent.upgrades[key] < 0 || opponent.upgrades[key] > 5)) throw new Error(`Invalid campaign upgrades: ${opponent.id}`);
    if (!Array.isArray(opponent.loadouts) || opponent.loadouts.length !== (index === 7 ? 3 : 2)) throw new Error(`Invalid campaign loadout count: ${opponent.id}`);
    for (const loadout of opponent.loadouts) {
      loadoutCount += 1;
      if (!loadout?.combination || !loadout?.affinities
        || Object.keys(loadout.combination).sort().join(',') !== [...FAMILIES].sort().join(',')
        || Object.keys(loadout.affinities).sort().join(',') !== [...FAMILIES].sort().join(',')) throw new Error(`Invalid campaign layers: ${opponent.id}`);
      for (const family of FAMILIES) {
        if (partById.get(loadout.combination[family])?.family !== family) throw new Error(`Invalid campaign part: ${opponent.id}`);
        if (!AFFINITIES.has(loadout.affinities[family])) throw new Error(`Invalid campaign affinity: ${opponent.id}`);
      }
      if (!['LIGHT', 'DARK'].includes(loadout.affinities.core)) throw new Error(`Invalid campaign core affinity: ${opponent.id}`);
    }
  }
  if (loadoutCount !== 17) throw new Error('Invalid campaign loadout total');
}

assertCampaignCatalog(CAMPAIGN_CATALOG);

export const CAMPAIGN_OPPONENT_BY_ID = new Map(CAMPAIGN_CATALOG.opponents.map(opponent => [opponent.id, opponent]));
