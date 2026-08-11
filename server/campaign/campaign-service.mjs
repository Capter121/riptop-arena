import { randomBytes, randomUUID } from 'node:crypto';
import { readPlayerProgression } from '../progression/progression-service.mjs';
import { CAMPAIGN_CATALOG, CAMPAIGN_OPPONENT_BY_ID } from './campaign-catalog.mjs';
import {
  campaignEventUuid,
  campaignWinCoins,
  compareCampaignOutcomes,
  evaluateCampaignStars,
  mergeCampaignStars,
  nextCampaignOpponentIndex,
  selectCampaignRotation,
} from '../../shared/campaign/campaign-rules.js';
import {
  CampaignError,
  campaignAffinitySummary,
  campaignNssMaxIntegrity,
  createCampaignNssLoadout,
  normalizeCampaignResultRequest,
  normalizeCampaignStartRequest,
} from './campaign-contract.mjs';

export { CampaignError } from './campaign-contract.mjs';

const LEGACY_PART_PRICES = Object.freeze({
  slash: 320,
  drift: 280,
  light: 300,
  bulwark: 560,
  heavy: 520,
  rush: 540,
});

function fail(status, code, message) {
  throw new CampaignError(status, code, message);
}

function validDate(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(date.getTime())) fail(500, 'CAMPAIGN_SERVICE_ERROR', 'Campaign clock returned an invalid time.');
  return date;
}

function bitCount(mask) {
  return [1, 2, 4].reduce((total, bit) => total + (mask & bit ? 1 : 0), 0);
}

