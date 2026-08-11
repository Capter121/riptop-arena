import assert from 'node:assert/strict';
import { openDatabase } from '../server/storage/database.mjs';
import { migrateDatabase } from '../server/storage/migrate.mjs';
import { createDefaultProgressionSnapshot } from '../server/progression/progression-service.mjs';
import { createCampaignService, CampaignError } from '../server/campaign/campaign-service.mjs';

const PLAYER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ATTEMPT_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ATTEMPT_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const START_1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const START_2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const RESULT_1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const RESULT_2 = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const SEED_1 = '0123456789abcdef0123456789abcdef';
const SEED_2 = 'fedcba9876543210fedcba9876543210';

function loadout(affinities = {}) {
  return {
    schemaVersion: 2,
    interfaceId: 'NSS-V1',
    combination: {
      core: 'core_solar_wolf',
      blade: 'blade_orbit_halo',
      assist: 'assist_guard',
      gear: 'gear_high',
      tip: 'tip_needle_stamina',
    },
    affinities: {
      core: 'LIGHT',
      blade: 'WATER',
      assist: 'WATER',
      gear: 'WATER',
      tip: 'EARTH',
      ...affinities,
    },
  };
}

function outcome(seed, overrides = {}) {
  return {
    simulationVersion: 1,
    seed,
    winner: 'player',
    kind: 'spin finish',
    turnCount: 6,
    tickCount: 900,
    player: { spin: 50, integrity: 1500, stamina: 30, spirit: 20, burst: 10, tilt: 0.5, alive: true },
    enemy: { spin: 0, integrity: 0, stamina: 0, spirit: 0, burst: 100, tilt: 1, alive: false },
    ...overrides,
  };
}

function insertPlayer(database, playerId, displayName, options = {}) {
  database.prepare(`
    INSERT INTO players (id, display_name, device_token_hash, invite_code)
    VALUES (?, ?, ?, ?)
  `).run(playerId, displayName, playerId === PLAYER ? 'a'.repeat(64) : 'b'.repeat(64), 'CAMPAIGN');
  const snapshot = createDefaultProgressionSnapshot();
  snapshot.latestNssLoadout = options.loadout ?? loadout();
  if (options.unlockedParts) snapshot.unlockedParts = options.unlockedParts;
  database.prepare(`
    INSERT INTO player_progression (player_id, snapshot_json, coins, initial_coins_imported)
    VALUES (?, ?, ?, 1)
  `).run(playerId, JSON.stringify(snapshot), options.coins ?? 0);
}

async function createFixture(options = {}) {
  const database = openDatabase(':memory:');
  await migrateDatabase(database);
  database.prepare('INSERT INTO invites (code, max_uses) VALUES (?, ?)').run('CAMPAIGN', 10);
  insertPlayer(database, PLAYER, 'Nova', options);
  insertPlayer(database, OTHER, 'Rin');
  const ids = [ATTEMPT_1, ATTEMPT_2];
  const seeds = [SEED_1, SEED_2];
  const service = createCampaignService(database, {
    now: () => new Date('2026-08-11T12:00:00.000Z'),
    createId: () => ids.shift(),
    createSeed: () => seeds.shift(),
  });
  return { database, service };
}

function expectCode(action, code) {
  assert.throws(action, error => error instanceof CampaignError && error.code === code);
}

