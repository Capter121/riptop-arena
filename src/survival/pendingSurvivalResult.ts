import { isCampaignOutcome } from '../campaign/campaignClient';
import { SurvivalApiError, type SurvivalResultRequest } from './survivalClient';

const STORAGE_PREFIX = 'nss.pendingSurvivalResult.v1.';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type PendingStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;

export interface PendingSurvivalResultV1 {
  version: 1;
  playerId: string;
  runId: string;
  wave: number;
  request: SurvivalResultRequest;
  status: 'pending' | 'conflict';
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validRequest(value: unknown, wave: number): value is SurvivalResultRequest {
  return record(value)
    && Object.keys(value).sort().join(',') === 'battleRulesVersion,configVersion,outcome,requestId,simulationVersion,wave'
    && typeof value.requestId === 'string' && UUID_V4.test(value.requestId)
    && value.configVersion === 'survival-v1' && value.simulationVersion === 1 && value.battleRulesVersion === 2
    && value.wave === wave && isCampaignOutcome(value.outcome) && value.outcome.winner === 'enemy';
}

function valid(value: unknown, playerId: string, runId: string, wave: number): value is PendingSurvivalResultV1 {
  return record(value)
    && Object.keys(value).sort().join(',') === 'playerId,request,runId,status,version,wave'
    && value.version === 1 && value.playerId === playerId && value.runId === runId && value.wave === wave
    && UUID_V4.test(playerId) && UUID_V4.test(runId) && Number.isSafeInteger(wave) && wave >= 1
    && (value.status === 'pending' || value.status === 'conflict')
    && validRequest(value.request, wave);
}

export function pendingSurvivalResultKey(playerId: string, runId: string, wave: number) {
  return `${STORAGE_PREFIX}${playerId}.${runId}.${wave}`;
}

export function savePendingSurvivalResult(playerId: string, runId: string, request: SurvivalResultRequest, storage: PendingStorage = window.localStorage) {
  const value = { version: 1 as const, playerId, runId, wave: request.wave, request, status: 'pending' as const };
  if (!valid(value, playerId, runId, request.wave)) return false;
  try { storage.setItem(pendingSurvivalResultKey(playerId, runId, request.wave), JSON.stringify(value)); return true; } catch { return false; }
}

export function loadPendingSurvivalResult(playerId: string, runId: string, wave: number, storage: PendingStorage = window.localStorage): PendingSurvivalResultV1 | null {
  const key = pendingSurvivalResultKey(playerId, runId, wave);
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (valid(value, playerId, runId, wave)) return value;
  } catch { /* Remove malformed records below when possible. */ }
  try { storage.removeItem(key); } catch { /* Read-only storage remains isolated. */ }
  return null;
}

export function listPendingSurvivalResults(playerId: string, storage: PendingStorage = window.localStorage) {
  const prefix = `${STORAGE_PREFIX}${playerId}.`;
  let keys: string[];
  try {
    keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter((key): key is string => typeof key === 'string' && key.startsWith(prefix));
  } catch { return []; }
  return keys.map((key) => {
    const parts = key.slice(prefix.length).split('.');
    return parts.length === 2 ? loadPendingSurvivalResult(playerId, parts[0], Number(parts[1]), storage) : null;
  }).filter((value): value is PendingSurvivalResultV1 => value !== null);
}

export function createPendingSurvivalRetrySession() { return new Set<string>(); }

function markConflict(item: PendingSurvivalResultV1, storage: PendingStorage) {
  try { storage.setItem(pendingSurvivalResultKey(item.playerId, item.runId, item.wave), JSON.stringify({ ...item, status: 'conflict' })); } catch { /* Keep the original pending record. */ }
}

function isConflict(error: unknown) {
  return error instanceof SurvivalApiError && (error.code === 'SURVIVAL_REQUEST_CONFLICT' || error.code === 'STALE_SURVIVAL_STATE');
}

export async function submitSurvivalResultWithQueue<T>(
  playerId: string,
  runId: string,
  request: SurvivalResultRequest,
  submit: (runId: string, wave: number, request: SurvivalResultRequest) => Promise<T>,
  options: { storage?: PendingStorage } = {},
): Promise<{ status: 'submitted'; response: T } | { status: 'storage_failed' | 'pending' | 'conflict' }> {
  const storage = options.storage ?? window.localStorage;
  if (!savePendingSurvivalResult(playerId, runId, request, storage)) return { status: 'storage_failed' };
  try {
    const response = await submit(runId, request.wave, request);
    try { storage.removeItem(pendingSurvivalResultKey(playerId, runId, request.wave)); } catch { /* A later retry remains idempotent. */ }
    return { status: 'submitted', response };
  } catch (error) {
    if (isConflict(error)) {
      const item = loadPendingSurvivalResult(playerId, runId, request.wave, storage);
      if (item) markConflict(item, storage);
      return { status: 'conflict' };
    }
    return { status: 'pending' };
  }
}

export async function retryPendingSurvivalResultsOnce<T extends { progression?: unknown }>(
  playerId: string,
  submit: (runId: string, wave: number, request: SurvivalResultRequest) => Promise<T>,
  options: { storage?: PendingStorage; session: Set<string>; onProgression?: (progression: NonNullable<T['progression']>) => void },
) {
  const storage = options.storage ?? window.localStorage;
  for (const item of listPendingSurvivalResults(playerId, storage)) {
    if (item.status === 'conflict') continue;
    const key = pendingSurvivalResultKey(playerId, item.runId, item.wave);
    if (options.session.has(key)) continue;
    options.session.add(key);
    try {
      const response = await submit(item.runId, item.wave, item.request);
      storage.removeItem(key);
      if (response.progression !== undefined) options.onProgression?.(response.progression as NonNullable<T['progression']>);
    } catch (error) {
      if (isConflict(error)) markConflict(item, storage);
    }
  }
}
