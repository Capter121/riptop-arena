import type { LocalIdentity } from '../auth/localIdentity';

type FetchOptions = { baseUrl?: string; fetchImpl?: typeof fetch };
type JsonRecord = Record<string, unknown>;

export interface CreateOfferInput {
  requestId: string;
  mode: 'fair' | 'full_power';
  arena: 'classic_grid' | 'neon_magma' | 'absolute_zero';
  message: string;
}

export interface ChallengeOfferView {
  id: string;
  status: 'open' | 'claimed' | 'revoked' | 'expired';
  targetPlayerId: string | null;
  parentChallengeId: string | null;
  claimedChallengeId: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  offer: JsonRecord;
  actions: { canClaim: boolean; canRevoke: boolean };
}

export interface ChallengeView {
  id: string;
  status: 'pending' | 'completed';
  creatorPlayerId: string;
  recipientPlayerId: string;
  offerId: string | null;
  parentChallengeId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  input: JsonRecord;
  result: JsonRecord | null;
  actions: { canBattle: boolean; canRematch: boolean };
}

export type ChallengeListItem = ({ kind: 'offer' } & ChallengeOfferView)
  | ({ kind: 'challenge' } & ChallengeView);

export interface ChallengeListResponse {
  items: ChallengeListItem[];
  nextCursor: string | null;
  pendingCount: number;
}

export class ChallengeApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ChallengeApiError';
    this.status = status;
    this.code = code;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exact(value: unknown, keys: string[]): value is JsonRecord {
  return isRecord(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

function invalid(status = 0): never {
  throw new ChallengeApiError(status, 'INVALID_RESPONSE', 'Server returned invalid challenge data.');
}

function nullableString(value: unknown) {
  return value === null || typeof value === 'string';
}

function parseOffer(value: unknown): ChallengeOfferView {
  const keys = ['id', 'status', 'targetPlayerId', 'parentChallengeId', 'claimedChallengeId', 'expiresAt', 'createdAt', 'updatedAt', 'offer', 'actions'];
  if (!exact(value, keys)
    || typeof value.id !== 'string'
    || !['open', 'claimed', 'revoked', 'expired'].includes(String(value.status))
    || !nullableString(value.targetPlayerId)
    || !nullableString(value.parentChallengeId)
    || !nullableString(value.claimedChallengeId)
    || typeof value.expiresAt !== 'string'
    || typeof value.createdAt !== 'string'
    || typeof value.updatedAt !== 'string'
    || !isRecord(value.offer)
    || !exact(value.actions, ['canClaim', 'canRevoke'])
    || typeof value.actions.canClaim !== 'boolean'
    || typeof value.actions.canRevoke !== 'boolean') invalid();
  return value as unknown as ChallengeOfferView;
}

function parseChallenge(value: unknown): ChallengeView {
  const keys = ['id', 'status', 'creatorPlayerId', 'recipientPlayerId', 'offerId', 'parentChallengeId', 'createdAt', 'updatedAt', 'completedAt', 'input', 'result', 'actions'];
  if (!exact(value, keys)
    || typeof value.id !== 'string'
    || !['pending', 'completed'].includes(String(value.status))
    || typeof value.creatorPlayerId !== 'string'
    || typeof value.recipientPlayerId !== 'string'
    || !nullableString(value.offerId)
    || !nullableString(value.parentChallengeId)
    || typeof value.createdAt !== 'string'
    || typeof value.updatedAt !== 'string'
    || !nullableString(value.completedAt)
    || !isRecord(value.input)
    || !(value.result === null || isRecord(value.result))
    || !exact(value.actions, ['canBattle', 'canRematch'])
    || typeof value.actions.canBattle !== 'boolean'
    || typeof value.actions.canRematch !== 'boolean') invalid();
  return value as unknown as ChallengeView;
}

function parseList(value: unknown): ChallengeListResponse {
  if (!exact(value, ['items', 'nextCursor', 'pendingCount'])
    || !Array.isArray(value.items)
    || !nullableString(value.nextCursor)
    || !Number.isSafeInteger(value.pendingCount)
    || (value.pendingCount as number) < 0) invalid();
  const items: ChallengeListItem[] = value.items.map(item => {
    if (!isRecord(item) || (item.kind !== 'offer' && item.kind !== 'challenge')) invalid();
    const { kind, ...rest } = item;
    return kind === 'offer'
      ? { kind: 'offer', ...parseOffer(rest) }
      : { kind: 'challenge', ...parseChallenge(rest) };
  });
  return { items, nextCursor: value.nextCursor, pendingCount: value.pendingCount as number };
}

function endpoint(baseUrl: string | undefined, path: string) {
  return baseUrl ? `${baseUrl.replace(/\/+$/, '')}${path}` : path;
}

export function createChallengeClient(identity: LocalIdentity, options: FetchOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const authHeaders = {
    Authorization: `Bearer ${identity.deviceToken}`,
    'X-Player-Id': identity.playerId,
  };

  async function request(path: string, init: RequestInit = {}) {
    const response = await fetchImpl(endpoint(options.baseUrl, path), {
      ...init,
      headers: { ...authHeaders, ...init.headers },
    });
    let body: unknown;
    try { body = await response.json(); } catch { invalid(response.status); }
    if (!response.ok) {
      const error = isRecord(body) && isRecord(body.error) ? body.error : null;
      throw new ChallengeApiError(
        response.status,
        typeof error?.code === 'string' ? error.code : 'REQUEST_FAILED',
        typeof error?.message === 'string' ? error.message : 'Challenge request failed.',
      );
    }
    return body;
  }

  function post(path: string, body?: unknown) {
    return request(path, body === undefined ? { method: 'POST' } : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  return {
    async createOffer(input: CreateOfferInput) { return parseOffer(await post('/api/challenge-offers', input)); },
    async getOffer(id: string) { return parseOffer(await request(`/api/challenge-offers/${id}`)); },
    async claimOffer(id: string) { return parseChallenge(await post(`/api/challenge-offers/${id}/claim`)); },
    async revokeOffer(id: string) { return parseOffer(await post(`/api/challenge-offers/${id}/revoke`)); },
    async listChallenges(query: { group: 'waiting_me' | 'waiting_friend' | 'history'; cursor?: string; limit?: number }) {
      const params = new URLSearchParams({ group: query.group });
      if (query.cursor !== undefined) params.set('cursor', query.cursor);
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      return parseList(await request(`/api/challenges?${params}`));
    },
    async getChallenge(id: string) { return parseChallenge(await request(`/api/challenges/${id}`)); },
    async submitResult(id: string, value: unknown) { return parseChallenge(await post(`/api/challenges/${id}/results`, value)); },
    async createRematch(id: string) { return parseOffer(await post(`/api/challenges/${id}/rematch`)); },
  };
}

export type ChallengeClient = ReturnType<typeof createChallengeClient>;
