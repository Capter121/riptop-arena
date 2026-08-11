import assert from 'node:assert/strict';
import { openDatabase } from '../server/storage/database.mjs';
import { migrateDatabase } from '../server/storage/migrate.mjs';
import { createDefaultProgressionSnapshot } from '../server/progression/progression-service.mjs';
import { createSurvivalService, SurvivalError } from '../server/survival/survival-service.mjs';

const PLAYER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const RUN_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RUN_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const START_1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const START_2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const START_3 = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const ABANDON_1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const SEED_1 = '0123456789abcdef0123456789abcdef';
const SEED_2 = 'fedcba9876543210fedcba9876543210';

function loadout(blade = 'blade_orbit_halo') {
  return {
    schemaVersion: 2,
    interfaceId: 'NSS-V1',
    combination: {
      core: 'core_solar_wolf', blade, assist: 'assist_guard', gear: 'gear_high', tip: 'tip_needle_stamina',
    },
    affinities: { core: 'LIGHT', blade: 'WATER', assist: 'WATER', gear: 'WATER', tip: 'EARTH' },
  };
}

function insertPlayer(database, id, displayName, latestNssLoadout = loadout()) {
  database.prepare(`
    INSERT INTO players (id, display_name, device_token_hash, invite_code)
    VALUES (?, ?, ?, 'SURVIVAL')
  `).run(id, displayName, id === PLAYER ? 'a'.repeat(64) : 'b'.repeat(64));
  const snapshot = createDefaultProgressionSnapshot();
  snapshot.latestNssLoadout = latestNssLoadout;
  snapshot.upgrades = { attack: 5, defense: 5, stamina: 5 };
  database.prepare(`
    INSERT INTO player_progression (player_id, snapshot_json, initial_coins_imported)
    VALUES (?, ?, 1)
  `).run(id, JSON.stringify(snapshot));
}

function expectCode(action, code) {
  assert.throws(action, error => error instanceof SurvivalError && error.code === code);
}

const database = openDatabase(':memory:');
try {
  await migrateDatabase(database);
  database.prepare('INSERT INTO invites (code, max_uses) VALUES (?, ?)').run('SURVIVAL', 10);
  insertPlayer(database, PLAYER, 'Nova');
  insertPlayer(database, OTHER, 'Rin');
  const ids = [RUN_1, RUN_2];
  const seeds = [SEED_1, SEED_2];
  const options = {
    now: () => new Date('2026-08-12T12:00:00.000Z'),
    createId: () => ids.shift(),
    createSeed: () => seeds.shift(),
  };
  const service = createSurvivalService(database, options);

  assert.equal(service.getHub(PLAYER).activeRun, null);
  const started = service.startRun(PLAYER, { requestId: START_1 });
  assert.equal(started.created, true);
  assert.equal(started.run.runId, RUN_1);
  assert.equal(started.run.seed, SEED_1);
  assert.equal(started.run.status, 'wave_ready');
  assert.equal(started.run.wave.wave, 1);
  assert.equal(started.run.player.displayName, 'Nova');
  assert.deepEqual(started.run.player.loadout, loadout());
  assert.deepEqual(started.run.player.upgrades, { attack: 0, defense: 0, stamina: 0 });
  assert.equal(started.run.checkpoint.currentWave, 1);
  assert.equal(started.run.checkpoint.integrity, started.run.player.maximumIntegrity);
  assert.deepEqual(started.run.checkpoint.growthLevels, {
    'attack-calibration': 0, coordination: 0, 'affinity-tuning': 0, 'pickup-tuning': 0,
  });
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM survival_runs WHERE player_id = ?').get(PLAYER).count, 1);

  const sameRequest = service.startRun(PLAYER, { requestId: START_1 });
  assert.equal(sameRequest.created, false);
  assert.deepEqual(sameRequest.run, started.run);
  const activeWins = service.startRun(PLAYER, { requestId: START_2 });
  assert.equal(activeWins.created, false);
  assert.equal(activeWins.run.runId, RUN_1);

  const changedSnapshot = createDefaultProgressionSnapshot();
  changedSnapshot.latestNssLoadout = loadout('blade_dual_comet');
  database.prepare('UPDATE player_progression SET snapshot_json = ? WHERE player_id = ?')
    .run(JSON.stringify(changedSnapshot), PLAYER);
  assert.deepEqual(service.getHub(PLAYER).activeRun.player.loadout, loadout());

  const restarted = createSurvivalService(database, options);
  assert.equal(restarted.getRun(RUN_1, PLAYER).seed, SEED_1);
  expectCode(() => restarted.getRun(RUN_1, OTHER), 'SURVIVAL_RUN_FORBIDDEN');
  const otherRun = restarted.startRun(OTHER, { requestId: START_2 });
  assert.equal(otherRun.run.runId, RUN_2);

  database.prepare(`
    INSERT INTO survival_best_scores (
      player_id, run_id, score, highest_completed_wave, bosses_defeated,
      final_integrity, risk_level, loadout_summary_json, achieved_at
    ) VALUES (?, ?, 5000, 10, 2, 50, 2, '{}', ?)
  `).run(PLAYER, RUN_1, '2026-08-11T00:00:00.000Z');
  const abandoned = restarted.abandonRun(RUN_1, PLAYER, { requestId: ABANDON_1 });
  assert.equal(abandoned.status, 'completed');
  assert.equal(abandoned.finalSummary.abandoned, true);
  assert.equal(abandoned.finalSummary.score, 0);
  assert.equal(restarted.getHub(PLAYER).activeRun, null);
  assert.deepEqual(restarted.abandonRun(RUN_1, PLAYER, { requestId: ABANDON_1 }), abandoned);
  expectCode(() => restarted.abandonRun(RUN_1, PLAYER, { requestId: START_1 }), 'STALE_SURVIVAL_STATE');
  assert.equal(database.prepare('SELECT score FROM survival_best_scores WHERE player_id = ?').get(PLAYER).score, 5000);

  const noLoadoutSnapshot = createDefaultProgressionSnapshot();
  database.prepare('UPDATE player_progression SET snapshot_json = ? WHERE player_id = ?')
    .run(JSON.stringify(noLoadoutSnapshot), PLAYER);
  expectCode(() => restarted.startRun(PLAYER, { requestId: START_3 }), 'NSS_LOADOUT_REQUIRED');
} finally {
  database.close();
}

console.log('Survival service lifecycle tests passed.');
