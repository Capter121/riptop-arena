import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../server/storage/database.mjs';
import { migrateDatabase } from '../server/storage/migrate.mjs';

const root = await mkdtemp(join(tmpdir(), 'nss-database-'));
const databasePath = join(root, 'arena.sqlite');
const failureDatabasePath = join(root, 'failure.sqlite');
const failureMigrations = join(root, 'failure-migrations');
await mkdir(failureMigrations);

async function unlinkIfPresent(path) {
  try {
    await unlink(path);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

let database;
let failureDatabase;
try {
  database = openDatabase(databasePath);
  assert.equal(database.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  assert.equal(database.prepare('PRAGMA busy_timeout').get().timeout, 5_000);
  assert.equal(database.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');

  assert.deepEqual(await migrateDatabase(database), [1, 2, 3, 4, 5]);
  assert.deepEqual(await migrateDatabase(database), []);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 5);

  const tables = database.prepare(`
    SELECT name FROM sqlite_schema
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map(row => row.name);
  assert.deepEqual(tables, [
    'builds',
    'campaign_attempts',
    'campaign_progress',
    'challenge_offers',
    'challenges',
    'invites',
    'player_progression',
    'players',
    'schema_migrations',
    'wallet_events',
  ]);

  database.prepare(`
    INSERT INTO invites (code, max_uses) VALUES (?, ?)
  `).run('FRIENDS-ONLY', 5);
  database.prepare(`
    INSERT INTO players (id, display_name, device_token_hash, invite_code)
    VALUES (?, ?, ?, ?)
  `).run('player-1', 'Nova', 'a'.repeat(64), 'FRIENDS-ONLY');
  database.prepare(`
    INSERT INTO players (id, display_name, device_token_hash, invite_code)
    VALUES (?, ?, ?, ?)
  `).run('player-2', 'Rin', 'e'.repeat(64), 'FRIENDS-ONLY');
  assert.throws(() => database.prepare(`
    INSERT INTO players (id, display_name, device_token_hash, invite_code)
    VALUES (?, ?, ?, ?)
  `).run('player-invalid', 'Invalid', 'd'.repeat(64), 'MISSING-INVITE'));
  database.prepare(`
    INSERT INTO builds (id, player_id, snapshot_json, catalog_sha256, battle_rules_version)
    VALUES (?, ?, ?, ?, ?)
  `).run('build-1', 'player-1', '{"kind":"nss-v2"}', 'b'.repeat(64), 2);
  database.prepare(`
    INSERT INTO challenges (id, creator_player_id, recipient_player_id, input_json)
    VALUES (?, ?, ?, ?)
  `).run('challenge-1', 'player-1', 'player-1', '{"seed":"fixed"}');
  const legacyChallenge = database.prepare(`
    SELECT offer_id, parent_challenge_id, result_submission_id
    FROM challenges WHERE id = ?
  `).get('challenge-1');
  assert.equal(legacyChallenge.offer_id, null);
  assert.equal(legacyChallenge.parent_challenge_id, null);
  assert.equal(legacyChallenge.result_submission_id, null);

  const insertOffer = database.prepare(`
    INSERT INTO challenge_offers (
      id, creator_player_id, target_player_id, parent_challenge_id,
      creation_request_id, status, offer_json, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertOffer.run(
    'offer-1',
    'player-1',
    null,
    'challenge-1',
    'request-1',
    'open',
    '{"mode":"fair"}',
    '2026-08-11T00:00:00.000Z',
  );
  assert.throws(() => insertOffer.run(
    'offer-duplicate-request',
    'player-1',
    null,
    null,
    'request-1',
    'open',
    '{}',
    '2026-08-11T00:00:00.000Z',
  ));
  assert.throws(() => insertOffer.run(
    'offer-duplicate-parent',
    'player-1',
    null,
    'challenge-1',
    'request-2',
    'open',
    '{}',
    '2026-08-11T00:00:00.000Z',
  ));
  assert.throws(() => insertOffer.run(
    'offer-invalid-status',
    'player-1',
    null,
    null,
    'request-3',
    'invalid',
    '{}',
    '2026-08-11T00:00:00.000Z',
  ));
  assert.throws(() => insertOffer.run(
    'offer-derived-expired-status',
    'player-1',
    null,
    null,
    'request-expired',
    'expired',
    '{}',
    '2026-08-11T00:00:00.000Z',
  ));
  assert.throws(() => insertOffer.run(
    'offer-invalid-json',
    'player-1',
    null,
    null,
    'request-4',
    'open',
    '{',
    '2026-08-11T00:00:00.000Z',
  ));
  assert.throws(() => insertOffer.run(
    'offer-invalid-player',
    'missing-player',
    null,
    null,
    'request-5',
    'open',
    '{}',
    '2026-08-11T00:00:00.000Z',
  ));

  database.prepare(`
    INSERT INTO challenges (
      id, creator_player_id, recipient_player_id, status, input_json,
      offer_id, parent_challenge_id, result_submission_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'challenge-2',
    'player-1',
    'player-1',
    'pending',
    '{"seed":"offer-fixed"}',
    'offer-1',
    'challenge-1',
    'submission-1',
  );
  database.prepare(`
    UPDATE challenge_offers SET status = 'claimed', claimed_challenge_id = ? WHERE id = ?
  `).run('challenge-2', 'offer-1');
  insertOffer.run(
    'offer-2',
    'player-1',
    null,
    null,
    'request-6',
    'open',
    '{}',
    '2026-08-11T00:00:00.000Z',
  );
  assert.throws(() => database.prepare(`
    UPDATE challenge_offers SET claimed_challenge_id = ? WHERE id = ?
  `).run('challenge-2', 'offer-2'));
  assert.throws(() => database.prepare(`
    INSERT INTO challenges (
      id, creator_player_id, recipient_player_id, input_json, offer_id
    ) VALUES (?, ?, ?, ?, ?)
  `).run('challenge-duplicate-offer', 'player-1', 'player-1', '{}', 'offer-1'));
  assert.throws(() => database.prepare(`
    INSERT INTO challenges (
      id, creator_player_id, recipient_player_id, input_json, result_submission_id
    ) VALUES (?, ?, ?, ?, ?)
  `).run('challenge-duplicate-result', 'player-1', 'player-1', '{}', 'submission-1'));
  assert.throws(() => database.prepare(`
    INSERT INTO builds (id, player_id, snapshot_json, catalog_sha256, battle_rules_version)
    VALUES (?, ?, ?, ?, ?)
  `).run('build-invalid', 'player-1', '{', 'c'.repeat(64), 2));

  const insertProgression = database.prepare(`
    INSERT INTO player_progression (player_id, snapshot_json, coins)
    VALUES (?, ?, ?)
  `);
  insertProgression.run('player-1', '{"ladderIndex":0}', 100);
  assert.throws(() => insertProgression.run('player-1', '{}', 0));
  assert.throws(() => insertProgression.run('player-2', '{', 0));
  assert.throws(() => insertProgression.run('player-2', '{}', -1));
  insertProgression.run('player-2', '{}', 0);

  const insertCampaignProgress = database.prepare(`
    INSERT INTO campaign_progress (player_id, opponent_id, stars_mask, defeated, attempt_count, best_outcome_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertCampaignProgress.run('player-1', 'blaze-fang', 3, 1, 2, '{"winner":"player"}');
  assert.throws(() => insertCampaignProgress.run('player-1', 'blaze-fang', 0, 0, 0, null));
  assert.throws(() => insertCampaignProgress.run('player-1', 'sky-gale', 8, 0, 0, null));
  assert.throws(() => insertCampaignProgress.run('player-1', 'unknown', 0, 0, 0, null));
  assert.throws(() => insertCampaignProgress.run('player-2', 'sky-gale', 0, 0, -1, null));
  insertCampaignProgress.run('player-2', 'sky-gale', 0, 0, 0, null);

  const insertCampaignAttempt = database.prepare(`
    INSERT INTO campaign_attempts (
      attempt_id, player_id, opponent_id, config_version, simulation_version,
      seed, loadout_index, arena, ai_profile_id,
      player_loadout_json, player_upgrades_json, enemy_loadout_json, enemy_upgrades_json,
      player_max_integrity, start_request_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const attempt = [
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'player-1', 'blaze-fang', 'campaign-v1', 1,
    '0'.repeat(32), 0, 'neon_magma', 'assault', '{}', '{}', '{}', '{}', 100,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  ];
  insertCampaignAttempt.run(...attempt);
  assert.throws(() => insertCampaignAttempt.run(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', ...attempt.slice(1),
  ));
  assert.throws(() => insertCampaignAttempt.run(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'player-1', 'blaze-fang', 'campaign-v1', 1,
    '0'.repeat(32), 2, 'neon_magma', 'assault', '{}', '{}', '{}', '{}', 100,
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  ));
  database.prepare(`
    UPDATE campaign_attempts
    SET result_request_id = ?, result_json = ?, settlement_json = ?, completed_at = ?
    WHERE attempt_id = ?
  `).run(
    'ffffffff-ffff-4fff-8fff-ffffffffffff', '{"winner":"player"}', '{"coins":100}',
    '2026-08-11T00:00:00.000Z', attempt[0],
  );
  assert.throws(() => database.prepare(`
    INSERT INTO campaign_attempts (
      attempt_id, player_id, opponent_id, config_version, simulation_version,
      seed, loadout_index, arena, ai_profile_id,
      player_loadout_json, player_upgrades_json, enemy_loadout_json, enemy_upgrades_json,
      player_max_integrity, start_request_id, result_request_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    '12121212-1212-4212-8212-121212121212', 'player-1', 'sky-gale', 'campaign-v1', 1,
    '1'.repeat(32), 0, 'classic_grid', 'skirmisher', '{}', '{}', '{}', '{}', 100,
    '13131313-1313-4313-8313-131313131313', 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  ));

  const eventId = '11111111-1111-4111-8111-111111111111';
  const insertWalletEvent = database.prepare(`
    INSERT INTO wallet_events (player_id, event_id, kind, delta, metadata_json)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertWalletEvent.run('player-1', eventId, 'credit', 50, '{"source":"test"}');
  insertWalletEvent.run('player-2', eventId, 'credit', 50, '{}');
  assert.throws(() => insertWalletEvent.run('player-1', eventId, 'credit', 50, '{}'));
  assert.throws(() => insertWalletEvent.run('player-1', '2'.repeat(36), 'grant', 50, '{}'));
  assert.throws(() => insertWalletEvent.run('player-1', '3'.repeat(36), 'credit', 0, '{}'));
  assert.throws(() => insertWalletEvent.run('player-1', '4'.repeat(36), 'credit', -1, '{}'));
  assert.throws(() => insertWalletEvent.run('player-1', '5'.repeat(36), 'debit', 1, '{}'));
  assert.throws(() => insertWalletEvent.run('player-1', '6'.repeat(36), 'credit', 10_001, '{}'));
  assert.throws(() => insertWalletEvent.run('player-1', '7'.repeat(36), 'credit', 1, '{'));

  database.prepare('DELETE FROM players WHERE id = ?').run('player-2');
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM player_progression WHERE player_id = ?').get('player-2').count, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM wallet_events WHERE player_id = ?').get('player-2').count, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM campaign_progress WHERE player_id = ?').get('player-2').count, 0);

  database.close();
  database = null;
  database = openDatabase(databasePath);
  assert.deepEqual(await migrateDatabase(database), []);
  assert.equal(database.prepare('SELECT display_name FROM players WHERE id = ?').get('player-1').display_name, 'Nova');
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM challenges').get().count, 2);

  await writeFile(join(failureMigrations, '001_stable.sql'), 'CREATE TABLE stable (id TEXT PRIMARY KEY);', 'utf8');
  await writeFile(join(failureMigrations, '002_failure.sql'), `
    CREATE TABLE leaked (id TEXT PRIMARY KEY);
    INSERT INTO missing_table (id) VALUES ('fail');
  `, 'utf8');
  failureDatabase = openDatabase(failureDatabasePath);
  await assert.rejects(() => migrateDatabase(failureDatabase, { migrationsDir: failureMigrations }));
  assert.equal(failureDatabase.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 1);
  assert.equal(failureDatabase.prepare(`
    SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table' AND name = 'stable'
  `).get().count, 1);
  assert.equal(failureDatabase.prepare(`
    SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table' AND name = 'leaked'
  `).get().count, 0);
  failureDatabase.prepare('INSERT INTO stable (id) VALUES (?)').run('transaction-ended');

  console.log('SQLite migration tests passed.');
} finally {
  database?.close();
  failureDatabase?.close();
  await unlinkIfPresent(join(failureMigrations, '002_failure.sql'));
  await unlinkIfPresent(join(failureMigrations, '001_stable.sql'));
  await unlinkIfPresent(`${failureDatabasePath}-shm`);
  await unlinkIfPresent(`${failureDatabasePath}-wal`);
  await unlinkIfPresent(failureDatabasePath);
  await unlinkIfPresent(`${databasePath}-shm`);
  await unlinkIfPresent(`${databasePath}-wal`);
  await unlinkIfPresent(databasePath);
  await rmdir(failureMigrations);
  await rmdir(root);
}
