import { randomBytes, randomUUID } from 'node:crypto';
import {
  CHALLENGE_CONTRACT,
  ChallengeError,
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

  function presentOffer(row, viewerId, currentDate) {
    const offer = normalizeChallengeOffer(JSON.parse(row.offer_json));
    const isCreator = row.creator_player_id === viewerId;
    const isTarget = row.target_player_id === viewerId;
    if (row.target_player_id !== null && !isCreator && !isTarget) {
      fail(403, 'OFFER_FORBIDDEN', 'This targeted challenge offer is private.');
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

  return { createOffer, getOffer, revokeOffer };
}
