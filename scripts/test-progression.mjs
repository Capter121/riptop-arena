import assert from 'node:assert/strict';
import {
  ProgressionError,
  createDefaultProgressionSnapshot,
  mergeProgressionSnapshots,
  validateProgressionSyncInput,
} from '../server/progression/progression-service.mjs';

const VALID_EVENT_ID = '11111111-1111-4111-8111-111111111111';

function validSnapshot(overrides = {}) {
  return {
    saveSchemaVersion: 2,
    unlockedParts: ['round', 'balanced', 'grip'],
    ladderIndex: 0,
    bestLadder: 0,
    championshipCount: 0,
    build: { attackRing: 'round', core: 'balanced', driver: 'grip' },
    upgrades: { attack: 0, defense: 0, stamina: 0 },
    partUpgrades: {},
    latestNssLoadout: null,
    ...overrides,
  };
}

function validInput(overrides = {}) {
  return {
    schemaVersion: 1,
    snapshot: validSnapshot(),
    initialCoins: 100,
    walletEvents: [],
    ...overrides,
  };
}

function hasCode(code) {
  return error => error instanceof ProgressionError && error.code === code;
}

const normalized = validateProgressionSyncInput(validInput({
  snapshot: validSnapshot({ unlockedParts: ['slash', 'round', 'slash', 'balanced', 'grip'] }),
}));
assert.deepEqual(normalized.snapshot.unlockedParts, ['balanced', 'grip', 'round', 'slash']);
assert.deepEqual(Object.keys(normalized.snapshot.partUpgrades), [
  'balanced', 'bulwark', 'drift', 'grip', 'heavy', 'light', 'round', 'rush', 'slash',
]);
assert.throws(() => validateProgressionSyncInput({ ...validInput(), extra: true }), hasCode('INVALID_PROGRESSION'));
assert.throws(() => validateProgressionSyncInput(validInput({
  snapshot: validSnapshot({ build: { attackRing: 'grip', core: 'balanced', driver: 'round' } }),
})), hasCode('INVALID_PROGRESSION'));
assert.throws(() => validateProgressionSyncInput(validInput({
  snapshot: validSnapshot({ upgrades: { attack: 6, defense: 0, stamina: 0 } }),
})), hasCode('INVALID_PROGRESSION'));
assert.throws(() => validateProgressionSyncInput(validInput({
  snapshot: validSnapshot({ partUpgrades: { round: 5 } }),
})), hasCode('INVALID_PROGRESSION'));

const nssLoadout = {
  schemaVersion: 2,
  interfaceId: 'NSS-V1',
  combination: {
    core: 'core_solar_wolf',
    blade: 'blade_storm_fang',
    assist: 'assist_air',
    gear: 'gear_medium',
    tip: 'tip_ball_defense',
  },
  affinities: {
    core: 'LIGHT',
    blade: 'WIND',
    assist: 'FIRE',
    gear: 'WATER',
    tip: 'EARTH',
  },
};
assert.deepEqual(validateProgressionSyncInput(validInput({
  snapshot: validSnapshot({ latestNssLoadout: nssLoadout }),
})).snapshot.latestNssLoadout, nssLoadout);
assert.throws(() => validateProgressionSyncInput(validInput({
  snapshot: validSnapshot({
    latestNssLoadout: {
      ...nssLoadout,
      combination: { ...nssLoadout.combination, blade: 'core_solar_wolf' },
    },
  }),
})), hasCode('INVALID_PROGRESSION'));
assert.throws(() => validateProgressionSyncInput(validInput({
  snapshot: validSnapshot({
    latestNssLoadout: {
      ...nssLoadout,
      affinities: { ...nssLoadout.affinities, tip: 'ICE' },
    },
  }),
})), hasCode('INVALID_PROGRESSION'));

const serverSnapshot = validSnapshot({
  unlockedParts: ['round', 'balanced', 'grip', 'slash'],
  ladderIndex: 2,
  bestLadder: 2,
  championshipCount: 3,
  build: { attackRing: 'slash', core: 'light', driver: 'rush' },
  upgrades: { attack: 2, defense: 1, stamina: 0 },
  partUpgrades: { round: 2, slash: 1 },
  latestNssLoadout: nssLoadout,
});
const localSnapshot = validSnapshot({
  unlockedParts: ['round', 'balanced', 'grip', 'bulwark'],
  ladderIndex: 0,
  bestLadder: 1,
  championshipCount: 2,
  build: { attackRing: 'bulwark', core: 'heavy', driver: 'drift' },
  upgrades: { attack: 1, defense: 3, stamina: 1 },
  partUpgrades: { round: 1, bulwark: 4 },
  latestNssLoadout: null,
});
const merged = mergeProgressionSnapshots(serverSnapshot, localSnapshot);
assert.deepEqual(merged.unlockedParts, ['balanced', 'bulwark', 'grip', 'round', 'slash']);
assert.equal(merged.ladderIndex, 0);
assert.equal(merged.bestLadder, 2);
assert.equal(merged.championshipCount, 3);
assert.deepEqual(merged.build, localSnapshot.build);
assert.deepEqual(merged.upgrades, { attack: 2, defense: 3, stamina: 1 });
assert.equal(merged.partUpgrades.round, 2);
assert.equal(merged.partUpgrades.bulwark, 4);
assert.equal(merged.latestNssLoadout, null);

const validEvent = {
  eventId: VALID_EVENT_ID,
  kind: 'credit',
  delta: 50,
  source: 'local_progression',
  createdAt: '2026-08-09T09:00:00.000Z',
};
assert.deepEqual(validateProgressionSyncInput(validInput({ walletEvents: [validEvent] })).walletEvents, [validEvent]);
assert.throws(() => validateProgressionSyncInput(validInput({
  walletEvents: [validEvent, { ...validEvent }],
})), hasCode('DUPLICATE_EVENT_ID'));
assert.throws(() => validateProgressionSyncInput(validInput({
  walletEvents: [{ ...validEvent, eventId: 'not-a-uuid' }],
})), hasCode('INVALID_PROGRESSION'));
assert.throws(() => validateProgressionSyncInput(validInput({
  walletEvents: [{ ...validEvent, delta: 0 }],
})), hasCode('INVALID_PROGRESSION'));
assert.throws(() => validateProgressionSyncInput(validInput({
  walletEvents: [{ ...validEvent, kind: 'debit' }],
})), hasCode('INVALID_PROGRESSION'));
assert.throws(() => validateProgressionSyncInput(validInput({
  walletEvents: [{ ...validEvent, delta: 10_001 }],
})), hasCode('INVALID_PROGRESSION'));
assert.throws(() => validateProgressionSyncInput(validInput({
  walletEvents: [{ ...validEvent, createdAt: 'yesterday' }],
})), hasCode('INVALID_PROGRESSION'));
assert.throws(() => validateProgressionSyncInput(validInput({
  walletEvents: Array.from({ length: 401 }, (_, index) => ({
    ...validEvent,
    eventId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  })),
})), hasCode('TOO_MANY_WALLET_EVENTS'));

assert.deepEqual(createDefaultProgressionSnapshot(), validSnapshot({
  unlockedParts: ['balanced', 'grip', 'round'],
  partUpgrades: {
    balanced: 0,
    bulwark: 0,
    drift: 0,
    grip: 0,
    heavy: 0,
    light: 0,
    round: 0,
    rush: 0,
    slash: 0,
  },
}));

console.log('Progression validation and merge tests passed.');
