import assert from 'node:assert/strict';
import { CAMPAIGN_CATALOG } from '../server/campaign/campaign-catalog.mjs';
import {
  SurvivalError,
  normalizeSurvivalAbandonRequest,
  normalizeSurvivalLeaderboardQuery,
  normalizeSurvivalLoadout,
  normalizeSurvivalResultRequest,
  normalizeSurvivalRewardRequest,
  normalizeSurvivalStartRequest,
} from '../server/survival/survival-contract.mjs';

const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const seed = '00112233445566778899aabbccddeeff';
const loadout = {
  schemaVersion: 2,
  interfaceId: 'NSS-V1',
  ...CAMPAIGN_CATALOG.opponents[0].loadouts[0],
};
const outcome = {
  simulationVersion: 1,
  seed,
  winner: 'player',
  kind: 'spin finish',
  turnCount: 2,
  tickCount: 120,
  player: { spin: 10, integrity: 900, stamina: 50, spirit: 0, burst: 20, tilt: 0.5, alive: true },
  enemy: { spin: 0, integrity: 0, stamina: 0, spirit: 0, burst: 100, tilt: 2, alive: false },
};
const expected = {
  configVersion: 'survival-v1',
  simulationVersion: 1,
  battleRulesVersion: 2,
  seed,
  wave: 1,
  maximumIntegrity: 1000,
};

assert.deepEqual(normalizeSurvivalStartRequest({ requestId }), { requestId });
assert.deepEqual(normalizeSurvivalAbandonRequest({ requestId }), { requestId });
assert.deepEqual(normalizeSurvivalLoadout(loadout), loadout);
assert.throws(() => normalizeSurvivalLoadout({ ...loadout, schemaVersion: 1 }));
assert.throws(() => normalizeSurvivalLoadout({
  ...loadout,
  affinities: { ...loadout.affinities, blade: 'UNKNOWN' },
}));

const normalizedResult = normalizeSurvivalResultRequest({
  requestId,
  configVersion: 'survival-v1',
  simulationVersion: 1,
  battleRulesVersion: 2,
  wave: 1,
  outcome,
}, expected);
assert.equal(normalizedResult.outcome.player.integrity, 900);
assert.equal(normalizedResult.outcome.player.burst, 20);

for (const invalid of [
  { requestId, configVersion: 'survival-v2', simulationVersion: 1, battleRulesVersion: 2, wave: 1, outcome },
  { requestId, configVersion: 'survival-v1', simulationVersion: 2, battleRulesVersion: 2, wave: 1, outcome },
  { requestId, configVersion: 'survival-v1', simulationVersion: 1, battleRulesVersion: 2, wave: 2, outcome },
  { requestId, configVersion: 'survival-v1', simulationVersion: 1, battleRulesVersion: 2, wave: 1, outcome: { ...outcome, seed: 'f'.repeat(32) } },
  { requestId, configVersion: 'survival-v1', simulationVersion: 1, battleRulesVersion: 2, wave: 1, outcome: { ...outcome, player: { ...outcome.player, integrity: 1001 } } },
  { requestId, configVersion: 'survival-v1', simulationVersion: 1, battleRulesVersion: 2, wave: 1, outcome: { ...outcome, player: { ...outcome.player, burst: Number.NaN } } },
  { requestId, configVersion: 'survival-v1', simulationVersion: 1, battleRulesVersion: 2, wave: 1, outcome, score: 999999 },
  { requestId, configVersion: 'survival-v1', simulationVersion: 1, battleRulesVersion: 2, wave: 1, outcome, persistentDebuffs: ['forged'] },
]) {
  assert.throws(() => normalizeSurvivalResultRequest(invalid, expected));
}

assert.deepEqual(normalizeSurvivalRewardRequest({
  requestId,
  reward: { kind: 'growth', id: 'attack-calibration', level: 1 },
}), { requestId, reward: { kind: 'growth', id: 'attack-calibration', level: 1 } });
assert.deepEqual(normalizeSurvivalRewardRequest({
  requestId,
  reward: { kind: 'instant', id: 'temporary-bulwark' },
}), { requestId, reward: { kind: 'instant', id: 'temporary-bulwark' } });
assert.throws(() => normalizeSurvivalRewardRequest({ requestId, reward: { kind: 'instant', id: 'unknown' } }));
assert.throws(() => normalizeSurvivalRewardRequest({ requestId, reward: { kind: 'risk', id: 'risk-contract', level: 4 } }));

assert.deepEqual(normalizeSurvivalLeaderboardQuery({}), { limit: 20, cursor: null });
assert.deepEqual(normalizeSurvivalLeaderboardQuery({ limit: '50', cursor: 'abc_123-' }), { limit: 50, cursor: 'abc_123-' });
assert.throws(() => normalizeSurvivalLeaderboardQuery({ limit: '51' }));
assert.throws(() => normalizeSurvivalLeaderboardQuery({ cursor: '*'.repeat(10) }));
assert.throws(() => normalizeSurvivalLeaderboardQuery({ limit: '20', extra: 'true' }));

assert.throws(
  () => normalizeSurvivalStartRequest({ requestId: 'not-a-uuid' }),
  error => error instanceof SurvivalError && error.status === 400 && error.code === 'INVALID_SURVIVAL_REQUEST',
);
assert.throws(
  () => normalizeSurvivalResultRequest({
    requestId,
    configVersion: 'survival-v2',
    simulationVersion: 1,
    battleRulesVersion: 2,
    wave: 1,
    outcome,
  }, expected),
  error => error instanceof SurvivalError && error.status === 409 && error.code === 'UNSUPPORTED_SURVIVAL_VERSION',
);

console.log('Survival contract tests passed.');
