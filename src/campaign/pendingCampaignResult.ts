import { CampaignApiError, isCampaignOutcome } from './campaignClient';

const STORAGE_PREFIX = 'nss.pendingCampaignResult.v1.';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type PendingStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;

export interface PendingCampaignResultV1 {
  version: 1;
  playerId: string;
  requestId: string;
  attemptId: string;
  outcome: Record<string, unknown>;
  status: 'pending' | 'conflict';
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function valid(value: unknown, playerId: string, attemptId: string): value is PendingCampaignResultV1 {
  return record(value)
    && Object.keys(value).sort().join(',') === 'attemptId,outcome,playerId,requestId,status,version'
    && value.version === 1 && value.playerId === playerId && value.attemptId === attemptId
    && typeof value.requestId === 'string' && UUID_V4.test(value.requestId)
    && UUID_V4.test(playerId) && UUID_V4.test(attemptId)
    && (value.status === 'pending' || value.status === 'conflict')
    && isCampaignOutcome(value.outcome);
}

export function pendingCampaignResultKey(playerId: string, attemptId: string) {
  return `${STORAGE_PREFIX}${playerId}.${attemptId}`;
}

export function savePendingCampaignResult(playerId: string, requestId: string, attemptId: string, outcome: Record<string, unknown>, storage: PendingStorage = window.localStorage) {
  const value = { version: 1 as const, playerId, requestId, attemptId, outcome, status: 'pending' as const };
  if (!valid(value, playerId, attemptId)) return false;
  try { storage.setItem(pendingCampaignResultKey(playerId, attemptId), JSON.stringify(value)); return true; } catch { return false; }
}

export function loadPendingCampaignResult(playerId: string, attemptId: string, storage: PendingStorage = window.localStorage): PendingCampaignResultV1 | null {
  const key = pendingCampaignResultKey(playerId, attemptId);
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (valid(value, playerId, attemptId)) return value;
  } catch { /* Remove malformed records below when possible. */ }
  try { storage.removeItem(key); } catch { /* Read-only storage remains isolated. */ }
  return null;
}

export function listPendingCampaignResults(playerId: string, storage: PendingStorage = window.localStorage) {
  const prefix = `${STORAGE_PREFIX}${playerId}.`;
  let keys: string[];
  try {
    keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter((key): key is string => typeof key === 'string' && key.startsWith(prefix));
  } catch { return []; }
  return keys.map(key => loadPendingCampaignResult(playerId, key.slice(prefix.length), storage))
    .filter((value): value is PendingCampaignResultV1 => value !== null);
}

export function createPendingCampaignRetrySession() { return new Set<string>(); }

export async function retryPendingCampaignResultsOnce(
  playerId: string,
  submit: (attemptId: string, value: { requestId: string; outcome: Record<string, unknown> }) => Promise<unknown>,
  options: { storage?: PendingStorage; session: Set<string> },
) {
  const storage = options.storage ?? window.localStorage;
  for (const item of listPendingCampaignResults(playerId, storage)) {
    if (item.status === 'conflict') continue;
    const key = pendingCampaignResultKey(playerId, item.attemptId);
    if (options.session.has(key)) continue;
    options.session.add(key);
    try {
      await submit(item.attemptId, { requestId: item.requestId, outcome: item.outcome });
      storage.removeItem(key);
    } catch (error) {
      if (error instanceof CampaignApiError && error.code === 'CAMPAIGN_RESULT_CONFLICT') {
        try { storage.setItem(key, JSON.stringify({ ...item, status: 'conflict' })); } catch { /* Keep the original pending record. */ }
      }
    }
  }
}
