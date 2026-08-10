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

  const changedFriendLoadout = {
    ...fixture.loadout,
    affinities: { ...fixture.loadout.affinities, tip: 'DARK' },
  };
  database.prepare(`
    UPDATE player_progression SET snapshot_json = ? WHERE player_id = ?
  `).run(JSON.stringify(snapshot({ latestNssLoadout: changedFriendLoadout })), FRIEND);
  insertProgression.run(OTHER, JSON.stringify(snapshot({
    upgrades: { attack: 4, defense: 3, stamina: 2 },
    partUpgrades: { round: 3 },
  })));

  const claimable = service.createOffer(CREATOR, {
    requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    mode: 'fair',
    arena: 'absolute_zero',
    message: 'Claim me',
  });
  assert.throws(() => service.claimOffer(claimable.id, CREATOR), hasCode('SELF_CLAIM_FORBIDDEN'));
  const claimed = service.claimOffer(claimable.id, FRIEND);
  assert.equal(claimed.status, 'pending');
  assert.equal(claimed.input.player.playerId, FRIEND);
  assert.equal(claimed.input.enemy.playerId, CREATOR);
  assert.deepEqual(claimed.input.player.loadout, changedFriendLoadout);
  assert.deepEqual(claimed.input.player.upgrades, fixture.zeroUpgradeSnapshot);
  assert.deepEqual(claimed.input.enemy.upgrades, fixture.zeroUpgradeSnapshot);
  assert.equal(database.prepare('SELECT claimed_challenge_id FROM challenge_offers WHERE id = ?').get(claimable.id).claimed_challenge_id, claimed.id);
  assert.throws(() => service.claimOffer(claimable.id, OTHER), hasCode('OFFER_ALREADY_CLAIMED'));

  const targeted = service.createOffer(CREATOR, {
    requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    mode: 'fair',
    arena: 'classic_grid',
    message: 'For Rin',
  });
  database.prepare('UPDATE challenge_offers SET target_player_id = ? WHERE id = ?').run(FRIEND, targeted.id);
  assert.throws(() => service.claimOffer(targeted.id, OTHER), hasCode('OFFER_FORBIDDEN'));

  const expires = service.createOffer(CREATOR, {
    requestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    mode: 'fair',
    arena: 'classic_grid',
    message: 'Too late',
  });
  assert.throws(() => futureService.claimOffer(expires.id, OTHER), hasCode('OFFER_EXPIRED'));

  const rollbackOffer = service.createOffer(CREATOR, {
    requestId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    mode: 'fair',
    arena: 'classic_grid',
    message: 'Rollback',
  });
  database.exec(`
    CREATE TRIGGER fail_claim_update
    BEFORE UPDATE OF status ON challenge_offers
    WHEN OLD.id = '${rollbackOffer.id}'
    BEGIN
      SELECT RAISE(ABORT, 'forced claim failure');
    END;
  `);
  const challengeCountBeforeRollback = database.prepare('SELECT COUNT(*) AS count FROM challenges').get().count;
  assert.throws(() => service.claimOffer(rollbackOffer.id, OTHER), /forced claim failure/);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM challenges').get().count, challengeCountBeforeRollback);
  assert.equal(database.prepare('SELECT status FROM challenge_offers WHERE id = ?').get(rollbackOffer.id).status, 'open');
  database.exec('DROP TRIGGER fail_claim_update');
  const rollbackClaimed = service.claimOffer(rollbackOffer.id, OTHER);
  assert.equal(rollbackClaimed.status, 'pending');

  const fullClaimable = service.createOffer(CREATOR, {
    requestId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    mode: 'full_power',
    arena: 'neon_magma',
    message: 'Full power',
  });
  const fullClaimed = service.claimOffer(fullClaimable.id, OTHER);
  assert.deepEqual(fullClaimed.input.enemy.upgrades.upgrades, { attack: 2, defense: 1, stamina: 3 });
  assert.deepEqual(fullClaimed.input.player.upgrades.upgrades, { attack: 4, defense: 3, stamina: 2 });

  assert.equal(service.getChallenge(claimed.id, CREATOR).id, claimed.id);
  assert.equal(service.getChallenge(claimed.id, FRIEND).actions.canBattle, true);
  assert.throws(() => service.getChallenge(claimed.id, OTHER), hasCode('CHALLENGE_FORBIDDEN'));

  const waitingMe = service.listChallenges(FRIEND, { group: 'waiting_me', limit: 20 });
  assert.equal(waitingMe.pendingCount, waitingMe.items.length);
  assert.ok(waitingMe.items.some(item => item.kind === 'offer' && item.id === targeted.id));
  assert.ok(waitingMe.items.some(item => item.kind === 'challenge' && item.id === claimed.id));
  const firstPage = service.listChallenges(FRIEND, { group: 'waiting_me', limit: 1 });
  assert.equal(firstPage.items.length, 1);
  assert.ok(firstPage.nextCursor);
  const secondPage = service.listChallenges(FRIEND, {
    group: 'waiting_me',
    limit: 1,
    cursor: firstPage.nextCursor,
  });
  assert.equal(secondPage.items.length, 1);
  assert.notEqual(secondPage.items[0].id, firstPage.items[0].id);
  assert.throws(() => service.listChallenges(FRIEND, { group: 'waiting_me', cursor: 'broken' }), hasCode('INVALID_CHALLENGE_REQUEST'));

  const waitingFriend = service.listChallenges(CREATOR, { group: 'waiting_friend', limit: 50 });
  assert.ok(waitingFriend.items.some(item => item.kind === 'challenge' && item.id === claimed.id));
  assert.ok(waitingFriend.items.some(item => item.kind === 'offer' && item.id === targeted.id));

  database.prepare(`
    UPDATE challenges
    SET status = 'completed', result_json = '{}', completed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(NOW.toISOString(), NOW.toISOString(), claimed.id);
  const history = service.listChallenges(FRIEND, { group: 'history' });
  assert.ok(history.items.some(item => item.id === claimed.id));
  assert.equal(service.getChallenge(claimed.id, FRIEND).actions.canRematch, true);
  assert.throws(() => service.createRematch(claimed.id, CREATOR), hasCode('REMATCH_FORBIDDEN'));
  const rematch = service.createRematch(claimed.id, FRIEND);
  assert.equal(rematch.targetPlayerId, CREATOR);
  assert.equal(rematch.parentChallengeId, claimed.id);
  assert.equal(rematch.offer.creator.playerId, FRIEND);
  assert.equal(service.createRematch(claimed.id, FRIEND).id, rematch.id);
  assert.throws(() => service.getOffer(rematch.id, OTHER), hasCode('OFFER_FORBIDDEN'));

  console.log('Challenge offer lifecycle tests passed.');
} finally {
  database.close();
}
