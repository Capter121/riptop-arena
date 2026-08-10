import { randomBytes, randomUUID } from 'node:crypto';
import {
  CHALLENGE_CONTRACT,
  ChallengeError,
  normalizeChallengeInput,
  normalizeChallengeOffer,
  normalizeCreateOfferRequest,
} from './challenge-contract.mjs';
import { readPlayerProgression } from '../progression/progression-service.mjs';

export { ChallengeError } from './challenge-contract.mjs';

const OFFER_LIFETIME_MS = 24 * 60 * 60 * 1_000;

function fail(status, code, message) {
  throw new ChallengeError(status, code, message);
}

function dateFrom(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(date.getTime())) fail(500, 'CHALLENGE_SERVICE_ERROR', 'Challenge clock returned an invalid time.');
  return date;
}

function zeroUpgradeSnapshot(snapshot) {
  return {
    upgrades: Object.fromEntries(Object.keys(snapshot.upgrades).map(key => [key, 0])),
    partUpgrades: Object.fromEntries(Object.keys(snapshot.partUpgrades).map(key => [key, 0])),
  };
}

function fullUpgradeSnapshot(snapshot) {
  return {
    upgrades: { ...snapshot.upgrades },
    partUpgrades: { ...snapshot.partUpgrades },
  };
}

function requestFromOffer(row, offer) {
  return {
    requestId: row.creation_request_id,
    mode: offer.mode,
    arena: offer.arena,
    message: offer.message,
  };
}

