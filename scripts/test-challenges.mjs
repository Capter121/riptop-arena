import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDefaultProgressionSnapshot } from '../server/progression/progression-service.mjs';
import {
  ChallengeError,
  createChallengeService,
} from '../server/challenges/challenge-service.mjs';
import { openDatabase } from '../server/storage/database.mjs';
import { migrateDatabase } from '../server/storage/migrate.mjs';

const fixture = JSON.parse(await readFile(
  new URL('../tests/fixtures/challenge-contract-v1.json', import.meta.url),
  'utf8',
));
const CREATOR = '11111111-1111-4111-8111-111111111111';
const FRIEND = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-08-10T00:00:00.000Z');
const SEED = 'ffeeddccbbaa99887766554433221100';

function hasCode(code) {
  return error => error instanceof ChallengeError && error.code === code;
}

function snapshot(overrides = {}) {
  return {
    ...createDefaultProgressionSnapshot(),
    latestNssLoadout: fixture.loadout,
    ...overrides,
  };
}

const database = openDatabase(':memory:');
try {
  await migrateDatabase(database);
  database.prepare('INSERT INTO invites (code, max_uses) VALUES (?, ?)').run('CHALLENGE', 5);
  const insertPlayer = database.prepare(`
    INSERT INTO players (id, display_name, device_token_hash, invite_code)
    VALUES (?, ?, ?, ?)
  `);
  insertPlayer.run(CREATOR, 'Nova', 'a'.repeat(64), 'CHALLENGE');
  insertPlayer.run(FRIEND, 'Rin', 'b'.repeat(64), 'CHALLENGE');
  insertPlayer.run(OTHER, 'Mika', 'c'.repeat(64), 'CHALLENGE');

  const insertProgression = database.prepare(`
    INSERT INTO player_progression (player_id, snapshot_json, coins)
    VALUES (?, ?, 0)
  `);
  insertProgression.run(CREATOR, JSON.stringify(snapshot({
    upgrades: { attack: 2, defense: 1, stamina: 3 },
    partUpgrades: { round: 2, slash: 1 },
  })));
  insertProgression.run(FRIEND, JSON.stringify(snapshot()));

  let seedCalls = 0;
  const service = createChallengeService(database, {
    now: () => new Date(NOW),
    createSeed: () => {
      seedCalls += 1;
      return SEED;
    },
  });

  const fairRequest = {
    requestId: '44444444-4444-4444-8444-444444444444',
    mode: 'fair',
    arena: 'classic_grid',
    message: '  Ready  ',
  };
  const fair = service.createOffer(CREATOR, fairRequest);
  assert.equal(fair.status, 'open');
  assert.equal(fair.expiresAt, '2026-08-11T00:00:00.000Z');
  assert.equal(fair.offer.seed, SEED);
  assert.equal(fair.offer.message, 'Ready');
  assert.deepEqual(fair.offer.creator.upgrades, fixture.zeroUpgradeSnapshot);
  assert.equal(seedCalls, 1);

  const repeat = service.createOffer(CREATOR, structuredClone(fairRequest));
  assert.equal(repeat.id, fair.id);
  assert.equal(seedCalls, 1);
  assert.throws(() => service.createOffer(CREATOR, { ...fairRequest, message: 'Changed' }), hasCode('IDEMPOTENCY_MISMATCH'));
  assert.equal(seedCalls, 1);

  const full = service.createOffer(CREATOR, {
    requestId: '55555555-5555-4555-8555-555555555555',
    mode: 'full_power',
    arena: 'neon_magma',
    message: '',
  });
  assert.deepEqual(full.offer.creator.upgrades.upgrades, { attack: 2, defense: 1, stamina: 3 });
  assert.equal(full.offer.creator.upgrades.partUpgrades.round, 2);
  assert.equal(full.offer.creator.upgrades.partUpgrades.slash, 1);

  assert.throws(() => service.createOffer(OTHER, {
    requestId: '66666666-6666-4666-8666-666666666666',
    mode: 'fair',
    arena: 'classic_grid',
    message: '',
  }), hasCode('NSS_LOADOUT_REQUIRED'));
  assert.throws(() => service.createOffer(CREATOR, { ...fairRequest, extra: true }), hasCode('INVALID_CHALLENGE_REQUEST'));
  assert.throws(() => service.createOffer(CREATOR, { ...fairRequest, requestId: '77777777-7777-4777-8777-777777777777', mode: 'unknown' }), hasCode('INVALID_CHALLENGE_REQUEST'));
  assert.throws(() => service.createOffer(CREATOR, { ...fairRequest, requestId: '88888888-8888-4888-8888-888888888888', arena: 'unknown' }), hasCode('INVALID_CHALLENGE_REQUEST'));
  assert.throws(() => service.createOffer(CREATOR, { ...fairRequest, requestId: '99999999-9999-4999-8999-999999999999', message: 'x'.repeat(121) }), hasCode('INVALID_CHALLENGE_REQUEST'));

  const publicView = service.getOffer(fair.id, FRIEND);
  assert.equal(publicView.id, fair.id);
  assert.equal(publicView.status, 'open');
  assert.equal(publicView.actions.canClaim, true);
  assert.equal(publicView.actions.canRevoke, false);
  assert.equal(database.prepare('SELECT status FROM challenge_offers WHERE id = ?').get(fair.id).status, 'open');
  assert.throws(() => service.getOffer(fair.id, undefined), hasCode('AUTH_REQUIRED'));

  const futureService = createChallengeService(database, {
    now: () => new Date('2026-08-11T00:00:00.000Z'),
    createSeed: () => SEED,
  });
  assert.equal(futureService.getOffer(full.id, FRIEND).status, 'expired');
  assert.equal(database.prepare('SELECT status FROM challenge_offers WHERE id = ?').get(full.id).status, 'open');

  database.prepare('UPDATE challenge_offers SET target_player_id = ? WHERE id = ?').run(FRIEND, fair.id);
  assert.equal(service.getOffer(fair.id, CREATOR).actions.canRevoke, true);
  assert.equal(service.getOffer(fair.id, FRIEND).actions.canClaim, true);
  assert.throws(() => service.getOffer(fair.id, OTHER), hasCode('OFFER_FORBIDDEN'));

  const revoked = service.revokeOffer(fair.id, CREATOR);
  assert.equal(revoked.status, 'revoked');
  assert.equal(service.revokeOffer(fair.id, CREATOR).status, 'revoked');
  assert.throws(() => service.revokeOffer(full.id, FRIEND), hasCode('OFFER_FORBIDDEN'));
  database.prepare('UPDATE challenge_offers SET status = ? WHERE id = ?').run('claimed', full.id);
  assert.throws(() => service.revokeOffer(full.id, CREATOR), hasCode('OFFER_ALREADY_CLAIMED'));

  console.log('Challenge offer lifecycle tests passed.');
} finally {
  database.close();
}
