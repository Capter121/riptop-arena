import assert from 'node:assert/strict';
import {
  ProgressionError,
  createDefaultProgressionSnapshot,
  mergeProgressionSnapshots,
  syncProgression,
  validateProgressionSyncInput,
} from '../server/progression/progression-service.mjs';
import { openDatabase } from '../server/storage/database.mjs';
import { migrateDatabase } from '../server/storage/migrate.mjs';
import { redeemInvite } from '../server/auth/invite-service.mjs';
import { createArenaHttpServer } from '../server/http-server.mjs';

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

const database = openDatabase(':memory:');
let server;
try {
  await migrateDatabase(database);
  database.prepare('INSERT INTO invites (code, max_uses) VALUES (?, ?)').run('PROGRESS', 3);
  const insertPlayer = database.prepare(`
    INSERT INTO players (id, display_name, device_token_hash, invite_code)
    VALUES (?, ?, ?, ?)
  `);
  insertPlayer.run('player-1', 'Nova', 'a'.repeat(64), 'PROGRESS');
  insertPlayer.run('player-2', 'Rin', 'b'.repeat(64), 'PROGRESS');

  const firstRequest = validInput({
    initialCoins: 100,
    snapshot: validSnapshot({
      unlockedParts: ['round', 'balanced', 'grip', 'slash'],
      bestLadder: 1,
      upgrades: { attack: 1, defense: 0, stamina: 0 },
    }),
  });
  const first = syncProgression(database, 'player-1', firstRequest);
  assert.equal(first.progression.coins, 100);
  assert.equal(first.progression.revision, 1);
  assert.deepEqual(first.acknowledgedEventIds, []);

  const firstRow = database.prepare('SELECT * FROM player_progression WHERE player_id = ?').get('player-1');
  assert.equal(firstRow.initial_coins_imported, 1);
  assert.equal(firstRow.coins, 100);
  const firstUpdatedAt = firstRow.updated_at;

  const repeat = syncProgression(database, 'player-1', { ...firstRequest, initialCoins: 999_999 });
  assert.equal(repeat.progression.coins, 100);
  assert.equal(repeat.progression.revision, 1);
  assert.equal(database.prepare('SELECT updated_at FROM player_progression WHERE player_id = ?').get('player-1').updated_at, firstUpdatedAt);

  const credit = {
    eventId: '22222222-2222-4222-8222-222222222222',
    kind: 'credit',
    delta: 50,
    source: 'local_progression',
    createdAt: '2026-08-09T10:00:00.000Z',
  };
  const debit = {
    eventId: '33333333-3333-4333-8333-333333333333',
    kind: 'debit',
    delta: -20,
    source: 'local_progression',
    createdAt: '2026-08-09T10:01:00.000Z',
  };
  const walletRequest = validInput({
    initialCoins: 0,
    snapshot: firstRequest.snapshot,
    walletEvents: [credit, debit],
  });
  const wallet = syncProgression(database, 'player-1', walletRequest);
  assert.equal(wallet.progression.coins, 130);
  assert.equal(wallet.progression.revision, 2);
  assert.deepEqual(wallet.acknowledgedEventIds, [credit.eventId, debit.eventId]);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM wallet_events WHERE player_id = ?').get('player-1').count, 2);

  const walletRepeat = syncProgression(database, 'player-1', walletRequest);
  assert.equal(walletRepeat.progression.coins, 130);
  assert.equal(walletRepeat.progression.revision, 2);
  assert.deepEqual(walletRepeat.acknowledgedEventIds, [credit.eventId, debit.eventId]);

  const netZeroEvents = [
    {
      eventId: '44444444-4444-4444-8444-444444444444',
      kind: 'credit',
      delta: 10,
      source: 'local_progression',
      createdAt: '2026-08-09T10:02:00.000Z',
    },
    {
      eventId: '55555555-5555-4555-8555-555555555555',
      kind: 'debit',
      delta: -10,
      source: 'local_progression',
      createdAt: '2026-08-09T10:03:00.000Z',
    },
  ];
  const netZero = syncProgression(database, 'player-1', validInput({
    initialCoins: 0,
    snapshot: firstRequest.snapshot,
    walletEvents: netZeroEvents,
  }));
  assert.equal(netZero.progression.coins, 130);
  assert.equal(netZero.progression.revision, 3);
  const netZeroRepeat = syncProgression(database, 'player-1', validInput({
    initialCoins: 0,
    snapshot: firstRequest.snapshot,
    walletEvents: netZeroEvents,
  }));
  assert.equal(netZeroRepeat.progression.revision, 3);

  const beforeConflict = database.prepare('SELECT * FROM player_progression WHERE player_id = ?').get('player-1');
  const eventCountBeforeConflict = database.prepare('SELECT COUNT(*) AS count FROM wallet_events WHERE player_id = ?').get('player-1').count;
  let conflict;
  try {
    syncProgression(database, 'player-1', validInput({
      initialCoins: 0,
      snapshot: validSnapshot({ upgrades: { attack: 5, defense: 5, stamina: 5 } }),
      walletEvents: [{
        eventId: '66666666-6666-4666-8666-666666666666',
        kind: 'debit',
        delta: -1_000,
        source: 'local_progression',
        createdAt: '2026-08-09T10:04:00.000Z',
      }],
    }));
  } catch (error) {
    conflict = error;
  }
  assert.ok(conflict instanceof ProgressionError);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.code, 'INSUFFICIENT_COINS');
  assert.equal(conflict.details.rejectedEventId, '66666666-6666-4666-8666-666666666666');
  assert.equal(conflict.details.progression.coins, 130);
  assert.equal(conflict.details.progression.revision, 3);
  assert.deepEqual(database.prepare('SELECT * FROM player_progression WHERE player_id = ?').get('player-1'), beforeConflict);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM wallet_events WHERE player_id = ?').get('player-1').count, eventCountBeforeConflict);

  let firstSyncConflict;
  try {
    syncProgression(database, 'player-2', validInput({
      initialCoins: 10,
      walletEvents: [{
        eventId: '77777777-7777-4777-8777-777777777777',
        kind: 'debit',
        delta: -20,
        source: 'local_progression',
        createdAt: '2026-08-09T10:05:00.000Z',
      }],
    }));
  } catch (error) {
    firstSyncConflict = error;
  }
  assert.ok(firstSyncConflict instanceof ProgressionError);
  assert.equal(firstSyncConflict.status, 409);
  assert.equal(firstSyncConflict.details.progression.coins, 0);
  assert.equal(firstSyncConflict.details.progression.revision, 0);
  assert.deepEqual(firstSyncConflict.details.progression.snapshot, createDefaultProgressionSnapshot());
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM player_progression WHERE player_id = ?').get('player-2').count, 0);

  database.prepare('INSERT INTO invites (code, max_uses) VALUES (?, ?)').run('HTTPPROG', 1);
  const identity = redeemInvite(database, { inviteCode: 'HTTPPROG', displayName: 'Mika' });
  server = createArenaHttpServer({ database });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const httpRequest = validInput({ initialCoins: 40 });
  const unauthorized = await fetch(`${baseUrl}/api/progression/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(httpRequest),
  });
  assert.equal(unauthorized.status, 401);
  assert.equal((await unauthorized.json()).error.code, 'AUTH_REQUIRED');

  const mismatched = await fetch(`${baseUrl}/api/progression/sync`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${identity.deviceToken}`,
      'x-player-id': 'player-1',
    },
    body: JSON.stringify(httpRequest),
  });
  assert.equal(mismatched.status, 401);
  assert.equal((await mismatched.json()).error.code, 'AUTH_INVALID');

  const syncHeaders = {
    'content-type': 'application/json',
    authorization: `Bearer ${identity.deviceToken}`,
    'x-player-id': identity.playerId,
  };
  const success = await fetch(`${baseUrl}/api/progression/sync`, {
    method: 'POST',
    headers: syncHeaders,
    body: JSON.stringify(httpRequest),
  });
  assert.equal(success.status, 200);
  const successBody = await success.json();
  assert.equal(successBody.progression.coins, 40);
  assert.equal(successBody.progression.revision, 1);
  assert.deepEqual(successBody.acknowledgedEventIds, []);

  const duplicateIds = await fetch(`${baseUrl}/api/progression/sync`, {
    method: 'POST',
    headers: syncHeaders,
    body: JSON.stringify(validInput({ walletEvents: [validEvent, validEvent] })),
  });
  assert.equal(duplicateIds.status, 400);
  assert.equal((await duplicateIds.json()).error.code, 'DUPLICATE_EVENT_ID');

  const tooMany = await fetch(`${baseUrl}/api/progression/sync`, {
    method: 'POST',
    headers: syncHeaders,
    body: JSON.stringify(validInput({
      walletEvents: Array.from({ length: 401 }, (_, index) => ({
        ...validEvent,
        eventId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      })),
    })),
  });
  assert.equal(tooMany.status, 400);
  assert.equal((await tooMany.json()).error.code, 'TOO_MANY_WALLET_EVENTS');

  const conflictResponse = await fetch(`${baseUrl}/api/progression/sync`, {
    method: 'POST',
    headers: syncHeaders,
    body: JSON.stringify(validInput({
      initialCoins: 0,
      walletEvents: [{
        eventId: '88888888-8888-4888-8888-888888888888',
        kind: 'debit',
        delta: -100,
        source: 'local_progression',
        createdAt: '2026-08-09T10:06:00.000Z',
      }],
    })),
  });
  assert.equal(conflictResponse.status, 409);
  const conflictBody = await conflictResponse.json();
  assert.equal(conflictBody.error.code, 'INSUFFICIENT_COINS');
  assert.equal(conflictBody.error.rejectedEventId, '88888888-8888-4888-8888-888888888888');
  assert.equal(conflictBody.progression.coins, 40);
  assert.equal(conflictBody.progression.revision, 1);

  console.log('Progression validation, merge, transaction, and HTTP tests passed.');
} finally {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  database.close();
}
