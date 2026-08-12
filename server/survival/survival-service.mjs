import { randomBytes, randomUUID } from 'node:crypto';
import { readPlayerProgression } from '../progression/progression-service.mjs';
import { campaignNssMaxIntegrity } from '../campaign/campaign-contract.mjs';
import {
  SURVIVAL_CONFIG,
  applySurvivalReward,
  compareSurvivalBest,
  createSurvivalSummary,
  generateSurvivalRewards,
  generateSurvivalWave,
  scoreSurvivalWave,
} from './survival-config.mjs';
import {
  SurvivalError,
  normalizeSurvivalAbandonRequest,
  normalizeSurvivalLeaderboardQuery,
  normalizeSurvivalHistoryQuery,
  normalizeSurvivalLoadout,
  normalizeSurvivalResultRequest,
  normalizeSurvivalRewardRequest,
  normalizeSurvivalStartRequest,
} from './survival-contract.mjs';
import { survivalEventUuid } from '../../shared/survival/survival-rules.js';

export { SurvivalError } from './survival-contract.mjs';

const ZERO_UPGRADES = Object.freeze({ attack: 0, defense: 0, stamina: 0 });
const INITIAL_GROWTH = Object.freeze({
  'attack-calibration': 0,
  coordination: 0,
  'affinity-tuning': 0,
  'pickup-tuning': 0,
});

function fail(status, code, message) {
  throw new SurvivalError(status, code, message);
}

function validDate(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(date.getTime())) fail(500, 'SURVIVAL_SERVICE_ERROR', 'Survival clock returned an invalid time.');
  return date;
}

