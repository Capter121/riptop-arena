import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ChallengeError,
  CHALLENGE_CONTRACT,
  normalizeBattleInputLog,
  normalizeBattleOutcome,
  normalizeChallengeInput,
  normalizeChallengeOffer,
  normalizeChallengeResult,
  normalizeCreateOfferRequest,
} from '../server/challenges/challenge-contract.mjs';

const fixture = JSON.parse(await readFile(
  new URL('../tests/fixtures/challenge-contract-v1.json', import.meta.url),
  'utf8',
));
const schema = JSON.parse(await readFile(
  new URL('../battle-top-designer/shared/nss/challenge.schema.json', import.meta.url),
  'utf8',
));

const creatorId = '22222222-2222-4222-8222-222222222222';
const playerId = '33333333-3333-4333-8333-333333333333';
const offerId = '44444444-4444-4444-8444-444444444444';
const fullUpgradeSnapshot = {
  upgrades: { attack: 2, defense: 1, stamina: 3 },
  partUpgrades: { ...fixture.zeroUpgradeSnapshot.partUpgrades, round: 2 },
};

function participant(id, displayName, upgrades = fixture.zeroUpgradeSnapshot) {
  return { playerId: id, displayName, loadout: fixture.loadout, upgrades };
}

function offer(overrides = {}) {
  return {
    ...CHALLENGE_CONTRACT,
    seed: fixture.inputLog.seed,
    mode: 'fair',
    creator: participant(creatorId, 'Nova'),
    arena: 'classic_grid',
    aiConfig: 'deterministic-v1',
    message: 'Ready',
    ...overrides,
  };
}

function challengeInput(overrides = {}) {
  return {
    ...CHALLENGE_CONTRACT,
    offerId,
    parentChallengeId: null,
    seed: fixture.inputLog.seed,
    mode: 'fair',
    arena: 'classic_grid',
    aiConfig: 'deterministic-v1',
    player: participant(playerId, 'Rin'),
    enemy: participant(creatorId, 'Nova'),
    ...overrides,
  };
}

function hasCode(code) {
  return error => error instanceof ChallengeError && error.code === code;
}

assert.equal(schema.$id, 'https://nova-spin.local/schemas/challenge-v1.json');
assert.equal(schema.additionalProperties, false);
assert.deepEqual(normalizeCreateOfferRequest(fixture.createRequest), {
  requestId: fixture.createRequest.requestId,
  mode: 'fair',
  arena: 'classic_grid',
  message: 'Ready to spin',
});
assert.deepEqual(normalizeChallengeOffer(offer()), offer());
assert.deepEqual(normalizeChallengeOffer(offer({
  mode: 'full_power',
  creator: participant(creatorId, 'Nova', fullUpgradeSnapshot),
})).creator.upgrades, fullUpgradeSnapshot);
assert.deepEqual(normalizeChallengeInput(challengeInput()), challengeInput());
assert.equal(normalizeChallengeInput(challengeInput()).player.playerId, playerId);
assert.equal(normalizeChallengeInput(challengeInput()).enemy.playerId, creatorId);

assert.deepEqual(normalizeBattleInputLog(fixture.inputLog), fixture.inputLog);
assert.deepEqual(normalizeBattleOutcome(fixture.outcome), fixture.outcome);
const result = normalizeChallengeResult({
  submissionId: '55555555-5555-4555-8555-555555555555',
  inputLog: fixture.inputLog,
  outcome: fixture.outcome,
});
assert.equal(result.outcome.turnCount, result.inputLog.turns.length);
assert.equal(result.outcome.tickCount, result.inputLog.playerVoiceFrames.length);
assert.equal(result.outcome.seed, result.inputLog.seed);
assert.equal(JSON.stringify(result), JSON.stringify(normalizeChallengeResult(structuredClone(result))));

