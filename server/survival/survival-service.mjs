import { randomBytes, randomUUID } from 'node:crypto';
import { readPlayerProgression } from '../progression/progression-service.mjs';
import { campaignNssMaxIntegrity } from '../campaign/campaign-contract.mjs';
import {
  SURVIVAL_CONFIG,
  generateSurvivalWave,
} from './survival-config.mjs';
import {
  SurvivalError,
  normalizeSurvivalAbandonRequest,
  normalizeSurvivalLoadout,
  normalizeSurvivalStartRequest,
} from './survival-contract.mjs';
import { createSurvivalSummary } from '../../shared/survival/survival-rules.js';

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
    };
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
      const scores = database.prepare(`
        SELECT wave, score FROM survival_wave_results WHERE run_id = ? ORDER BY wave
      `).all(runId).map(result => ({
        wave: result.wave,
        type: SURVIVAL_CONFIG.wavePattern[(result.wave - 1) % SURVIVAL_CONFIG.wavePattern.length],
        score: result.score,
      }));
      const summary = createSurvivalSummary(scores, row.integrity, row.risk_level, currentDate.toISOString(), true);
      database.prepare(`
        UPDATE survival_runs
        SET status = 'completed', abandon_request_id = ?, final_summary_json = ?,
            updated_at = ?, completed_at = ?
        WHERE run_id = ? AND status != 'completed'
      `).run(request.requestId, JSON.stringify(summary), currentDate.toISOString(), currentDate.toISOString(), runId);
      const run = presentRun(readRunRow(runId));
      database.exec('COMMIT');
      return run;
    } catch (error) {
      try { database.exec('ROLLBACK'); } catch { /* Preserve original error. */ }
      throw error;
    }
  }

  return { abandonRun, getHub, getRun, startRun };
}
