import { normalizeBattleOutcome } from '../challenges/challenge-contract.mjs';
import { normalizeNssLoadout } from '../progression/progression-service.mjs';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEED = /^[0-9a-f]{32}$/;
const CURSOR = /^[A-Za-z0-9_-]+$/;
const GROWTH_IDS = new Set(['attack-calibration', 'coordination', 'affinity-tuning', 'pickup-tuning']);
const INSTANT_IDS = new Set([
  'emergency-repair',
  'burst-vent',
  'temporary-overdrive',
  'temporary-bulwark',
  'temporary-endurance',
]);

export class SurvivalError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'SurvivalError';
    this.status = status;
    this.code = code;
  }
}

function invalid(message) {
  throw new SurvivalError(400, 'INVALID_SURVIVAL_REQUEST', message);
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exact(value, keys, label) {
  if (!record(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) {
    invalid(`${label} contains invalid keys.`);
  }
}

function uuid(value, label) {
  if (typeof value !== 'string' || !UUID_V4.test(value)) invalid(`${label} must be a UUID v4.`);
  return value.toLowerCase();
}

function requestIdOnly(value, label) {
  exact(value, ['requestId'], label);
  return { requestId: uuid(value.requestId, 'Request ID') };
}

export function normalizeSurvivalStartRequest(value) {
  return requestIdOnly(value, 'Survival start request');
}

export function normalizeSurvivalAbandonRequest(value) {
  return requestIdOnly(value, 'Survival abandon request');
}

export function normalizeSurvivalLoadout(value) {
  try {
    const loadout = normalizeNssLoadout(value);
    if (loadout === null) invalid('Survival NSS V2 loadout is required.');
    return loadout;
  } catch (error) {
    if (error instanceof SurvivalError) throw error;
    invalid('Survival NSS V2 loadout is invalid.');
  }
}

function assertExpectedResult(value, expected) {
  if (!record(expected) || expected.configVersion !== 'survival-v1'
    || expected.simulationVersion !== 1 || expected.battleRulesVersion !== 2
    || typeof expected.seed !== 'string' || !SEED.test(expected.seed)
    || !Number.isSafeInteger(expected.wave) || expected.wave < 1
    || !Number.isFinite(expected.maximumIntegrity) || expected.maximumIntegrity <= 0) {
    throw new TypeError('Expected survival envelope is invalid.');
  }
  if (value.configVersion !== expected.configVersion
    || value.simulationVersion !== expected.simulationVersion
    || value.battleRulesVersion !== expected.battleRulesVersion) {
    throw new SurvivalError(409, 'UNSUPPORTED_SURVIVAL_VERSION', 'Survival result version does not match the wave envelope.');
  }
  if (value.wave !== expected.wave) invalid('Survival wave does not match the current envelope.');
}

export function normalizeSurvivalResultRequest(value, expected) {
  exact(value, [
    'requestId', 'configVersion', 'simulationVersion', 'battleRulesVersion',
    'wave', 'outcome',
  ], 'Survival result request');
  assertExpectedResult(value, expected);
  let outcome;
  try {
    outcome = normalizeBattleOutcome(value.outcome);
  } catch (error) {
    throw new SurvivalError(error.status ?? 400, error.code ?? 'INVALID_SURVIVAL_REQUEST', error.message);
  }
  if (outcome.seed !== expected.seed) invalid('Battle outcome seed does not match the wave envelope.');
  if (outcome.player.integrity < 0 || outcome.player.integrity > expected.maximumIntegrity
    || outcome.player.burst < 0) invalid('Inherited survival state is out of range.');
  return {
    requestId: uuid(value.requestId, 'Request ID'),
    configVersion: expected.configVersion,
    simulationVersion: expected.simulationVersion,
    battleRulesVersion: expected.battleRulesVersion,
    wave: expected.wave,
    outcome,
  };
}

function normalizeReward(value) {
  if (!record(value) || typeof value.kind !== 'string') invalid('Survival reward is invalid.');
  if (value.kind === 'growth') {
    exact(value, ['kind', 'id', 'level'], 'Growth reward');
    if (!GROWTH_IDS.has(value.id) || !Number.isSafeInteger(value.level) || value.level < 1 || value.level > 3) {
      invalid('Growth reward is invalid.');
    }
    return { kind: 'growth', id: value.id, level: value.level };
  }
  if (value.kind === 'risk') {
    exact(value, ['kind', 'id', 'level'], 'Risk reward');
    if (value.id !== 'risk-contract' || !Number.isSafeInteger(value.level) || value.level < 1 || value.level > 3) {
      invalid('Risk reward is invalid.');
    }
    return { kind: 'risk', id: 'risk-contract', level: value.level };
  }
  exact(value, ['kind', 'id'], 'Instant reward');
  if (value.kind !== 'instant' || !INSTANT_IDS.has(value.id)) invalid('Instant reward is invalid.');
  return { kind: 'instant', id: value.id };
}

export function normalizeSurvivalRewardRequest(value) {
  exact(value, ['requestId', 'reward'], 'Survival reward request');
  return { requestId: uuid(value.requestId, 'Request ID'), reward: normalizeReward(value.reward) };
}

export function normalizeSurvivalLeaderboardQuery(value) {
  if (!record(value) || Object.keys(value).some(key => key !== 'limit' && key !== 'cursor')) {
    invalid('Survival leaderboard query contains invalid keys.');
  }
  const rawLimit = value.limit ?? '20';
  if (typeof rawLimit !== 'string' || !/^[1-9][0-9]*$/.test(rawLimit)) invalid('Leaderboard limit is invalid.');
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) invalid('Leaderboard limit is out of range.');
  const cursor = value.cursor ?? null;
  if (cursor !== null && (typeof cursor !== 'string' || cursor.length < 1 || cursor.length > 512 || !CURSOR.test(cursor))) {
    invalid('Leaderboard cursor is invalid.');
  }
  return { limit, cursor };
}