{
  const { database, service } = await createFixture();
  try {
    const initial = service.getArchive(PLAYER);
    assert.equal(initial.configVersion, 'campaign-v1');
    assert.equal(initial.opponents.length, 8);
    assert.equal(initial.opponents[0].unlocked, true);
    assert.equal(initial.opponents[1].unlocked, false);
    assert.equal(initial.totalStars, 0);
    assert.equal(initial.nextOpponentId, 'blaze-fang');
    expectCode(() => service.startAttempt(PLAYER, { requestId: START_1, opponentId: 'sky-gale' }), 'CAMPAIGN_OPPONENT_LOCKED');

    const first = service.startAttempt(PLAYER, { requestId: START_1, opponentId: 'blaze-fang' });
    assert.equal(first.attemptId, ATTEMPT_1);
    assert.equal(first.seed, SEED_1);
    assert.equal(first.loadoutIndex, 0);
    assert.equal(first.arena, 'neon_magma');
    assert.equal(first.aiProfileId, 'assault');
    assert.equal(first.player.displayName, 'Nova');
    assert.deepEqual(first.player.loadout, loadout());
    assert.deepEqual(first.player.upgrades, { attack: 0, defense: 0, stamina: 0 });
    assert.equal(first.player.maxIntegrity, 2220);
    assert.equal(first.enemy.loadout.schemaVersion, 2);
    assert.equal(first.enemy.loadout.interfaceId, 'NSS-V1');
    assert.deepEqual(service.startAttempt(PLAYER, { requestId: START_1, opponentId: 'blaze-fang' }), first);
    assert.equal(database.prepare(`
      SELECT attempt_count FROM campaign_progress WHERE player_id = ? AND opponent_id = ?
    `).get(PLAYER, 'blaze-fang').attempt_count, 1);
    expectCode(() => service.startAttempt(PLAYER, { requestId: START_1, opponentId: 'sky-gale' }), 'CAMPAIGN_IDEMPOTENCY_MISMATCH');
    expectCode(() => service.submitResult(ATTEMPT_1, OTHER, { requestId: RESULT_1, outcome: outcome(SEED_1) }), 'CAMPAIGN_RESULT_FORBIDDEN');

    const loss = service.submitResult(ATTEMPT_1, PLAYER, {
      requestId: RESULT_1,
      outcome: outcome(SEED_1, { winner: 'enemy' }),
    });
    assert.equal(loss.progress.opponents[0].defeated, false);
    assert.equal(loss.progress.nextOpponentId, 'blaze-fang');
    assert.equal(loss.progression.coins, 0);
    assert.equal(loss.earnedStarsMask, 0);
    assert.deepEqual(service.submitResult(ATTEMPT_1, PLAYER, {
      requestId: RESULT_1,
      outcome: outcome(SEED_1, { winner: 'enemy' }),
    }), loss);
    expectCode(() => service.submitResult(ATTEMPT_1, PLAYER, {
      requestId: RESULT_2,
      outcome: outcome(SEED_1),
    }), 'CAMPAIGN_RESULT_CONFLICT');

    const second = service.startAttempt(PLAYER, { requestId: START_2, opponentId: 'blaze-fang' });
    assert.equal(second.loadoutIndex, 1);
    const win = service.submitResult(ATTEMPT_2, PLAYER, { requestId: RESULT_2, outcome: outcome(SEED_2) });
    assert.equal(win.earnedStarsMask, 7);
    assert.equal(win.newStarsMask, 7);
    assert.equal(win.progress.totalStars, 3);
    assert.equal(win.progress.nextOpponentId, 'sky-gale');
    assert.equal(win.progress.opponents[0].defeated, true);
    assert.equal(win.progression.coins, 325);
    assert.ok(win.progression.snapshot.unlockedParts.includes('slash'));
    assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM wallet_events WHERE player_id = ?`).get(PLAYER).count, 4);
  } finally {
    database.close();
  }
}

{
  const { database, service } = await createFixture({
    unlockedParts: ['balanced', 'grip', 'round', 'slash'],
  });
  try {
    const attempt = service.startAttempt(PLAYER, { requestId: START_1, opponentId: 'blaze-fang' });
    const result = service.submitResult(attempt.attemptId, PLAYER, { requestId: RESULT_1, outcome: outcome(attempt.seed) });
    assert.equal(result.progression.coins, 645);
    assert.equal(result.rewards.partConversionCoins, 320);
  } finally {
    database.close();
  }
}

{
  const { database, service } = await createFixture({
    loadout: loadout({ core: 'LIGHT', blade: 'EARTH', assist: 'WATER', gear: 'WIND', tip: 'WOOD' }),
  });
  try {
    const insert = database.prepare(`
      INSERT INTO campaign_progress (player_id, opponent_id, stars_mask, defeated, attempt_count)
      VALUES (?, ?, 7, 1, 1)
    `);
    for (const opponentId of ['blaze-fang', 'sky-gale', 'abyss-tide', 'forest-crown', 'rift-drift', 'dawn-verdict', 'night-eclipse']) {
      insert.run(PLAYER, opponentId);
    }
    const attempt = service.startAttempt(PLAYER, { requestId: START_1, opponentId: 'atlas-guardian' });
    const result = service.submitResult(attempt.attemptId, PLAYER, {
      requestId: RESULT_1,
      outcome: outcome(attempt.seed, { player: { spin: 50, integrity: attempt.player.maxIntegrity * 0.4, stamina: 30, spirit: 20, burst: 10, tilt: 0.5, alive: true } }),
    });
    assert.equal(result.progress.totalStars, 24);
    assert.equal(result.progression.snapshot.championshipCount, 1);
    assert.equal(result.rewards.championshipCrowns, 1);
  } finally {
    database.close();
  }
}

{
  const { database, service } = await createFixture();
  try {
    const attempt = service.startAttempt(PLAYER, { requestId: START_1, opponentId: 'blaze-fang' });
    database.exec(`
      CREATE TRIGGER fail_campaign_wallet BEFORE INSERT ON wallet_events
      WHEN json_extract(NEW.metadata_json, '$.source') = 'campaign'
      BEGIN
        SELECT RAISE(ABORT, 'campaign wallet failure');
      END;
    `);
    assert.throws(() => service.submitResult(attempt.attemptId, PLAYER, { requestId: RESULT_1, outcome: outcome(attempt.seed) }));
    assert.equal(database.prepare('SELECT completed_at FROM campaign_attempts WHERE attempt_id = ?').get(attempt.attemptId).completed_at, null);
    assert.equal(database.prepare('SELECT defeated FROM campaign_progress WHERE player_id = ? AND opponent_id = ?').get(PLAYER, 'blaze-fang').defeated, 0);
    assert.equal(database.prepare('SELECT coins FROM player_progression WHERE player_id = ?').get(PLAYER).coins, 0);
  } finally {
    database.close();
  }
}

console.log('Campaign service transaction tests passed.');
