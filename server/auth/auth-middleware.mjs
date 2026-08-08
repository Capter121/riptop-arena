import { AuthError, authenticateIdentity } from './invite-service.mjs';

export function authenticateRequest(database, request) {
  const authorization = request.headers.authorization;
  const playerId = request.headers['x-player-id'];
  const match = typeof authorization === 'string' ? /^Bearer ([A-Za-z0-9_-]+)$/.exec(authorization) : null;
  if (typeof playerId !== 'string' || !match) {
    throw new AuthError(401, 'AUTH_REQUIRED', 'Player identity is required.');
  }
  return authenticateIdentity(database, { playerId, deviceToken: match[1] });
}
