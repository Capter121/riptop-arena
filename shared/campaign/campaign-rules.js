const FINISH_BONUS = Object.freeze({
  'ring out': 35,
  'spin finish': 25,
  'burst finish': 50,
  timeout: 20,
});

const FINISH_RANK = Object.freeze({
  timeout: 0,
  'spin finish': 1,
  'ring out': 2,
  'burst finish': 3,
});

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer.`);
  return value;
}

export function selectCampaignRotation(attemptOrdinal, loadoutCount, arenaCount) {
  nonNegativeInteger(attemptOrdinal, 'Attempt ordinal');
  if (!Number.isSafeInteger(loadoutCount) || loadoutCount < 1) throw new Error('Loadout count must be positive.');
  if (!Number.isSafeInteger(arenaCount) || arenaCount < 1) throw new Error('Arena count must be positive.');
  return {
    loadoutIndex: attemptOrdinal % loadoutCount,
    arenaIndex: attemptOrdinal % arenaCount,
  };
}

function objectiveComplete(objective, profile, outcome, maximumIntegrity) {
  switch (objective.kind) {
    case 'primary_affinity': return profile.primary === objective.affinity;
    case 'harmony': return profile.resonance === 'harmony';
    case 'turn_limit': return outcome.turnCount <= objective.maximum;
    case 'integrity_ratio': return Number.isFinite(maximumIntegrity)
      && maximumIntegrity > 0
      && outcome.player.integrity / maximumIntegrity >= objective.minimum;
    case 'finish': return outcome.kind === `${objective.finish} finish`
      || (objective.finish === 'ringout' && outcome.kind === 'ring out')
      || (objective.finish === 'timeout' && outcome.kind === 'timeout');
    case 'tilt_limit': return outcome.player.tilt <= objective.maximum;
    default: throw new Error('Unknown campaign objective.');
  }
}

export function evaluateCampaignStars(opponent, profile, outcome, maximumIntegrity = 0) {
  if (outcome.winner !== 'player') return 0;
  let mask = 1;
  if (objectiveComplete(opponent.objectives.strategy, profile, outcome, maximumIntegrity)) mask |= 2;
  if (objectiveComplete(opponent.objectives.performance, profile, outcome, maximumIntegrity)) mask |= 4;
  return mask;
}

export function mergeCampaignStars(existingMask, earnedMask) {
  if (![existingMask, earnedMask].every(value => Number.isInteger(value) && value >= 0 && value <= 7)) {
    throw new Error('Campaign star mask must be within 0..7.');
  }
  return existingMask | earnedMask;
}

export function nextCampaignOpponentIndex(defeated) {
  if (!Array.isArray(defeated) || defeated.length > 8 || defeated.some(value => typeof value !== 'boolean')) {
    throw new Error('Campaign defeated state is invalid.');
  }
  const next = defeated.findIndex(value => !value);
  return next === -1 ? Math.max(0, Math.min(7, defeated.length)) : next;
}

export function campaignWinCoins(opponentIndex, finishKind) {
  if (!Number.isSafeInteger(opponentIndex) || opponentIndex < 0 || opponentIndex > 7) throw new Error('Campaign opponent index is invalid.');
  const finishBonus = FINISH_BONUS[finishKind];
  if (finishBonus === undefined) throw new Error('Campaign finish kind is invalid.');
  return 120 + opponentIndex * 35 + finishBonus + (opponentIndex === 7 ? 180 : 0);
}

export function compareCampaignOutcomes(candidate, incumbent) {
  const candidateWon = candidate?.winner === 'player';
  const incumbentWon = incumbent?.winner === 'player';
  if (candidateWon !== incumbentWon) return candidateWon ? 1 : -1;
  if (!candidateWon) return 0;
  const comparisons = [
    incumbent.turnCount - candidate.turnCount,
    candidate.player.integrity - incumbent.player.integrity,
    incumbent.tickCount - candidate.tickCount,
    (FINISH_RANK[candidate.kind] ?? -1) - (FINISH_RANK[incumbent.kind] ?? -1),
  ];
  return Math.sign(comparisons.find(value => value !== 0) ?? 0);
}

function hashWord(value, seed) {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
    hash ^= hash >>> 13;
  }
  return hash >>> 0;
}

export function campaignEventUuid(logicalKey) {
  if (typeof logicalKey !== 'string' || !/^campaign:[a-z0-9:-]+$/.test(logicalKey)) throw new Error('Campaign event key is invalid.');
  const bytes = new Uint8Array(16);
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  for (let word = 0; word < 4; word += 1) {
    const hash = hashWord(`nss-arena:${word}:${logicalKey}`, seeds[word]);
    bytes[word * 4] = hash >>> 24;
    bytes[word * 4 + 1] = hash >>> 16;
    bytes[word * 4 + 2] = hash >>> 8;
    bytes[word * 4 + 3] = hash;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