export function createSurvivalService(database, options = {}) {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? (() => randomUUID());
  const createSeed = options.createSeed ?? (() => randomBytes(16).toString('hex'));

  function playerRow(playerId) {
    const player = database.prepare('SELECT display_name FROM players WHERE id = ?').get(playerId);
    if (!player) fail(404, 'PLAYER_NOT_FOUND', 'Survival player was not found.');
    return player;
  }

  function readRunRow(runId) {
    const row = database.prepare(`
      SELECT run_id, player_id, config_version, simulation_version, battle_rules_version,
             seed, status, player_loadout_json, player_max_integrity, current_wave,
             current_wave_json, integrity, burst_risk, persistent_debuffs_json,
             growth_levels_json, next_wave_effect, risk_level, score,
             flawless_streak, bosses_defeated, start_request_id, abandon_request_id,
             final_summary_json, created_at, updated_at, completed_at
      FROM survival_runs WHERE run_id = ?
    `).get(runId);
    if (!row) fail(404, 'SURVIVAL_RUN_NOT_FOUND', 'Survival run was not found.');
    return row;
  }

  function presentBest(row) {
    if (!row) return null;
    return {
      runId: row.run_id,
      score: row.score,
      highestCompletedWave: row.highest_completed_wave,
      bossesDefeated: row.bosses_defeated,
      finalIntegrity: row.final_integrity,
      riskLevel: row.risk_level,
      loadoutSummary: JSON.parse(row.loadout_summary_json),
      achievedAt: row.achieved_at,
    };
  }

  function presentRun(row) {
    const player = playerRow(row.player_id);
    return {
      runId: row.run_id,
      configVersion: row.config_version,
      simulationVersion: row.simulation_version,
      battleRulesVersion: row.battle_rules_version,
      seed: row.seed,
      status: row.status,
      player: {
        playerId: row.player_id,
        displayName: player.display_name,
        loadout: JSON.parse(row.player_loadout_json),
        upgrades: { ...ZERO_UPGRADES },
        maximumIntegrity: row.player_max_integrity,
      },
      wave: JSON.parse(row.current_wave_json),
      checkpoint: {
        currentWave: row.current_wave,
        integrity: row.integrity,
        burstRisk: row.burst_risk,
        persistentDebuffs: JSON.parse(row.persistent_debuffs_json),
        growthLevels: JSON.parse(row.growth_levels_json),
        nextWaveEffect: row.next_wave_effect,
        riskLevel: row.risk_level,
        score: row.score,
        flawlessStreak: row.flawless_streak,
        bossesDefeated: row.bosses_defeated,
      },
      finalSummary: row.final_summary_json ? JSON.parse(row.final_summary_json) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
    };
  }

  function completedScores(runId) {
    return database.prepare(`
      SELECT wave, result_json, score FROM survival_wave_results WHERE run_id = ? ORDER BY wave
    `).all(runId).flatMap((result) => {
      const request = JSON.parse(result.result_json);
      if (request.outcome.winner !== 'player') return [];
      return [{
        wave: result.wave,
        type: SURVIVAL_CONFIG.wavePattern[(result.wave - 1) % SURVIVAL_CONFIG.wavePattern.length],
        score: result.score,
      }];
    });
  }

  function bestSummary(row) {
    if (!row) return null;
    return {
      score: row.score,
      highestCompletedWave: row.highest_completed_wave,
      bossesDefeated: row.bosses_defeated,
      finalIntegrity: row.final_integrity,
      riskLevel: row.risk_level,
      achievedAt: row.achieved_at,
      abandoned: false,
    };
  }

  function updateBest(row, summary, timestamp) {
    const incumbent = database.prepare(`
      SELECT score, highest_completed_wave, bosses_defeated, final_integrity, risk_level, achieved_at
      FROM survival_best_scores WHERE player_id = ?
    `).get(row.player_id);
    if (compareSurvivalBest(summary, bestSummary(incumbent)) <= 0) return;
    database.prepare(`
      INSERT INTO survival_best_scores (
        player_id, run_id, score, highest_completed_wave, bosses_defeated,
        final_integrity, risk_level, loadout_summary_json, achieved_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (player_id) DO UPDATE SET
        run_id = excluded.run_id,
        score = excluded.score,
        highest_completed_wave = excluded.highest_completed_wave,
        bosses_defeated = excluded.bosses_defeated,
        final_integrity = excluded.final_integrity,
        risk_level = excluded.risk_level,
        loadout_summary_json = excluded.loadout_summary_json,
        achieved_at = excluded.achieved_at,
        updated_at = excluded.updated_at
    `).run(
      row.player_id, row.run_id, summary.score, summary.highestCompletedWave,
      summary.bossesDefeated, summary.finalIntegrity, summary.riskLevel,
      row.player_loadout_json, summary.achievedAt, timestamp,
    );
  }

  function getRun(runId, playerId) {
    const row = readRunRow(runId);
    if (row.player_id !== playerId) fail(403, 'SURVIVAL_RUN_FORBIDDEN', 'Only the run owner can access this survival run.');
    return presentRun(row);
  }

  function getHub(playerId) {
    playerRow(playerId);
    const active = database.prepare(`
      SELECT run_id FROM survival_runs WHERE player_id = ? AND status != 'completed'
    `).get(playerId);
    const best = database.prepare(`
      SELECT run_id, score, highest_completed_wave, bosses_defeated,
             final_integrity, risk_level, loadout_summary_json, achieved_at
      FROM survival_best_scores WHERE player_id = ?
    `).get(playerId);
    const earnedWaves = new Set(database.prepare(`
      SELECT CAST(json_extract(metadata_json, '$.wave') AS INTEGER) AS wave
      FROM wallet_events
      WHERE player_id = ? AND json_extract(metadata_json, '$.source') = 'survival'
    `).all(playerId).map(row => row.wave));
    return {
      configVersion: SURVIVAL_CONFIG.configVersion,
      activeRun: active ? presentRun(readRunRow(active.run_id)) : null,
      personalBest: presentBest(best),
      milestones: SURVIVAL_CONFIG.milestones.map(milestone => ({ ...milestone, earned: earnedWaves.has(milestone.wave) })),
      leaderboard: listLeaderboard(playerId, { limit: '20' }),
    };
  }

  function listLeaderboard(playerId, value = {}) {
    playerRow(playerId);
    const query = normalizeSurvivalLeaderboardQuery(value);
    const rows = database.prepare(`
      SELECT best.player_id, players.display_name, best.run_id, best.score,
             best.highest_completed_wave, best.bosses_defeated, best.final_integrity,
             best.risk_level, best.loadout_summary_json, best.achieved_at
      FROM survival_best_scores AS best
      JOIN players ON players.id = best.player_id
      ORDER BY best.score DESC, best.highest_completed_wave DESC,
               best.bosses_defeated DESC, best.final_integrity DESC,
               best.achieved_at ASC, best.player_id ASC
    `).all();
    let offset = 0;
    if (query.cursor !== null) {
      try {
        const cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'));
        if (!cursor || typeof cursor.playerId !== 'string') throw new Error('invalid');
        const index = rows.findIndex(row => row.player_id === cursor.playerId
          && row.score === cursor.score
          && row.highest_completed_wave === cursor.wave
          && row.bosses_defeated === cursor.bosses
          && row.final_integrity === cursor.integrity
          && row.achieved_at === cursor.achievedAt);
        if (index < 0) throw new Error('stale');
        offset = index + 1;
      } catch {
        fail(400, 'INVALID_SURVIVAL_CURSOR', 'Survival leaderboard cursor is invalid or stale.');
      }
    }
    const page = rows.slice(offset, offset + query.limit);
    const entries = page.map((row, index) => ({
      rank: offset + index + 1,
      playerId: row.player_id,
      displayName: row.display_name,
      runId: row.run_id,
      score: row.score,
      highestCompletedWave: row.highest_completed_wave,
      bossesDefeated: row.bosses_defeated,
      finalIntegrity: row.final_integrity,
      riskLevel: row.risk_level,
      loadoutSummary: JSON.parse(row.loadout_summary_json),
      achievedAt: row.achieved_at,
    }));
    const last = page.at(-1);
    const nextCursor = offset + page.length < rows.length && last
      ? Buffer.from(JSON.stringify({
          playerId: last.player_id,
          score: last.score,
          wave: last.highest_completed_wave,
          bosses: last.bosses_defeated,
          integrity: last.final_integrity,
          achievedAt: last.achieved_at,
        })).toString('base64url')
      : null;
    const currentIndex = rows.findIndex(row => row.player_id === playerId);
    return { entries, nextCursor, currentRank: currentIndex < 0 ? null : currentIndex + 1 };
  }

  function listHistory(playerId, value = {}) {
    playerRow(playerId);
    const query = normalizeSurvivalHistoryQuery(value);
    const rows = database.prepare(`
      SELECT run_id, player_loadout_json, final_summary_json, completed_at
      FROM survival_runs
      WHERE player_id = ? AND status = 'completed' AND final_summary_json IS NOT NULL
      ORDER BY completed_at DESC, run_id DESC
    `).all(playerId).filter(row => JSON.parse(row.final_summary_json).abandoned === false);
    let offset = 0;
    if (query.cursor !== null) {
      try {
        const cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'));
        const index = rows.findIndex(row => row.run_id === cursor.runId && row.completed_at === cursor.achievedAt);
        if (index < 0) throw new Error('stale');
        offset = index + 1;
      } catch {
        fail(400, 'INVALID_SURVIVAL_HISTORY_CURSOR', 'Survival history cursor is invalid or stale.');
      }
    }
    const page = rows.slice(offset, offset + query.limit);
    const items = page.map(row => {
      const summary = JSON.parse(row.final_summary_json);
      return {
        runId: row.run_id,
        score: summary.score,
        highestCompletedWave: summary.highestCompletedWave,
        bossesDefeated: summary.bossesDefeated,
        finalIntegrity: summary.finalIntegrity,
        riskLevel: summary.riskLevel,
        loadoutSummary: JSON.parse(row.player_loadout_json),
        achievedAt: summary.achievedAt,
      };
    });
    const last = page.at(-1);
    const nextCursor = offset + page.length < rows.length && last
      ? Buffer.from(JSON.stringify({ runId: last.run_id, achievedAt: last.completed_at })).toString('base64url')
      : null;
    return { items, nextCursor };
  }

  function startRun(playerId, value) {
    const request = normalizeSurvivalStartRequest(value);
    const currentDate = validDate(now());
    database.exec('BEGIN IMMEDIATE');
    try {
      playerRow(playerId);
      const repeated = database.prepare(`
        SELECT run_id FROM survival_runs WHERE player_id = ? AND start_request_id = ?
      `).get(playerId, request.requestId);
      if (repeated) {
        const run = presentRun(readRunRow(repeated.run_id));
        database.exec('COMMIT');
        return { created: false, run };
      }
      const active = database.prepare(`
        SELECT run_id FROM survival_runs WHERE player_id = ? AND status != 'completed'
      `).get(playerId);
      if (active) {
        const run = presentRun(readRunRow(active.run_id));
        database.exec('COMMIT');
        return { created: false, run };
      }
      const progression = readPlayerProgression(database, playerId);
      if (progression.snapshot.latestNssLoadout === null) {
        fail(409, 'NSS_LOADOUT_REQUIRED', 'Sync an NSS V2 loadout before starting survival mode.');
      }
      const loadout = normalizeSurvivalLoadout(progression.snapshot.latestNssLoadout);
      const maximumIntegrity = campaignNssMaxIntegrity(loadout, ZERO_UPGRADES);
      const runId = createId();
      const seed = createSeed();
      if (typeof runId !== 'string' || runId.length !== 36 || typeof seed !== 'string' || !/^[0-9a-f]{32}$/.test(seed)) {
        fail(500, 'SURVIVAL_SERVICE_ERROR', 'Survival identity generator returned invalid data.');
      }
      const wave = generateSurvivalWave(seed, 1, 0);
      database.prepare(`
        INSERT INTO survival_runs (
          run_id, player_id, config_version, simulation_version, battle_rules_version,
          seed, status, player_loadout_json, player_max_integrity, current_wave,
          current_wave_json, integrity, burst_risk, persistent_debuffs_json,
          growth_levels_json, next_wave_effect, risk_level, score,
          flawless_streak, bosses_defeated, start_request_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'wave_ready', ?, ?, 1, ?, ?, 0, '[]', ?, NULL, 0, 0, 0, 0, ?, ?, ?)
      `).run(
        runId, playerId, SURVIVAL_CONFIG.configVersion, SURVIVAL_CONFIG.simulationVersion,
        SURVIVAL_CONFIG.battleRulesVersion, seed, JSON.stringify(loadout), maximumIntegrity,
        JSON.stringify(wave), maximumIntegrity, JSON.stringify(INITIAL_GROWTH),
        request.requestId, currentDate.toISOString(), currentDate.toISOString(),
      );
      const run = presentRun(readRunRow(runId));
      database.exec('COMMIT');
      return { created: true, run };
    } catch (error) {
      try { database.exec('ROLLBACK'); } catch { /* Preserve original error. */ }
      throw error;
    }
  }

  function submitWaveResult(runId, playerId, value) {
    const currentDate = validDate(now());
    database.exec('BEGIN IMMEDIATE');
    try {
      const repeated = value && typeof value === 'object' && typeof value.requestId === 'string'
        ? database.prepare(`
            SELECT run_id, result_json, settlement_json FROM survival_wave_results
            WHERE result_request_id = ?
          `).get(value.requestId.toLowerCase())
        : null;
      if (repeated) {
        const repeatedRun = readRunRow(repeated.run_id);
        if (repeatedRun.player_id !== playerId || repeated.run_id !== runId) {
          fail(409, 'SURVIVAL_REQUEST_CONFLICT', 'This result request ID belongs to another run.');
        }
        const stored = JSON.parse(repeated.result_json);
        const normalized = normalizeSurvivalResultRequest(value, {
          configVersion: stored.configVersion,
          simulationVersion: stored.simulationVersion,
          battleRulesVersion: stored.battleRulesVersion,
          seed: stored.outcome.seed,
          wave: stored.wave,
          maximumIntegrity: repeatedRun.player_max_integrity,
        });
        if (JSON.stringify(normalized) !== repeated.result_json) {
          fail(409, 'SURVIVAL_REQUEST_CONFLICT', 'This result request ID has different content.');
        }
        const settlement = JSON.parse(repeated.settlement_json);
        database.exec('COMMIT');
        return settlement;
      }

      const row = readRunRow(runId);
      if (row.player_id !== playerId) fail(403, 'SURVIVAL_RUN_FORBIDDEN', 'Only the run owner can submit this result.');
      if (row.status !== 'wave_ready') fail(409, 'STALE_SURVIVAL_STATE', 'This survival wave cannot accept a result.');
      const wave = JSON.parse(row.current_wave_json);
      const request = normalizeSurvivalResultRequest(value, {
        configVersion: row.config_version,
        simulationVersion: row.simulation_version,
        battleRulesVersion: row.battle_rules_version,
        seed: wave.seed,
        wave: row.current_wave,
        maximumIntegrity: row.player_max_integrity,
      });
      const requestJson = JSON.stringify(request);
      const won = request.outcome.winner === 'player';
      const flawless = won && request.outcome.player.integrity >= row.integrity;
      const flawlessStreak = flawless ? row.flawless_streak + 1 : 0;
      const score = won ? scoreSurvivalWave({
        wave: row.current_wave,
        type: wave.type,
        finishKind: request.outcome.kind,
        flawless,
        flawlessStreak,
        riskLevel: row.risk_level,
      }) : {
        base: 0, waveTypeBonus: 0, finishBonus: 0, flawlessBonus: 0,
        flawlessStreakBonus: 0, subtotal: 0, riskMultiplier: 1, score: 0,
      };
      const rewardState = {
        growthLevels: JSON.parse(row.growth_levels_json),
        maximumIntegrity: row.player_max_integrity,
        integrity: request.outcome.player.integrity,
        burstRisk: request.outcome.player.burst,
        persistentDebuffs: JSON.parse(row.persistent_debuffs_json),
        nextWaveEffect: null,
        riskLevel: row.risk_level,
      };
      const rewardOptions = won ? generateSurvivalRewards(row.seed, row.current_wave, rewardState) : [];
      database.prepare(`
        INSERT INTO survival_wave_results (
          run_id, wave, result_request_id, result_json, score_json, score,
          settlement_json, reward_options_json, settled_at
        ) VALUES (?, ?, ?, ?, ?, ?, '{}', ?, ?)
      `).run(
        runId, row.current_wave, request.requestId, requestJson, JSON.stringify(score),
        score.score, JSON.stringify(rewardOptions), currentDate.toISOString(),
      );

      let progression = readPlayerProgression(database, playerId);
      let milestone = null;
      const milestoneDefinition = won
        ? SURVIVAL_CONFIG.milestones.find(candidate => candidate.wave === row.current_wave)
        : null;
      if (milestoneDefinition) {
        const eventId = survivalEventUuid(`survival:${playerId}:milestone:${row.current_wave}`);
        const inserted = database.prepare(`
          INSERT OR IGNORE INTO wallet_events (player_id, event_id, kind, delta, metadata_json)
          VALUES (?, ?, 'credit', ?, ?)
        `).run(playerId, eventId, milestoneDefinition.coins, JSON.stringify({
          source: 'survival', wave: row.current_wave, runId,
        }));
        if (inserted.changes === 1) {
          database.prepare(`
            UPDATE player_progression
            SET coins = coins + ?, revision = revision + 1, updated_at = ?
            WHERE player_id = ?
          `).run(milestoneDefinition.coins, currentDate.toISOString(), playerId);
          milestone = { ...milestoneDefinition, eventId };
          progression = readPlayerProgression(database, playerId);
        }
      }

      const nextScore = row.score + score.score;
      const nextBosses = row.bosses_defeated + (won && wave.type === 'boss' ? 1 : 0);
      if (won) {
        database.prepare(`
          UPDATE survival_runs
          SET status = 'reward_pending', integrity = ?, burst_risk = ?,
              next_wave_effect = NULL, score = ?, flawless_streak = ?,
              bosses_defeated = ?, updated_at = ?
          WHERE run_id = ? AND status = 'wave_ready' AND current_wave = ?
        `).run(
          rewardState.integrity, rewardState.burstRisk, nextScore, flawlessStreak,
          nextBosses, currentDate.toISOString(), runId, row.current_wave,
        );
      } else {
        const summary = createSurvivalSummary(
          completedScores(runId), request.outcome.player.integrity, row.risk_level,
          currentDate.toISOString(), false,
        );
        database.prepare(`
          UPDATE survival_runs
          SET status = 'completed', integrity = ?, burst_risk = ?, next_wave_effect = NULL,
              final_summary_json = ?, updated_at = ?, completed_at = ?
          WHERE run_id = ? AND status = 'wave_ready' AND current_wave = ?
        `).run(
          request.outcome.player.integrity, request.outcome.player.burst, JSON.stringify(summary),
          currentDate.toISOString(), currentDate.toISOString(), runId, row.current_wave,
        );
        updateBest(readRunRow(runId), summary, currentDate.toISOString());
      }
      const settlement = {
        run: presentRun(readRunRow(runId)),
        score,
        rewardOptions,
        milestone,
        progression,
      };
      database.prepare(`
        UPDATE survival_wave_results SET settlement_json = ? WHERE run_id = ? AND wave = ?
      `).run(JSON.stringify(settlement), runId, row.current_wave);
      database.exec('COMMIT');
      return settlement;
    } catch (error) {
      try { database.exec('ROLLBACK'); } catch { /* Preserve original error. */ }
      throw error;
    }
  }

  function selectReward(runId, waveNumber, playerId, value) {
    const request = normalizeSurvivalRewardRequest(value);
    const requestJson = JSON.stringify(request.reward);
    const currentDate = validDate(now());
    database.exec('BEGIN IMMEDIATE');
    try {
      const repeated = database.prepare(`
        SELECT run_id, wave, selected_reward_json, checkpoint_after_json
        FROM survival_wave_results WHERE reward_request_id = ?
      `).get(request.requestId);
      if (repeated) {
        const repeatedRun = readRunRow(repeated.run_id);
        if (repeatedRun.player_id !== playerId || repeated.run_id !== runId || repeated.wave !== waveNumber
          || repeated.selected_reward_json !== requestJson) {
          fail(409, 'SURVIVAL_REQUEST_CONFLICT', 'This reward request ID has different content.');
        }
        const response = JSON.parse(repeated.checkpoint_after_json);
        database.exec('COMMIT');
        return response;
      }
      const row = readRunRow(runId);
      if (row.player_id !== playerId) fail(403, 'SURVIVAL_RUN_FORBIDDEN', 'Only the run owner can select this reward.');
      if (row.status !== 'reward_pending' || row.current_wave !== waveNumber) {
        fail(409, 'STALE_SURVIVAL_STATE', 'This survival reward is no longer pending.');
      }
      const audit = database.prepare(`
        SELECT reward_options_json FROM survival_wave_results WHERE run_id = ? AND wave = ?
      `).get(runId, waveNumber);
      const options = JSON.parse(audit.reward_options_json);
      if (!options.some(candidate => JSON.stringify(candidate) === requestJson)) {
        fail(400, 'INVALID_SURVIVAL_REWARD', 'The selected reward is not one of the frozen choices.');
      }
      const state = applySurvivalReward({
        growthLevels: JSON.parse(row.growth_levels_json),
        maximumIntegrity: row.player_max_integrity,
        integrity: row.integrity,
        burstRisk: row.burst_risk,
        persistentDebuffs: JSON.parse(row.persistent_debuffs_json),
        nextWaveEffect: row.next_wave_effect,
        riskLevel: row.risk_level,
      }, request.reward);
      const nextWaveNumber = waveNumber + 1;
      const nextWave = generateSurvivalWave(row.seed, nextWaveNumber, state.riskLevel);
      database.prepare(`
        UPDATE survival_runs
        SET status = 'wave_ready', current_wave = ?, current_wave_json = ?,
            integrity = ?, burst_risk = ?, persistent_debuffs_json = ?,
            growth_levels_json = ?, next_wave_effect = ?, risk_level = ?, updated_at = ?
        WHERE run_id = ? AND status = 'reward_pending' AND current_wave = ?
      `).run(
        nextWaveNumber, JSON.stringify(nextWave), state.integrity, state.burstRisk,
        JSON.stringify(state.persistentDebuffs), JSON.stringify(state.growthLevels),
        state.nextWaveEffect, state.riskLevel, currentDate.toISOString(), runId, waveNumber,
      );
      const response = { run: presentRun(readRunRow(runId)) };
      database.prepare(`
        UPDATE survival_wave_results
        SET reward_request_id = ?, selected_reward_json = ?, checkpoint_after_json = ?, rewarded_at = ?
        WHERE run_id = ? AND wave = ? AND reward_request_id IS NULL
      `).run(
        request.requestId, requestJson, JSON.stringify(response), currentDate.toISOString(), runId, waveNumber,
      );
      database.exec('COMMIT');
      return response;
    } catch (error) {
      try { database.exec('ROLLBACK'); } catch { /* Preserve original error. */ }
      throw error;
    }
  }

  function abandonRun(runId, playerId, value) {
    const request = normalizeSurvivalAbandonRequest(value);
    const currentDate = validDate(now());
    database.exec('BEGIN IMMEDIATE');
    try {
      const row = readRunRow(runId);
      if (row.player_id !== playerId) fail(403, 'SURVIVAL_RUN_FORBIDDEN', 'Only the run owner can abandon this survival run.');
      if (row.status === 'completed') {
        if (row.abandon_request_id === request.requestId) {
          const run = presentRun(row);
          database.exec('COMMIT');
          return run;
        }
        fail(409, 'STALE_SURVIVAL_STATE', 'This survival run is already completed.');
      }
      const summary = createSurvivalSummary(
        completedScores(runId), row.integrity, row.risk_level, currentDate.toISOString(), true,
      );
      database.prepare(`
        UPDATE survival_runs
        SET status = 'completed', abandon_request_id = ?, final_summary_json = ?,
            updated_at = ?, completed_at = ?
        WHERE run_id = ? AND status != 'completed'
      `).run(request.requestId, JSON.stringify(summary), currentDate.toISOString(), currentDate.toISOString(), runId);
      updateBest(readRunRow(runId), summary, currentDate.toISOString());
      const run = presentRun(readRunRow(runId));
      database.exec('COMMIT');
      return run;
    } catch (error) {
      try { database.exec('ROLLBACK'); } catch { /* Preserve original error. */ }
      throw error;
    }
  }

  return { abandonRun, getHub, getRun, listHistory, listLeaderboard, selectReward, startRun, submitWaveResult };
}
