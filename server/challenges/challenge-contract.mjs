import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { normalizeNssLoadout } from '../progression/progression-service.mjs';

const sharedRoot = new URL('../../battle-top-designer/shared/nss/', import.meta.url);
const versions = JSON.parse(readFileSync(new URL('versions.json', sharedRoot), 'utf8'));
const battleCatalogText = readFileSync(new URL('battle-parts.json', sharedRoot), 'utf8');

export const CHALLENGE_CONTRACT = Object.freeze({
  challengeSchemaVersion: versions.challengeSchemaVersion,
  catalogVersion: versions.catalogVersion,
  catalogSha256: createHash('sha256').update(battleCatalogText.replace(/\r\n/g, '\n')).digest('hex'),
  affinityRulesVersion: versions.affinityRulesVersion,
  battleRulesVersion: versions.battleRulesVersion,
  simulationVersion: versions.simulationVersion,
});

const VERSION_KEYS = Object.freeze(Object.keys(CHALLENGE_CONTRACT));
const OFFER_KEYS = Object.freeze([...VERSION_KEYS, 'seed', 'mode', 'creator', 'arena', 'aiConfig', 'message']);
const INPUT_KEYS = Object.freeze([
  ...VERSION_KEYS,
  'offerId',
  'parentChallengeId',
  'seed',
  'mode',
  'arena',
  'aiConfig',
  'player',
  'enemy',
]);
const NSS_FAMILIES = Object.freeze(['assist', 'blade', 'core', 'gear', 'tip']);
const UPGRADE_KEYS = Object.freeze(['attack', 'defense', 'stamina']);
const PART_UPGRADE_KEYS = Object.freeze([
  'balanced', 'bulwark', 'drift', 'grip', 'heavy', 'light', 'round', 'rush', 'slash',
]);
const ARENAS = new Set(['classic_grid', 'neon_magma', 'absolute_zero']);
const MODES = new Set(['fair', 'full_power']);
const SKILLS = new Set(['wind_blade', 'aqua_surge', 'lightning_bolt', 'blazing_meteor', 'phantom_clone']);
const SIMPLE_ACTIONS = new Set(['evade', 'defense', 'charge', 'light_reflect', 'heavy_reflect']);
const FINISH_KINDS = new Set(['ring out', 'spin finish', 'burst finish', 'timeout']);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BATTLE_SEED = /^[0-9a-f]{32}$/;
const MAX_TURNS = 256;
const MAX_VOICE_FRAMES = 360_000;
const MAX_DECISION_TICKS = 2_700;

export class ChallengeError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ChallengeError';
    this.status = status;
    this.code = code;
  }
}

