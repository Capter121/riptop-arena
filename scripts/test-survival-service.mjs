import assert from 'node:assert/strict';
import { openDatabase } from '../server/storage/database.mjs';
import { migrateDatabase } from '../server/storage/migrate.mjs';
import { createDefaultProgressionSnapshot } from '../server/progression/progression-service.mjs';
import { createSurvivalService, SurvivalError } from '../server/survival/survival-service.mjs';
import { generateSurvivalWave } from '../server/survival/survival-config.mjs';

const PLAYER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const RUN_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RUN_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const START_1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const START_2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const START_3 = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const ABANDON_1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const RESULT_1 = '12121212-1212-4212-8212-121212121212';
const RESULT_2 = '13131313-1313-4313-8313-131313131313';
const REWARD_1 = '14141414-1414-4414-8414-141414141414';
const RESULT_5 = '15151515-1515-4515-8515-151515151515';
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

function resultRequest(run, requestId, winner = 'player') {
  return {
    requestId,
    configVersion: run.configVersion,
    simulationVersion: run.simulationVersion,
    battleRulesVersion: run.battleRulesVersion,
    wave: run.wave.wave,
    outcome: {
      simulationVersion: run.simulationVersion,
      seed: run.wave.seed,
      winner,
      kind: 'spin finish',
      turnCount: 2,
      tickCount: 120,
      player: {
        spin: winner === 'player' ? 10 : 0,
        integrity: winner === 'player' ? run.player.maximumIntegrity - 100 : 0,
        stamina: 50,
        spirit: 0,
        burst: 20,
        tilt: 0.5,
        alive: winner === 'player',
      },
      enemy: {
        spin: winner === 'player' ? 0 : 10,
        integrity: winner === 'player' ? 0 : 100,
        stamina: 0,
        spirit: 0,
        burst: 100,
        tilt: 2,
        alive: winner !== 'player',
      },
    },
  };
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
  const settled = restarted.submitWaveResult(RUN_1, PLAYER, resultRequest(started.run, RESULT_1));
  assert.equal(settled.run.status, 'reward_pending');
  assert.equal(settled.run.checkpoint.currentWave, 1);
  assert.equal(settled.rewardOptions.length, 3);
  assert.ok(settled.score.score > 0);
  assert.deepEqual(restarted.submitWaveResult(RUN_1, PLAYER, resultRequest(started.run, RESULT_1)), settled);
  const changedResult = resultRequest(started.run, RESULT_1);
  changedResult.outcome.kind = 'ring out';
  expectCode(() => restarted.submitWaveResult(RUN_1, PLAYER, changedResult), 'SURVIVAL_REQUEST_CONFLICT');
  expectCode(
    () => restarted.submitWaveResult(RUN_1, PLAYER, resultRequest(started.run, RESULT_2)),
    'STALE_SURVIVAL_STATE',
  );
  expectCode(() => restarted.selectReward(RUN_1, 1, PLAYER, {
    requestId: RESULT_2,
    reward: { kind: 'growth', id: 'attack-calibration', level: 3 },
  }), 'INVALID_SURVIVAL_REWARD');
  const advanced = restarted.selectReward(RUN_1, 1, PLAYER, {
    requestId: REWARD_1,
    reward: settled.rewardOptions[0],
  });
  assert.equal(advanced.run.status, 'wave_ready');
  assert.equal(advanced.run.checkpoint.currentWave, 2);
  assert.equal(advanced.run.wave.wave, 2);
  assert.deepEqual(restarted.selectReward(RUN_1, 1, PLAYER, {
    requestId: REWARD_1,
    reward: settled.rewardOptions[0],
  }), advanced);
  expectCode(() => restarted.selectReward(RUN_1, 1, PLAYER, {
    requestId: REWARD_1,
    reward: settled.rewardOptions[1],
  }), 'SURVIVAL_REQUEST_CONFLICT');
  expectCode(() => restarted.selectReward(RUN_1, 1, PLAYER, {
    requestId: RESULT_2,
    reward: { kind: 'instant', id: 'temporary-overdrive' },
  }), 'STALE_SURVIVAL_STATE');
  database.prepare(`
    UPDATE survival_runs SET current_wave = 5, current_wave_json = ? WHERE run_id = ?
  `).run(JSON.stringify(generateSurvivalWave(SEED_1, 5, 0)), RUN_1);
  const bossRun = restarted.getRun(RUN_1, PLAYER);
  database.exec(`
    CREATE TRIGGER fail_survival_wallet BEFORE INSERT ON wallet_events
    WHEN json_extract(NEW.metadata_json, '$.source') = 'survival'
    BEGIN
      SELECT RAISE(ABORT, 'survival wallet failure');
    END;
  `);
  assert.throws(() => restarted.submitWaveResult(RUN_1, PLAYER, resultRequest(bossRun, RESULT_5)));
  assert.equal(restarted.getRun(RUN_1, PLAYER).status, 'wave_ready');
  assert.equal(database.prepare(`
    SELECT COUNT(*) AS count FROM survival_wave_results WHERE run_id = ? AND wave = 5
  `).get(RUN_1).count, 0);
  database.exec('DROP TRIGGER fail_survival_wallet');
  const bossSettlement = restarted.submitWaveResult(RUN_1, PLAYER, resultRequest(bossRun, RESULT_5));
  assert.equal(bossSettlement.milestone.coins, 100);
  assert.equal(bossSettlement.progression.coins, 100);
  assert.deepEqual(restarted.submitWaveResult(RUN_1, PLAYER, resultRequest(bossRun, RESULT_5)), bossSettlement);
  assert.equal(database.prepare(`
    SELECT COUNT(*) AS count FROM wallet_events WHERE player_id = ? AND json_extract(metadata_json, '$.source') = 'survival'
  `).get(PLAYER).count, 1);
  const otherRun = restarted.startRun(OTHER, { requestId: START_2 });
  assert.equal(otherRun.run.runId, RUN_2);
  const loss = restarted.submitWaveResult(RUN_2, OTHER, resultRequest(otherRun.run, RESULT_2, 'enemy'));
  assert.equal(loss.run.status, 'completed');
  assert.equal(loss.run.finalSummary.highestCompletedWave, 0);
  assert.equal(restarted.getHub(OTHER).activeRun, null);
  assert.deepEqual(restarted.listHistory(PLAYER), { items: [], nextCursor: null });
  const otherHistory = restarted.listHistory(OTHER);
  assert.equal(otherHistory.items.length, 1);
  assert.equal(otherHistory.items[0].runId, RUN_2);

  database.prepare(`
    INSERT INTO survival_best_scores (
      player_id, run_id, score, highest_completed_wave, bosses_defeated,
      final_integrity, risk_level, loadout_summary_json, achieved_at
    ) VALUES (?, ?, 5000, 10, 2, 50, 2, '{}', ?)
  `).run(PLAYER, RUN_1, '2026-08-11T00:00:00.000Z');
  const abandoned = restarted.abandonRun(RUN_1, PLAYER, { requestId: ABANDON_1 });
  assert.equal(abandoned.status, 'completed');
  assert.equal(abandoned.finalSummary.abandoned, true);
  assert.deepEqual(restarted.listHistory(PLAYER), { items: [], nextCursor: null });
  assert.equal(abandoned.finalSummary.score, settled.score.score + bossSettlement.score.score);
  assert.equal(restarted.getHub(PLAYER).activeRun, null);
  assert.deepEqual(restarted.abandonRun(RUN_1, PLAYER, { requestId: ABANDON_1 }), abandoned);
  expectCode(() => restarted.abandonRun(RUN_1, PLAYER, { requestId: START_1 }), 'STALE_SURVIVAL_STATE');
  assert.equal(database.prepare('SELECT score FROM survival_best_scores WHERE player_id = ?').get(PLAYER).score, 5000);
  const firstPage = restarted.listLeaderboard(PLAYER, { limit: '1' });
  assert.equal(firstPage.entries.length, 1);
  assert.equal(firstPage.entries[0].playerId, PLAYER);
  assert.equal(firstPage.currentRank, 1);
  assert.ok(firstPage.nextCursor);
  const secondPage = restarted.listLeaderboard(PLAYER, { limit: '1', cursor: firstPage.nextCursor });
  assert.equal(secondPage.entries[0].playerId, OTHER);

  const noLoadoutSnapshot = createDefaultProgressionSnapshot();
  database.prepare('UPDATE player_progression SET snapshot_json = ? WHERE player_id = ?')
    .run(JSON.stringify(noLoadoutSnapshot), PLAYER);
  expectCode(() => restarted.startRun(PLAYER, { requestId: START_3 }), 'NSS_LOADOUT_REQUIRED');
} finally {
  database.close();
}

console.log('Survival service lifecycle tests passed.');
