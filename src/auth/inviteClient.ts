import { isLocalIdentity, type LocalIdentity } from './localIdentity';

export interface InviteRedemption {
  inviteCode: string;
  displayName: string;
}

export interface PublicPlayer {
  playerId: string;
  displayName: string;
}

interface ClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class InviteApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'InviteApiError';
    this.status = status;
    this.code = code;
  }
}

function endpoint(baseUrl: string | undefined, path: string) {
  return baseUrl ? `${baseUrl.replace(/\/+$/, '')}${path}` : path;
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new InviteApiError(response.status, 'INVALID_RESPONSE', 'Server returned an invalid response.');
  }
}

async function requireSuccess(response: Response) {
  const data = await responseJson(response);
  if (response.ok) return data;
  const error = data && typeof data === 'object' && 'error' in data
    ? (data as { error?: { code?: unknown; message?: unknown } }).error
    : undefined;
  throw new InviteApiError(
    response.status,
    typeof error?.code === 'string' ? error.code : 'REQUEST_FAILED',
    typeof error?.message === 'string' ? error.message : 'Request failed.',
  );
}

export async function redeemInvite(input: InviteRedemption, options: ClientOptions = {}): Promise<LocalIdentity> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(endpoint(options.baseUrl, '/api/invites/redeem'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await requireSuccess(response);
  const identity = data && typeof data === 'object' && 'identity' in data
    ? (data as { identity?: unknown }).identity
    : null;
  if (!isLocalIdentity(identity)) {
    throw new InviteApiError(response.status, 'INVALID_RESPONSE', 'Server returned an invalid player identity.');
  }
  return identity;
}

export async function fetchCurrentPlayer(identity: LocalIdentity, options: ClientOptions = {}): Promise<PublicPlayer> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(endpoint(options.baseUrl, '/api/me'), {
    headers: {
      Authorization: `Bearer ${identity.deviceToken}`,
      'X-Player-Id': identity.playerId,
    },
  });
  const data = await requireSuccess(response);
  const player = data && typeof data === 'object' && 'player' in data
    ? (data as { player?: Partial<PublicPlayer> }).player
    : null;
  if (!player || typeof player.playerId !== 'string' || typeof player.displayName !== 'string') {
    throw new InviteApiError(response.status, 'INVALID_RESPONSE', 'Server returned invalid player data.');
  }
  return { playerId: player.playerId, displayName: player.displayName };
}