function invalid(code, message) {
  throw new ChallengeError(400, code, message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isRecord(value)
    && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

function exact(value, keys, code, label) {
  if (!hasExactKeys(value, keys)) invalid(code, `${label} contains invalid keys.`);
}

function uuid(value, label) {
  if (typeof value !== 'string' || !UUID_V4.test(value)) {
    invalid('INVALID_CHALLENGE_REQUEST', `${label} must be a UUID v4.`);
  }
  return value.toLowerCase();
}

function seed(value) {
  if (typeof value !== 'string' || !BATTLE_SEED.test(value)) {
    invalid('INVALID_CHALLENGE_REQUEST', 'Challenge seed must be 128-bit lowercase hexadecimal.');
  }
  return value;
}

function finite(value, code, label) {
  if (!Number.isFinite(value)) invalid(code, `${label} must be finite.`);
  const rounded = Math.round(value * 1_000) / 1_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function integer(value, minimum, maximum, code, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    invalid(code, `${label} is out of range.`);
  }
  return value;
}

function normalizeVersions(value) {
  for (const key of VERSION_KEYS) {
    if (value[key] !== CHALLENGE_CONTRACT[key]) {
      throw new ChallengeError(409, 'UNSUPPORTED_CHALLENGE_VERSION', `Unsupported ${key}.`);
    }
  }
  return { ...CHALLENGE_CONTRACT };
}

function normalizeMode(value) {
  if (!MODES.has(value)) invalid('INVALID_CHALLENGE_REQUEST', 'Challenge mode is invalid.');
  return value;
}

function normalizeArena(value) {
  if (!ARENAS.has(value)) invalid('INVALID_CHALLENGE_REQUEST', 'Challenge arena is invalid.');
  return value;
}

function normalizeUpgradeSnapshot(value) {
  exact(value, ['upgrades', 'partUpgrades'], 'INVALID_CHALLENGE_REQUEST', 'Upgrade snapshot');
  exact(value.upgrades, UPGRADE_KEYS, 'INVALID_CHALLENGE_REQUEST', 'System upgrades');
  exact(value.partUpgrades, PART_UPGRADE_KEYS, 'INVALID_CHALLENGE_REQUEST', 'Part upgrades');
  return {
    upgrades: Object.fromEntries(UPGRADE_KEYS.map(key => [
      key,
      integer(value.upgrades[key], 0, 5, 'INVALID_CHALLENGE_REQUEST', `Upgrade ${key}`),
    ])),
    partUpgrades: Object.fromEntries(PART_UPGRADE_KEYS.map(key => [
      key,
      integer(value.partUpgrades[key], 0, 4, 'INVALID_CHALLENGE_REQUEST', `Part upgrade ${key}`),
    ])),
  };
}

function normalizeParticipant(value) {
  exact(value, ['playerId', 'displayName', 'loadout', 'upgrades'], 'INVALID_CHALLENGE_REQUEST', 'Participant');
  if (typeof value.displayName !== 'string' || value.displayName.length < 1 || value.displayName.length > 32) {
    invalid('INVALID_CHALLENGE_REQUEST', 'Participant display name is invalid.');
  }
  let loadout;
  try {
    loadout = normalizeNssLoadout(value.loadout);
  } catch {
    invalid('INVALID_CHALLENGE_REQUEST', 'Participant NSS loadout is invalid.');
  }
  if (loadout === null) invalid('INVALID_CHALLENGE_REQUEST', 'Participant NSS loadout is required.');
  return {
    playerId: uuid(value.playerId, 'Player ID'),
    displayName: value.displayName,
    loadout: {
      schemaVersion: loadout.schemaVersion,
      interfaceId: loadout.interfaceId,
      combination: Object.fromEntries(NSS_FAMILIES.map(family => [family, loadout.combination[family]])),
      affinities: Object.fromEntries(NSS_FAMILIES.map(family => [family, loadout.affinities[family]])),
    },
    upgrades: normalizeUpgradeSnapshot(value.upgrades),
  };
}

function assertFairUpgrades(participant) {
  if ([...Object.values(participant.upgrades.upgrades), ...Object.values(participant.upgrades.partUpgrades)]
    .some(value => value !== 0)) {
    invalid('INVALID_CHALLENGE_REQUEST', 'Fair challenge upgrades must be zero.');
  }
}

export function normalizeCreateOfferRequest(value) {
  exact(value, ['requestId', 'mode', 'arena', 'message'], 'INVALID_CHALLENGE_REQUEST', 'Create offer request');
  const message = typeof value.message === 'string' ? value.message.trim() : '';
  if (message.length > 120) invalid('INVALID_CHALLENGE_REQUEST', 'Challenge message is too long.');
  return {
    requestId: uuid(value.requestId, 'Request ID'),
    mode: normalizeMode(value.mode),
    arena: normalizeArena(value.arena),
    message,
  };
}

export function normalizeChallengeOffer(value) {
  exact(value, OFFER_KEYS, 'INVALID_CHALLENGE_REQUEST', 'Challenge offer');
  const mode = normalizeMode(value.mode);
  const creator = normalizeParticipant(value.creator);
  if (mode === 'fair') assertFairUpgrades(creator);
  if (value.aiConfig !== 'deterministic-v1') invalid('INVALID_CHALLENGE_REQUEST', 'Challenge AI config is invalid.');
  const message = typeof value.message === 'string' ? value.message.trim() : '';
  if (message.length > 120) invalid('INVALID_CHALLENGE_REQUEST', 'Challenge message is too long.');
  return {
    ...normalizeVersions(value),
    seed: seed(value.seed),
    mode,
    creator,
    arena: normalizeArena(value.arena),
    aiConfig: 'deterministic-v1',
    message,
  };
}

export function normalizeChallengeInput(value) {
  exact(value, INPUT_KEYS, 'INVALID_CHALLENGE_REQUEST', 'Challenge input');
  const mode = normalizeMode(value.mode);
  const player = normalizeParticipant(value.player);
  const enemy = normalizeParticipant(value.enemy);
  if (mode === 'fair') {
    assertFairUpgrades(player);
    assertFairUpgrades(enemy);
  }
  if (value.aiConfig !== 'deterministic-v1') invalid('INVALID_CHALLENGE_REQUEST', 'Challenge AI config is invalid.');
  return {
    ...normalizeVersions(value),
    offerId: uuid(value.offerId, 'Offer ID'),
    parentChallengeId: value.parentChallengeId === null ? null : uuid(value.parentChallengeId, 'Parent challenge ID'),
    seed: seed(value.seed),
    mode,
    arena: normalizeArena(value.arena),
    aiConfig: 'deterministic-v1',
    player,
    enemy,
  };
}

function normalizeAction(value) {
  if (!isRecord(value) || typeof value.kind !== 'string') invalid('INVALID_BATTLE_INPUT', 'Battle action is invalid.');
  if (value.kind === 'attack') {
    exact(value, ['kind', 'skillId'], 'INVALID_BATTLE_INPUT', 'Attack action');
    if (!SKILLS.has(value.skillId)) invalid('INVALID_BATTLE_INPUT', 'Battle skill is invalid.');
    return { kind: 'attack', skillId: value.skillId };
  }
  exact(value, ['kind'], 'INVALID_BATTLE_INPUT', 'Battle action');
  if (!SIMPLE_ACTIONS.has(value.kind)) invalid('INVALID_BATTLE_INPUT', 'Battle action is invalid.');
  return { kind: value.kind };
}

function normalizeLaunch(value) {
  exact(value, ['playerPower', 'playerAngleDeg', 'enemyPower', 'enemyAngleDeg'], 'INVALID_BATTLE_INPUT', 'Battle launch');
  const playerPower = finite(value.playerPower, 'INVALID_BATTLE_INPUT', 'Player launch power');
  const playerAngleDeg = finite(value.playerAngleDeg, 'INVALID_BATTLE_INPUT', 'Player launch angle');
  const enemyPower = finite(value.enemyPower, 'INVALID_BATTLE_INPUT', 'Enemy launch power');
  const enemyAngleDeg = finite(value.enemyAngleDeg, 'INVALID_BATTLE_INPUT', 'Enemy launch angle');
  if (playerPower < 0 || playerPower > 1 || enemyPower < 0 || enemyPower > 1
    || Math.abs(playerAngleDeg) > 35 || Math.abs(enemyAngleDeg) > 35) {
    invalid('INVALID_BATTLE_INPUT', 'Battle launch is out of range.');
  }
  return { playerPower, playerAngleDeg, enemyPower, enemyAngleDeg };
}

function normalizeTurn(value, expectedIndex) {
  const keys = value?.qteFinal === undefined
    ? ['turnIndex', 'decisionTicks', 'playerAction', 'enemyAction']
    : ['turnIndex', 'decisionTicks', 'playerAction', 'enemyAction', 'qteFinal'];
  exact(value, keys, 'INVALID_BATTLE_INPUT', 'Battle turn');
  const turnIndex = integer(value.turnIndex, 1, MAX_TURNS, 'INVALID_BATTLE_INPUT', 'Turn index');
  if (turnIndex !== expectedIndex) invalid('INVALID_BATTLE_INPUT', 'Battle turn indexes must be sequential.');
  const turn = {
    turnIndex,
    decisionTicks: integer(value.decisionTicks, 0, MAX_DECISION_TICKS, 'INVALID_BATTLE_INPUT', 'Decision ticks'),
    playerAction: normalizeAction(value.playerAction),
    enemyAction: normalizeAction(value.enemyAction),
  };
  if (value.qteFinal !== undefined) {
    exact(value.qteFinal, ['playerScore', 'enemyScore'], 'INVALID_BATTLE_INPUT', 'QTE result');
    turn.qteFinal = {
      playerScore: finite(value.qteFinal.playerScore, 'INVALID_BATTLE_INPUT', 'Player QTE score'),
      enemyScore: finite(value.qteFinal.enemyScore, 'INVALID_BATTLE_INPUT', 'Enemy QTE score'),
    };
  }
  return turn;
}

export function normalizeBattleInputLog(value) {
  exact(value, ['simulationVersion', 'seed', 'launch', 'playerVoiceFrames', 'turns'], 'INVALID_BATTLE_INPUT', 'Battle input log');
  if (value.simulationVersion !== versions.simulationVersion) {
    throw new ChallengeError(409, 'UNSUPPORTED_CHALLENGE_VERSION', 'Unsupported simulationVersion.');
  }
  if (!Array.isArray(value.playerVoiceFrames) || value.playerVoiceFrames.length > MAX_VOICE_FRAMES) {
    invalid('INVALID_BATTLE_INPUT', 'Player voice frame count is invalid.');
  }
  if (!Array.isArray(value.turns) || value.turns.length > MAX_TURNS) {
    invalid('INVALID_BATTLE_INPUT', 'Battle turn count is invalid.');
  }
  return {
    simulationVersion: versions.simulationVersion,
    seed: seed(value.seed),
    launch: normalizeLaunch(value.launch),
    playerVoiceFrames: value.playerVoiceFrames.map(frame => integer(frame, 0, 255, 'INVALID_BATTLE_INPUT', 'Voice frame')),
    turns: value.turns.map((turn, index) => normalizeTurn(turn, index + 1)),
  };
}

function normalizeTopState(value) {
  exact(value, ['spin', 'integrity', 'stamina', 'spirit', 'burst', 'tilt', 'alive'], 'INVALID_BATTLE_OUTCOME', 'Final top state');
  if (typeof value.alive !== 'boolean') invalid('INVALID_BATTLE_OUTCOME', 'Alive state must be boolean.');
  return {
    spin: finite(value.spin, 'INVALID_BATTLE_OUTCOME', 'Spin'),
    integrity: finite(value.integrity, 'INVALID_BATTLE_OUTCOME', 'Integrity'),
    stamina: finite(value.stamina, 'INVALID_BATTLE_OUTCOME', 'Stamina'),
    spirit: finite(value.spirit, 'INVALID_BATTLE_OUTCOME', 'Spirit'),
    burst: finite(value.burst, 'INVALID_BATTLE_OUTCOME', 'Burst'),
    tilt: finite(value.tilt, 'INVALID_BATTLE_OUTCOME', 'Tilt'),
    alive: value.alive,
  };
}

export function normalizeBattleOutcome(value) {
  exact(value, ['simulationVersion', 'seed', 'winner', 'kind', 'turnCount', 'tickCount', 'player', 'enemy'], 'INVALID_BATTLE_OUTCOME', 'Battle outcome');
  if (value.simulationVersion !== versions.simulationVersion) {
    throw new ChallengeError(409, 'UNSUPPORTED_CHALLENGE_VERSION', 'Unsupported simulationVersion.');
  }
  if (value.winner !== 'player' && value.winner !== 'enemy') invalid('INVALID_BATTLE_OUTCOME', 'Battle winner is invalid.');
  if (!FINISH_KINDS.has(value.kind)) invalid('INVALID_BATTLE_OUTCOME', 'Battle finish kind is invalid.');
  return {
    simulationVersion: versions.simulationVersion,
    seed: seed(value.seed),
    winner: value.winner,
    kind: value.kind,
    turnCount: integer(value.turnCount, 0, MAX_TURNS, 'INVALID_BATTLE_OUTCOME', 'Turn count'),
    tickCount: integer(value.tickCount, 0, MAX_VOICE_FRAMES, 'INVALID_BATTLE_OUTCOME', 'Tick count'),
    player: normalizeTopState(value.player),
    enemy: normalizeTopState(value.enemy),
  };
}

export function normalizeChallengeResult(value) {
  exact(value, ['submissionId', 'inputLog', 'outcome'], 'INVALID_CHALLENGE_REQUEST', 'Challenge result');
  const inputLog = normalizeBattleInputLog(value.inputLog);
  const outcome = normalizeBattleOutcome(value.outcome);
  if (inputLog.seed !== outcome.seed
    || inputLog.turns.length !== outcome.turnCount
    || inputLog.playerVoiceFrames.length !== outcome.tickCount) {
    invalid('BATTLE_RESULT_MISMATCH', 'Battle log and outcome do not match.');
  }
  return {
    submissionId: uuid(value.submissionId, 'Submission ID'),
    inputLog,
    outcome,
  };
}