export function createChallengeService(database, options = {}) {
  const now = options.now ?? (() => new Date());
  const createSeed = options.createSeed ?? (() => randomBytes(16).toString('hex'));
  const createId = options.createId ?? (() => randomUUID());

  function readOfferRow(offerId) {
    const row = database.prepare(`
      SELECT id, creator_player_id, target_player_id, parent_challenge_id,
             creation_request_id, status, offer_json, expires_at,
             claimed_challenge_id, created_at, updated_at
      FROM challenge_offers
      WHERE id = ?
    `).get(offerId);
    if (!row) fail(404, 'OFFER_NOT_FOUND', 'Challenge offer was not found.');
    return row;
  }

  function readChallengeRow(challengeId) {
    const row = database.prepare(`
      SELECT id, creator_player_id, recipient_player_id, status, input_json,
             result_json, offer_id, parent_challenge_id, result_submission_id,
             created_at, updated_at, completed_at
      FROM challenges
      WHERE id = ?
    `).get(challengeId);
    if (!row) fail(404, 'CHALLENGE_NOT_FOUND', 'Challenge was not found.');
    return row;
  }

  function presentOffer(row, viewerId, currentDate) {
    const offer = normalizeChallengeOffer(JSON.parse(row.offer_json));
    const isCreator = row.creator_player_id === viewerId;
    const isTarget = row.target_player_id === viewerId;
    if (row.target_player_id !== null && !isCreator && !isTarget) {
      fail(403, 'OFFER_FORBIDDEN', 'This targeted challenge offer is private.');
    }
    if (row.status === 'claimed' && !isCreator) {
      const recipient = row.claimed_challenge_id === null
        ? null
        : database.prepare('SELECT recipient_player_id FROM challenges WHERE id = ?').get(row.claimed_challenge_id);
      if (recipient?.recipient_player_id !== viewerId) {
        fail(403, 'OFFER_FORBIDDEN', 'This claimed challenge offer is private.');
      }
    }
    const expired = row.status === 'open' && currentDate.getTime() >= Date.parse(row.expires_at);
    const status = expired ? 'expired' : row.status;
    return {
      id: row.id,
      status,
      targetPlayerId: row.target_player_id,
      parentChallengeId: row.parent_challenge_id,
      claimedChallengeId: row.claimed_challenge_id,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      offer,
      actions: {
        canClaim: status === 'open' && !isCreator && (row.target_player_id === null || isTarget),
        canRevoke: status === 'open' && isCreator,
      },
    };
  }

  function createOffer(creatorPlayerId, value) {
    const request = normalizeCreateOfferRequest(value);
    const existing = database.prepare(`
      SELECT id, creator_player_id, target_player_id, parent_challenge_id,
             creation_request_id, status, offer_json, expires_at,
             claimed_challenge_id, created_at, updated_at
      FROM challenge_offers
      WHERE creator_player_id = ? AND creation_request_id = ?
    `).get(creatorPlayerId, request.requestId);
    if (existing) {
      const existingOffer = normalizeChallengeOffer(JSON.parse(existing.offer_json));
      const existingRequest = normalizeCreateOfferRequest(requestFromOffer(existing, existingOffer));
      if (JSON.stringify(existingRequest) !== JSON.stringify(request)) {
        fail(409, 'IDEMPOTENCY_MISMATCH', 'This request ID was already used with different challenge options.');
      }
      return presentOffer(existing, creatorPlayerId, dateFrom(now()));
    }

    const player = database.prepare('SELECT display_name FROM players WHERE id = ?').get(creatorPlayerId);
    if (!player) fail(404, 'PLAYER_NOT_FOUND', 'Challenge creator was not found.');
    const progression = readPlayerProgression(database, creatorPlayerId);
    if (progression.snapshot.latestNssLoadout === null) {
      fail(409, 'NSS_LOADOUT_REQUIRED', 'Create and sync an NSS loadout before making a challenge.');
    }

    const createdAt = dateFrom(now());
    const expiresAt = new Date(createdAt.getTime() + OFFER_LIFETIME_MS);
    const upgrades = request.mode === 'fair'
      ? zeroUpgradeSnapshot(progression.snapshot)
      : fullUpgradeSnapshot(progression.snapshot);
    const offer = normalizeChallengeOffer({
      ...CHALLENGE_CONTRACT,
      seed: createSeed(),
      mode: request.mode,
      creator: {
        playerId: creatorPlayerId,
        displayName: player.display_name,
        loadout: progression.snapshot.latestNssLoadout,
        upgrades,
      },
      arena: request.arena,
      aiConfig: 'deterministic-v1',
      message: request.message,
    });
    const id = createId();
    database.prepare(`
      INSERT INTO challenge_offers (
        id, creator_player_id, creation_request_id, status, offer_json,
        expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'open', ?, ?, ?, ?)
    `).run(
      id,
      creatorPlayerId,
      request.requestId,
      JSON.stringify(offer),
      expiresAt.toISOString(),
      createdAt.toISOString(),
      createdAt.toISOString(),
    );
    return presentOffer(readOfferRow(id), creatorPlayerId, createdAt);
  }

  function getOffer(offerId, viewerId) {
    if (typeof viewerId !== 'string'
      || !database.prepare('SELECT 1 FROM players WHERE id = ?').get(viewerId)) {
      fail(401, 'AUTH_REQUIRED', 'Authentication is required to view a challenge offer.');
    }
    return presentOffer(readOfferRow(offerId), viewerId, dateFrom(now()));
  }

  function revokeOffer(offerId, viewerId) {
    const row = readOfferRow(offerId);
    if (row.creator_player_id !== viewerId) fail(403, 'OFFER_FORBIDDEN', 'Only the creator can revoke this offer.');
    if (row.status === 'revoked') return presentOffer(row, viewerId, dateFrom(now()));
    if (row.status === 'claimed') fail(409, 'OFFER_ALREADY_CLAIMED', 'A claimed challenge offer cannot be revoked.');
    const currentDate = dateFrom(now());
    if (currentDate.getTime() >= Date.parse(row.expires_at)) fail(409, 'OFFER_EXPIRED', 'An expired challenge offer cannot be revoked.');
    const result = database.prepare(`
      UPDATE challenge_offers
      SET status = 'revoked', updated_at = ?
      WHERE id = ? AND status = 'open'
    `).run(currentDate.toISOString(), offerId);
    if (result.changes !== 1) fail(409, 'OFFER_STATE_CHANGED', 'Challenge offer state changed.');
    return presentOffer(readOfferRow(offerId), viewerId, currentDate);
  }

  function presentChallenge(row, viewerId) {
    if (row.creator_player_id !== viewerId && row.recipient_player_id !== viewerId) {
      fail(403, 'CHALLENGE_FORBIDDEN', 'Only challenge participants can view this challenge.');
    }
    const isAsyncChallenge = row.offer_id !== null;
    return {
      id: row.id,
      status: row.status,
      creatorPlayerId: row.creator_player_id,
      recipientPlayerId: row.recipient_player_id,
      offerId: row.offer_id,
      parentChallengeId: row.parent_challenge_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      input: isAsyncChallenge
        ? normalizeChallengeInput(JSON.parse(row.input_json))
        : JSON.parse(row.input_json),
      result: row.result_json === null ? null : JSON.parse(row.result_json),
      actions: {
        canBattle: isAsyncChallenge && row.status === 'pending' && row.recipient_player_id === viewerId,
        canRematch: isAsyncChallenge && row.status === 'completed' && row.recipient_player_id === viewerId,
      },
    };
  }

  function claimOffer(offerId, claimantPlayerId) {
    const currentDate = dateFrom(now());
    const challengeId = createId();
    database.exec('BEGIN IMMEDIATE');
    try {
      const row = readOfferRow(offerId);
      if (row.status === 'claimed') fail(409, 'OFFER_ALREADY_CLAIMED', 'This challenge offer was already claimed.');
      if (row.status === 'revoked') fail(409, 'OFFER_REVOKED', 'This challenge offer was revoked.');
      if (currentDate.getTime() >= Date.parse(row.expires_at)) fail(409, 'OFFER_EXPIRED', 'This challenge offer has expired.');
      if (row.creator_player_id === claimantPlayerId) {
        fail(403, 'SELF_CLAIM_FORBIDDEN', 'A creator cannot claim their own challenge offer.');
      }
      if (row.target_player_id !== null && row.target_player_id !== claimantPlayerId) {
        fail(403, 'OFFER_FORBIDDEN', 'This challenge offer targets another player.');
      }
      const claimant = database.prepare('SELECT display_name FROM players WHERE id = ?').get(claimantPlayerId);
      if (!claimant) fail(404, 'PLAYER_NOT_FOUND', 'Challenge claimant was not found.');
      const progression = readPlayerProgression(database, claimantPlayerId);
      if (progression.snapshot.latestNssLoadout === null) {
        fail(409, 'NSS_LOADOUT_REQUIRED', 'Create and sync an NSS loadout before claiming a challenge.');
      }
      const offer = normalizeChallengeOffer(JSON.parse(row.offer_json));
      const playerUpgrades = offer.mode === 'fair'
        ? zeroUpgradeSnapshot(progression.snapshot)
        : fullUpgradeSnapshot(progression.snapshot);
      const input = normalizeChallengeInput({
        ...CHALLENGE_CONTRACT,
        offerId: row.id,
        parentChallengeId: row.parent_challenge_id,
        seed: offer.seed,
        mode: offer.mode,
        arena: offer.arena,
        aiConfig: offer.aiConfig,
        player: {
          playerId: claimantPlayerId,
          displayName: claimant.display_name,
          loadout: progression.snapshot.latestNssLoadout,
          upgrades: playerUpgrades,
        },
        enemy: offer.creator,
      });
      database.prepare(`
        INSERT INTO challenges (
          id, creator_player_id, recipient_player_id, status, input_json,
          offer_id, parent_challenge_id, created_at, updated_at
        ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)
      `).run(
        challengeId,
        row.creator_player_id,
        claimantPlayerId,
        JSON.stringify(input),
        row.id,
        row.parent_challenge_id,
        currentDate.toISOString(),
        currentDate.toISOString(),
      );
      const update = database.prepare(`
        UPDATE challenge_offers
        SET status = 'claimed', claimed_challenge_id = ?, updated_at = ?
        WHERE id = ? AND status = 'open'
      `).run(challengeId, currentDate.toISOString(), row.id);
      if (update.changes !== 1) fail(409, 'OFFER_ALREADY_CLAIMED', 'This challenge offer was already claimed.');
      database.exec('COMMIT');
    } catch (error) {
      try {
        database.exec('ROLLBACK');
      } catch {
        // Preserve the original claim error.
      }
      throw error;
    }
    return presentChallenge(readChallengeRow(challengeId), claimantPlayerId);
  }

  function getChallenge(challengeId, viewerId) {
    return presentChallenge(readChallengeRow(challengeId), viewerId);
  }

  function cursorKey(item) {
    return `${item.kind}:${item.id}`;
  }

  function decodeCursor(cursor) {
    if (cursor === undefined) return null;
    try {
      const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).sort().join(',') !== 'id,time,version'
        || value.version !== 1
        || typeof value.time !== 'string'
        || !Number.isFinite(Date.parse(value.time))
        || typeof value.id !== 'string') {
        throw new Error('invalid cursor');
      }
      return value;
    } catch {
      fail(400, 'INVALID_CHALLENGE_REQUEST', 'Challenge cursor is invalid.');
    }
  }

  function encodeCursor(item) {
    return Buffer.from(JSON.stringify({
      version: 1,
      time: item.updatedAt,
      id: cursorKey(item),
    })).toString('base64url');
  }

  function collectGroup(viewerId, group, currentDate) {
    const items = [];
    if (group === 'waiting_me') {
      const offerRows = database.prepare(`
        SELECT id, creator_player_id, target_player_id, parent_challenge_id,
               creation_request_id, status, offer_json, expires_at,
               claimed_challenge_id, created_at, updated_at
        FROM challenge_offers
        WHERE target_player_id = ? AND status = 'open'
      `).all(viewerId);
      for (const row of offerRows) {
        const offer = presentOffer(row, viewerId, currentDate);
        if (offer.status === 'open') items.push({ kind: 'offer', ...offer });
      }
    }
    if (group === 'waiting_friend') {
      const offerRows = database.prepare(`
        SELECT id, creator_player_id, target_player_id, parent_challenge_id,
               creation_request_id, status, offer_json, expires_at,
               claimed_challenge_id, created_at, updated_at
        FROM challenge_offers
        WHERE creator_player_id = ? AND status = 'open'
      `).all(viewerId);
      for (const row of offerRows) {
        const offer = presentOffer(row, viewerId, currentDate);
        if (offer.status === 'open') items.push({ kind: 'offer', ...offer });
      }
    }
    const challengeRows = group === 'waiting_me'
      ? database.prepare(`
          SELECT * FROM challenges
          WHERE recipient_player_id = ? AND status = 'pending' AND offer_id IS NOT NULL
        `).all(viewerId)
      : group === 'waiting_friend'
        ? database.prepare(`
            SELECT * FROM challenges
            WHERE creator_player_id = ? AND status = 'pending' AND offer_id IS NOT NULL
          `).all(viewerId)
        : database.prepare(`
            SELECT * FROM challenges
            WHERE status = 'completed' AND (creator_player_id = ? OR recipient_player_id = ?)
          `).all(viewerId, viewerId);
    for (const row of challengeRows) {
      items.push({ kind: 'challenge', ...presentChallenge(row, viewerId) });
    }
    return items.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)
      || cursorKey(right).localeCompare(cursorKey(left)));
  }

  function listChallenges(viewerId, optionsValue = {}) {
    const keys = Object.keys(optionsValue).sort().join(',');
    if (!['group', 'group,limit', 'cursor,group', 'cursor,group,limit'].includes(keys)) {
      fail(400, 'INVALID_CHALLENGE_REQUEST', 'Challenge list options contain invalid keys.');
    }
    const { group } = optionsValue;
    if (!['waiting_me', 'waiting_friend', 'history'].includes(group)) {
      fail(400, 'INVALID_CHALLENGE_REQUEST', 'Challenge group is invalid.');
    }
    const limit = optionsValue.limit ?? 20;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
      fail(400, 'INVALID_CHALLENGE_REQUEST', 'Challenge list limit must be within 1..50.');
    }
    const cursor = decodeCursor(optionsValue.cursor);
    const currentDate = dateFrom(now());
    const allItems = collectGroup(viewerId, group, currentDate);
    const filtered = cursor === null ? allItems : allItems.filter(item => (
      item.updatedAt < cursor.time
      || (item.updatedAt === cursor.time && cursorKey(item) < cursor.id)
    ));
    const items = filtered.slice(0, limit);
    return {
      items,
      nextCursor: filtered.length > limit ? encodeCursor(items.at(-1)) : null,
      pendingCount: collectGroup(viewerId, 'waiting_me', currentDate).length,
    };
  }

  function createRematch(challengeId, viewerId) {
    const currentDate = dateFrom(now());
    database.exec('BEGIN IMMEDIATE');
    let offerId;
    try {
      const challenge = readChallengeRow(challengeId);
      if (challenge.offer_id === null
        || challenge.status !== 'completed'
        || challenge.recipient_player_id !== viewerId) {
        fail(403, 'REMATCH_FORBIDDEN', 'Only the completed challenge responder can create a rematch.');
      }
      const existing = database.prepare(`
        SELECT id FROM challenge_offers WHERE parent_challenge_id = ?
      `).get(challengeId);
      if (existing) {
        offerId = existing.id;
        database.exec('COMMIT');
        return presentOffer(readOfferRow(offerId), viewerId, currentDate);
      }
      const player = database.prepare('SELECT display_name FROM players WHERE id = ?').get(viewerId);
      const progression = readPlayerProgression(database, viewerId);
      if (!player || progression.snapshot.latestNssLoadout === null) {
        fail(409, 'NSS_LOADOUT_REQUIRED', 'Create and sync an NSS loadout before making a rematch.');
      }
      const parentInput = normalizeChallengeInput(JSON.parse(challenge.input_json));
      const upgrades = parentInput.mode === 'fair'
        ? zeroUpgradeSnapshot(progression.snapshot)
        : fullUpgradeSnapshot(progression.snapshot);
      const offer = normalizeChallengeOffer({
        ...CHALLENGE_CONTRACT,
        seed: createSeed(),
        mode: parentInput.mode,
        creator: {
          playerId: viewerId,
          displayName: player.display_name,
          loadout: progression.snapshot.latestNssLoadout,
          upgrades,
        },
        arena: parentInput.arena,
        aiConfig: 'deterministic-v1',
        message: '',
      });
      offerId = createId();
      database.prepare(`
        INSERT INTO challenge_offers (
          id, creator_player_id, target_player_id, parent_challenge_id,
          creation_request_id, status, offer_json, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)
      `).run(
        offerId,
        viewerId,
        challenge.creator_player_id,
        challengeId,
        `rematch:${challengeId}`,
        JSON.stringify(offer),
        new Date(currentDate.getTime() + OFFER_LIFETIME_MS).toISOString(),
        currentDate.toISOString(),
        currentDate.toISOString(),
      );
      database.exec('COMMIT');
    } catch (error) {
      try {
        database.exec('ROLLBACK');
      } catch {
        // Preserve the original rematch error.
      }
      throw error;
    }
    return presentOffer(readOfferRow(offerId), viewerId, currentDate);
  }

  return {
    claimOffer,
    createOffer,
    createRematch,
    getChallenge,
    getOffer,
    listChallenges,
    revokeOffer,
  };
}
