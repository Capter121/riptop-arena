import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const PLAYER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DEVICE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export class AuthError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.code = code;
  }
}

function rollback(database) {
  try {
    database.exec('ROLLBACK');
  } catch {
    // Preserve the original redemption error.
  }
}

function normalizeRedemption(input) {
  const inviteCode = typeof input?.inviteCode === 'string' ? input.inviteCode.trim() : '';
  const displayName = typeof input?.displayName === 'string' ? input.displayName.trim() : '';
  if (inviteCode.length < 6 || inviteCode.length > 64) {
    throw new AuthError(404, 'INVALID_INVITE', 'Invite code is invalid.');
  }
  if (displayName.length < 1 || displayName.length > 32) {
    throw new AuthError(400, 'INVALID_DISPLAY_NAME', 'Display name must contain 1 to 32 characters.');
  }
  return { inviteCode, displayName };
}

function hashDeviceToken(deviceToken) {
  return createHash('sha256').update(deviceToken).digest();
}

export function redeemInvite(database, input) {
  const { inviteCode, displayName } = normalizeRedemption(input);
  database.exec('BEGIN IMMEDIATE');
  try {
    const invite = database.prepare(`
      SELECT enabled, max_uses, use_count FROM invites WHERE code = ?
    `).get(inviteCode);
    if (!invite) throw new AuthError(404, 'INVALID_INVITE', 'Invite code is invalid.');
    if (invite.enabled !== 1) throw new AuthError(403, 'INVITE_DISABLED', 'Invite code is disabled.');
    if (invite.use_count >= invite.max_uses) {
      throw new AuthError(409, 'INVITE_EXHAUSTED', 'Invite has reached its use limit.');
    }

    const playerId = randomUUID();
    const deviceToken = randomBytes(32).toString('base64url');
    const deviceTokenHash = hashDeviceToken(deviceToken).toString('hex');
    database.prepare(`
      INSERT INTO players (id, display_name, device_token_hash, invite_code)
      VALUES (?, ?, ?, ?)
    `).run(playerId, displayName, deviceTokenHash, inviteCode);
    database.prepare('UPDATE invites SET use_count = use_count + 1 WHERE code = ?').run(inviteCode);
    database.exec('COMMIT');
    return { version: 1, playerId, displayName, deviceToken };
  } catch (error) {
    rollback(database);
    throw error;
  }
}

export function authenticateIdentity(database, credentials) {
  const playerId = credentials?.playerId;
  const deviceToken = credentials?.deviceToken;
  if (typeof playerId !== 'string' || !PLAYER_ID.test(playerId)
    || typeof deviceToken !== 'string' || !DEVICE_TOKEN.test(deviceToken)) {
    throw new AuthError(401, 'AUTH_INVALID', 'Player identity is invalid.');
  }

  const player = database.prepare(`
    SELECT id, display_name, device_token_hash FROM players WHERE id = ?
  `).get(playerId);
  const storedHash = typeof player?.device_token_hash === 'string' && /^[0-9a-f]{64}$/.test(player.device_token_hash)
    ? Buffer.from(player.device_token_hash, 'hex')
    : null;
  const suppliedHash = hashDeviceToken(deviceToken);
  if (!player || !storedHash || !timingSafeEqual(storedHash, suppliedHash)) {
    throw new AuthError(401, 'AUTH_INVALID', 'Player identity is invalid.');
  }
  return { playerId: player.id, displayName: player.display_name };
}