export function createCampaignService(database, options = {}) {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? (() => randomUUID());
  const createSeed = options.createSeed ?? (() => randomBytes(16).toString('hex'));

  function assertPlayer(playerId) {
    const player = database.prepare('SELECT display_name FROM players WHERE id = ?').get(playerId);
    if (!player) fail(404, 'PLAYER_NOT_FOUND', 'Campaign player was not found.');
    return player;
  }

  function progressRows(playerId) {
    return new Map(database.prepare(`
      SELECT opponent_id, stars_mask, defeated, attempt_count, best_outcome_json, updated_at
      FROM campaign_progress WHERE player_id = ?
    `).all(playerId).map(row => [row.opponent_id, row]));
  }

  function getArchive(playerId) {
    assertPlayer(playerId);
    const rows = progressRows(playerId);
    const defeated = CAMPAIGN_CATALOG.opponents.map(opponent => rows.get(opponent.id)?.defeated === 1);
    const nextIndex = nextCampaignOpponentIndex(defeated);
    const progression = readPlayerProgression(database, playerId);
    const opponents = CAMPAIGN_CATALOG.opponents.map((opponent, index) => {
      const row = rows.get(opponent.id);
      return {
        ...opponent,
        unlocked: index === 0 || defeated[index - 1],
        starsMask: row?.stars_mask ?? 0,
        defeated: row?.defeated === 1,
        attemptCount: row?.attempt_count ?? 0,
        bestOutcome: row?.best_outcome_json ? JSON.parse(row.best_outcome_json) : null,
      };
    });
    return {
      configVersion: CAMPAIGN_CATALOG.configVersion,
      aiProfiles: CAMPAIGN_CATALOG.aiProfiles,
      opponents,
      totalStars: opponents.reduce((total, opponent) => total + bitCount(opponent.starsMask), 0),
      nextOpponentId: CAMPAIGN_CATALOG.opponents[nextIndex].id,
      championshipCount: progression.snapshot.championshipCount,
    };
  }

  function readAttemptRow(attemptId) {
    const row = database.prepare(`
      SELECT attempt_id, player_id, opponent_id, config_version, simulation_version,
             seed, loadout_index, arena, ai_profile_id,
             player_loadout_json, player_upgrades_json, enemy_loadout_json, enemy_upgrades_json,
             player_max_integrity, start_request_id, result_request_id,
             result_json, settlement_json, started_at, completed_at
      FROM campaign_attempts WHERE attempt_id = ?
    `).get(attemptId);
    if (!row) fail(404, 'CAMPAIGN_ATTEMPT_NOT_FOUND', 'Campaign attempt was not found.');
    return row;
  }

  function presentAttempt(row) {
    const opponent = CAMPAIGN_OPPONENT_BY_ID.get(row.opponent_id);
    const player = assertPlayer(row.player_id);
    const playerLoadout = JSON.parse(row.player_loadout_json);
    return {
      attemptId: row.attempt_id,
      configVersion: row.config_version,
      simulationVersion: row.simulation_version,
      seed: row.seed,
      loadoutIndex: row.loadout_index,
      arena: row.arena,
      aiProfileId: row.ai_profile_id,
      opponent: { id: opponent.id, index: opponent.index, name: opponent.name, theme: opponent.theme, tutorial: opponent.tutorial },
      objectives: opponent.objectives,
      player: {
        playerId: row.player_id,
        displayName: player.display_name,
        loadout: playerLoadout,
        upgrades: JSON.parse(row.player_upgrades_json).upgrades,
        maxIntegrity: row.player_max_integrity,
      },
      enemy: {
        displayName: opponent.name,
        loadout: JSON.parse(row.enemy_loadout_json),
        upgrades: JSON.parse(row.enemy_upgrades_json),
      },
      startedAt: row.started_at,
    };
  }

  function startAttempt(playerId, value) {
    const request = normalizeCampaignStartRequest(value);
    const opponent = CAMPAIGN_OPPONENT_BY_ID.get(request.opponentId);
    if (!opponent) fail(404, 'CAMPAIGN_OPPONENT_NOT_FOUND', 'Campaign opponent was not found.');
    const currentDate = validDate(now());
    database.exec('BEGIN IMMEDIATE');
    try {
      assertPlayer(playerId);
      const existing = database.prepare(`
        SELECT attempt_id, opponent_id FROM campaign_attempts
        WHERE player_id = ? AND start_request_id = ?
      `).get(playerId, request.requestId);
      if (existing) {
        if (existing.opponent_id !== request.opponentId) fail(409, 'CAMPAIGN_IDEMPOTENCY_MISMATCH', 'This request ID was used for another opponent.');
        const attempt = presentAttempt(readAttemptRow(existing.attempt_id));
        database.exec('COMMIT');
        return attempt;
      }
      if (opponent.index > 0) {
        const predecessor = CAMPAIGN_CATALOG.opponents[opponent.index - 1];
        const unlocked = database.prepare(`
          SELECT defeated FROM campaign_progress WHERE player_id = ? AND opponent_id = ?
        `).get(playerId, predecessor.id)?.defeated === 1;
        if (!unlocked) fail(409, 'CAMPAIGN_OPPONENT_LOCKED', 'Defeat the previous opponent first.');
      }
      const progression = readPlayerProgression(database, playerId);
      if (progression.snapshot.latestNssLoadout === null) fail(409, 'NSS_LOADOUT_REQUIRED', 'Sync an NSS loadout before starting a campaign battle.');
      database.prepare(`
        INSERT INTO campaign_progress (player_id, opponent_id)
        VALUES (?, ?) ON CONFLICT (player_id, opponent_id) DO NOTHING
      `).run(playerId, opponent.id);
      const progress = database.prepare(`
        SELECT attempt_count FROM campaign_progress WHERE player_id = ? AND opponent_id = ?
      `).get(playerId, opponent.id);
      const rotation = selectCampaignRotation(progress.attempt_count, opponent.loadouts.length, opponent.arenas.length);
      const enemyLoadout = createCampaignNssLoadout(opponent.loadouts[rotation.loadoutIndex]);
      const playerUpgrades = {
        upgrades: { ...progression.snapshot.upgrades },
        partUpgrades: { ...progression.snapshot.partUpgrades },
      };
      const playerMaxIntegrity = campaignNssMaxIntegrity(progression.snapshot.latestNssLoadout, playerUpgrades.upgrades);
      const attemptId = createId();
      const seed = createSeed();
      database.prepare(`
        INSERT INTO campaign_attempts (
          attempt_id, player_id, opponent_id, config_version, simulation_version,
          seed, loadout_index, arena, ai_profile_id,
          player_loadout_json, player_upgrades_json, enemy_loadout_json, enemy_upgrades_json,
          player_max_integrity, start_request_id, started_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        attemptId, playerId, opponent.id, CAMPAIGN_CATALOG.configVersion, 1,
        seed, rotation.loadoutIndex, opponent.arenas[rotation.arenaIndex], opponent.aiProfileId,
        JSON.stringify(progression.snapshot.latestNssLoadout), JSON.stringify(playerUpgrades),
        JSON.stringify(enemyLoadout), JSON.stringify(opponent.upgrades),
        playerMaxIntegrity, request.requestId, currentDate.toISOString(),
      );
      database.prepare(`
        UPDATE campaign_progress
        SET attempt_count = attempt_count + 1, updated_at = ?
        WHERE player_id = ? AND opponent_id = ?
      `).run(currentDate.toISOString(), playerId, opponent.id);
      const attempt = presentAttempt(readAttemptRow(attemptId));
      database.exec('COMMIT');
      return attempt;
    } catch (error) {
      try { database.exec('ROLLBACK'); } catch { /* Preserve original error. */ }
      throw error;
    }
  }

  function submitResult(attemptId, playerId, value) {
    const request = normalizeCampaignResultRequest(value);
    const currentDate = validDate(now());
    database.exec('BEGIN IMMEDIATE');
    try {
      const attempt = readAttemptRow(attemptId);
      if (attempt.player_id !== playerId) fail(403, 'CAMPAIGN_RESULT_FORBIDDEN', 'Only the attempt owner can submit its result.');
      const resultJson = JSON.stringify(request.outcome);
      if (attempt.completed_at !== null) {
        if (attempt.result_request_id === request.requestId && attempt.result_json === resultJson) {
          const settlement = JSON.parse(attempt.settlement_json);
          database.exec('COMMIT');
          return settlement;
        }
        fail(409, 'CAMPAIGN_RESULT_CONFLICT', 'This attempt already has a different final result.');
      }
      if (request.outcome.seed !== attempt.seed || request.outcome.simulationVersion !== attempt.simulation_version) {
        fail(400, 'CAMPAIGN_RESULT_MISMATCH', 'Battle result does not match the frozen attempt.');
      }
      if (request.outcome.player.integrity < 0 || request.outcome.player.integrity > attempt.player_max_integrity) {
        fail(400, 'INVALID_BATTLE_OUTCOME', 'Player integrity is outside the frozen attempt range.');
      }

      const opponent = CAMPAIGN_OPPONENT_BY_ID.get(attempt.opponent_id);
      const progress = database.prepare(`
        SELECT stars_mask, defeated, best_outcome_json
        FROM campaign_progress WHERE player_id = ? AND opponent_id = ?
      `).get(playerId, opponent.id);
      const playerLoadout = JSON.parse(attempt.player_loadout_json);
      const affinity = campaignAffinitySummary(playerLoadout.affinities);
      const earnedStarsMask = evaluateCampaignStars(opponent, affinity, request.outcome, attempt.player_max_integrity);
      const newStarsMask = earnedStarsMask & ~progress.stars_mask;
      const firstWin = request.outcome.winner === 'player' && progress.defeated === 0;
      const previousBest = progress.best_outcome_json ? JSON.parse(progress.best_outcome_json) : null;
      const nextBest = request.outcome.winner === 'player'
        && compareCampaignOutcomes(request.outcome, previousBest) > 0
        ? request.outcome
        : previousBest;

      const progression = readPlayerProgression(database, playerId);
      const snapshot = structuredClone(progression.snapshot);
      let coins = progression.coins;
      const rewardEvents = [];
      const rewards = {
        battleCoins: 0,
        firstWinCoins: 0,
        starCoins: 0,
        partUnlocked: null,
        partConversionCoins: 0,
        championshipCrowns: 0,
      };
      const insertWallet = database.prepare(`
        INSERT OR IGNORE INTO wallet_events (player_id, event_id, kind, delta, metadata_json)
        VALUES (?, ?, 'credit', ?, ?)
      `);
      const credit = (logicalKey, amount, kind) => {
        if (amount <= 0) return;
        const eventId = campaignEventUuid(logicalKey);
        const insert = insertWallet.run(playerId, eventId, amount, JSON.stringify({ source: 'campaign', logicalKey, opponentId: opponent.id, kind }));
        if (insert.changes === 1) {
          coins += amount;
          rewardEvents.push({ eventId, logicalKey, amount, kind });
        }
      };

      if (request.outcome.winner === 'player') {
        rewards.battleCoins = campaignWinCoins(opponent.index, request.outcome.kind);
        credit(`campaign:attempt:${attemptId}:win`, rewards.battleCoins, 'battle');
        if (firstWin) {
          rewards.firstWinCoins = opponent.rewards.firstWinCoins;
          credit(`campaign:${opponent.id}:first-win`, rewards.firstWinCoins, 'first-win');
          const unlockPartId = opponent.rewards.unlockPartId;
          if (unlockPartId && snapshot.unlockedParts.includes(unlockPartId)) {
            rewards.partConversionCoins = LEGACY_PART_PRICES[unlockPartId];
            credit(`campaign:${opponent.id}:part-conversion`, rewards.partConversionCoins, 'part-conversion');
          } else if (unlockPartId) {
            snapshot.unlockedParts = [...snapshot.unlockedParts, unlockPartId].sort();
            rewards.partUnlocked = unlockPartId;
          }
          if (opponent.rewards.championshipCrowns > 0) {
            snapshot.championshipCount += opponent.rewards.championshipCrowns;
            rewards.championshipCrowns = opponent.rewards.championshipCrowns;
          }
        }
        if (newStarsMask & 2) {
          rewards.starCoins += opponent.rewards.starCoins;
          credit(`campaign:${opponent.id}:star:2`, opponent.rewards.starCoins, 'star-2');
        }
        if (newStarsMask & 4) {
          rewards.starCoins += opponent.rewards.starCoins;
          credit(`campaign:${opponent.id}:star:3`, opponent.rewards.starCoins, 'star-3');
        }
        database.prepare(`
          UPDATE campaign_progress
          SET stars_mask = ?, defeated = 1, best_outcome_json = ?, updated_at = ?
          WHERE player_id = ? AND opponent_id = ?
        `).run(
          mergeCampaignStars(progress.stars_mask, earnedStarsMask),
          nextBest ? JSON.stringify(nextBest) : null,
          currentDate.toISOString(), playerId, opponent.id,
        );
      }

      const progressionChanged = rewardEvents.length > 0 || JSON.stringify(snapshot) !== JSON.stringify(progression.snapshot);
      const revision = progression.revision + (progressionChanged ? 1 : 0);
      if (progressionChanged) {
        database.prepare(`
          UPDATE player_progression
          SET snapshot_json = ?, coins = ?, revision = ?, updated_at = ?
          WHERE player_id = ?
        `).run(JSON.stringify(snapshot), coins, revision, currentDate.toISOString(), playerId);
      }
      const authoritativeProgression = readPlayerProgression(database, playerId);
      const settlement = {
        attemptId,
        opponentId: opponent.id,
        earnedStarsMask,
        newStarsMask,
        rewards,
        rewardEvents,
        progression: authoritativeProgression,
        progress: getArchive(playerId),
        completedAt: currentDate.toISOString(),
      };
      const update = database.prepare(`
        UPDATE campaign_attempts
        SET result_request_id = ?, result_json = ?, settlement_json = ?, completed_at = ?
        WHERE attempt_id = ? AND completed_at IS NULL
      `).run(request.requestId, resultJson, JSON.stringify(settlement), currentDate.toISOString(), attemptId);
      if (update.changes !== 1) fail(409, 'CAMPAIGN_RESULT_CONFLICT', 'This attempt already has a final result.');
      database.exec('COMMIT');
      return settlement;
    } catch (error) {
      try { database.exec('ROLLBACK'); } catch { /* Preserve original error. */ }
      throw error;
    }
  }

  return { getArchive, startAttempt, submitResult };
}
