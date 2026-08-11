import { readFileSync } from 'node:fs';
import { normalizeBattleOutcome } from '../challenges/challenge-contract.mjs';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AFFINITY_ORDER = ['WIND', 'FIRE', 'WATER', 'WOOD', 'EARTH', 'LIGHT', 'DARK'];
const HARMONY_DISTRIBUTIONS = new Set(['2-2-1', '2-1-1-1', '1-1-1-1-1']);
const battleCatalog = JSON.parse(readFileSync(
  new URL('../../battle-top-designer/shared/nss/battle-parts.json', import.meta.url),
  'utf8',
));
const battlePartById = new Map(battleCatalog.parts.map(part => [part.id, part]));

export class CampaignError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'CampaignError';
    this.status = status;
    this.code = code;
  }
}

function invalid(code, message) {
  throw new CampaignError(400, code, message);
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exact(value, keys, code, label) {
  if (!record(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) {
    invalid(code, `${label} contains invalid keys.`);
  }
}

function uuid(value, label) {
  if (typeof value !== 'string' || !UUID_V4.test(value)) invalid('INVALID_CAMPAIGN_REQUEST', `${label} must be a UUID v4.`);
  return value.toLowerCase();
}

export function normalizeCampaignStartRequest(value) {
  exact(value, ['requestId', 'opponentId'], 'INVALID_CAMPAIGN_REQUEST', 'Campaign start request');
  if (typeof value.opponentId !== 'string' || value.opponentId.length > 40) invalid('INVALID_CAMPAIGN_REQUEST', 'Opponent ID is invalid.');
  return { requestId: uuid(value.requestId, 'Request ID'), opponentId: value.opponentId };
}

export function normalizeCampaignResultRequest(value) {
  exact(value, ['requestId', 'outcome'], 'INVALID_CAMPAIGN_REQUEST', 'Campaign result request');
  let outcome;
  try {
    outcome = normalizeBattleOutcome(value.outcome);
  } catch (error) {
    throw new CampaignError(error.status ?? 400, error.code ?? 'INVALID_BATTLE_OUTCOME', error.message);
  }
  return { requestId: uuid(value.requestId, 'Request ID'), outcome };
}

export function createCampaignNssLoadout(loadout) {
  return {
    schemaVersion: 2,
    interfaceId: 'NSS-V1',
    combination: { ...loadout.combination },
    affinities: { ...loadout.affinities },
  };
}

export function campaignAffinitySummary(affinities) {
  const counts = Object.fromEntries(AFFINITY_ORDER.map(affinity => [affinity, 0]));
  for (const affinity of Object.values(affinities)) counts[affinity] += 1;
  const maximum = Math.max(...Object.values(counts));
  const core = affinities.core;
  const primaryCandidates = AFFINITY_ORDER.filter(affinity => counts[affinity] === maximum);
  const primary = primaryCandidates.includes(core) ? core : primaryCandidates[0];
  const distribution = Object.values(counts).filter(Boolean).sort((left, right) => right - left).join('-');
  return {
    primary,
    resonance: maximum >= 3 ? 'offense' : HARMONY_DISTRIBUTIONS.has(distribution) ? 'harmony' : 'none',
  };
}

export function campaignNssMaxIntegrity(loadout, upgrades) {
  const parts = Object.values(loadout.combination).map((id) => {
    const part = battlePartById.get(id);
    if (!part) invalid('INVALID_CAMPAIGN_LOADOUT', `Unknown NSS battle part: ${id}`);
    return part;
  });
  const defense = parts.reduce((total, part) => total + part.stats.defense, 0) + upgrades.defense;
  const burstResist = parts.reduce((total, part) => total + part.stats.burstResist, 0) + upgrades.defense;
  return 1000 + defense * 60 + burstResist * 50;
}