assert.throws(() => normalizeCreateOfferRequest({ ...fixture.createRequest, extra: true }), hasCode('INVALID_CHALLENGE_REQUEST'));
assert.throws(() => normalizeCreateOfferRequest({ ...fixture.createRequest, requestId: 'not-a-uuid' }), hasCode('INVALID_CHALLENGE_REQUEST'));
assert.throws(() => normalizeCreateOfferRequest({ ...fixture.createRequest, arena: 'unknown' }), hasCode('INVALID_CHALLENGE_REQUEST'));
assert.throws(() => normalizeCreateOfferRequest({ ...fixture.createRequest, message: 'x'.repeat(121) }), hasCode('INVALID_CHALLENGE_REQUEST'));
assert.throws(() => normalizeChallengeOffer(offer({ challengeSchemaVersion: 2 })), hasCode('UNSUPPORTED_CHALLENGE_VERSION'));
assert.throws(() => normalizeChallengeOffer(offer({ catalogSha256: '0'.repeat(64) })), hasCode('UNSUPPORTED_CHALLENGE_VERSION'));
assert.throws(() => normalizeChallengeOffer(offer({ seed: 'ABCDEF' })), hasCode('INVALID_CHALLENGE_REQUEST'));
assert.throws(() => normalizeChallengeOffer(offer({ aiConfig: 'adaptive-v2' })), hasCode('INVALID_CHALLENGE_REQUEST'));
assert.throws(() => normalizeChallengeOffer(offer({ creator: { ...participant(creatorId, 'Nova'), extra: true } })), hasCode('INVALID_CHALLENGE_REQUEST'));
assert.throws(() => normalizeChallengeOffer(offer({ creator: { ...participant(creatorId, 'Nova'), loadout: { ...fixture.loadout, extra: true } } })), hasCode('INVALID_CHALLENGE_REQUEST'));
assert.throws(() => normalizeChallengeOffer(offer({ creator: { ...participant(creatorId, 'Nova'), loadout: { ...fixture.loadout, combination: { ...fixture.loadout.combination, blade: 'core_solar_wolf' } } } })), hasCode('INVALID_CHALLENGE_REQUEST'));
assert.throws(() => normalizeChallengeOffer(offer({ creator: { ...participant(creatorId, 'Nova'), loadout: { ...fixture.loadout, affinities: { ...fixture.loadout.affinities, tip: 'ICE' } } } })), hasCode('INVALID_CHALLENGE_REQUEST'));
assert.throws(() => normalizeChallengeOffer(offer({ creator: participant(creatorId, 'Nova', fullUpgradeSnapshot) })), hasCode('INVALID_CHALLENGE_REQUEST'));

assert.throws(() => normalizeBattleInputLog({ ...fixture.inputLog, extra: true }), hasCode('INVALID_BATTLE_INPUT'));
assert.throws(() => normalizeBattleInputLog({ ...fixture.inputLog, simulationVersion: 2 }), hasCode('UNSUPPORTED_CHALLENGE_VERSION'));
assert.throws(() => normalizeBattleInputLog({ ...fixture.inputLog, turns: [{ ...fixture.inputLog.turns[0], playerAction: { kind: 'attack', skillId: 'unknown' } }] }), hasCode('INVALID_BATTLE_INPUT'));
assert.throws(() => normalizeBattleInputLog({ ...fixture.inputLog, turns: [{ ...fixture.inputLog.turns[0], enemyAction: { kind: 'unknown' } }] }), hasCode('INVALID_BATTLE_INPUT'));
assert.throws(() => normalizeBattleInputLog({ ...fixture.inputLog, turns: Array.from({ length: 257 }, (_, index) => ({ ...fixture.inputLog.turns[0], turnIndex: index + 1 })) }), hasCode('INVALID_BATTLE_INPUT'));
assert.throws(() => normalizeBattleInputLog({ ...fixture.inputLog, playerVoiceFrames: Array(360_001).fill(0) }), hasCode('INVALID_BATTLE_INPUT'));
assert.throws(() => normalizeBattleInputLog({ ...fixture.inputLog, playerVoiceFrames: [256] }), hasCode('INVALID_BATTLE_INPUT'));
assert.throws(() => normalizeBattleInputLog({ ...fixture.inputLog, launch: { ...fixture.inputLog.launch, playerPower: Number.POSITIVE_INFINITY } }), hasCode('INVALID_BATTLE_INPUT'));
assert.throws(() => normalizeBattleOutcome({ ...fixture.outcome, player: { ...fixture.outcome.player, spin: Number.NaN } }), hasCode('INVALID_BATTLE_OUTCOME'));
assert.throws(() => normalizeChallengeResult({ submissionId: result.submissionId, inputLog: fixture.inputLog, outcome: { ...fixture.outcome, seed: 'ffeeddccbbaa99887766554433221100' } }), hasCode('BATTLE_RESULT_MISMATCH'));
assert.throws(() => normalizeChallengeResult({ submissionId: result.submissionId, inputLog: fixture.inputLog, outcome: { ...fixture.outcome, turnCount: 2 } }), hasCode('BATTLE_RESULT_MISMATCH'));
assert.throws(() => normalizeChallengeResult({ submissionId: result.submissionId, inputLog: fixture.inputLog, outcome: { ...fixture.outcome, tickCount: 2 } }), hasCode('BATTLE_RESULT_MISMATCH'));

console.log('Challenge contract normalization tests passed.');
