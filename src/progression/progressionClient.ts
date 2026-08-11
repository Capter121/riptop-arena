import type { ProgressionSnapshotData, ProgressionState } from '../app/progression';
import { loadLocalIdentity, type LocalIdentity } from '../auth/localIdentity';

const STORAGE_PREFIX = 'nss.progressionSync.v1.';
const MAX_EVENTS_PER_REQUEST = 400;

type SyncStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface WalletEventV1 {
  eventId: string;
  kind: 'credit' | 'debit';
  delta: number;
  source: 'local_progression';
  createdAt: string;
}

export interface LocalProgressionSyncStateV1 {
  version: 1;
  playerId: string;
  initialCoins: number;
  migrationComplete: boolean;
  lastObservedCoins: number;
  pendingWalletEvents: WalletEventV1[];
}

export interface ServerProgressionV1 {
  schemaVersion: 1;
  revision: number;
  coins: number;
  snapshot: ProgressionSnapshotData;
}

export interface ProgressionSyncResult {
  status: 'synced' | 'conflict';
  progression: ServerProgressionV1;
  acknowledgedEventIds: string[];
}

interface ClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  storage?: SyncStorage;
}

interface ObservationOptions {
  storage?: SyncStorage;
  uuid?: () => string;
  now?: () => Date;
}

export class ProgressionSyncError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ProgressionSyncError';
    this.status = status;
    this.code = code;
  }
}

const inFlight = new Map<string, Promise<ProgressionSyncResult>>();

function storageOrDefault(storage?: SyncStorage) {
  return storage ?? window.localStorage;
}

function endpoint(baseUrl: string | undefined, path: string) {
  return baseUrl ? `${baseUrl.replace(/\/+$/, '')}${path}` : path;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isWalletEvent(value: unknown): value is WalletEventV1 {
  if (!isRecord(value)) return false;
  return typeof value.eventId === 'string'
    && (value.kind === 'credit' || value.kind === 'debit')
    && Number.isSafeInteger(value.delta)
    && value.source === 'local_progression'
    && typeof value.createdAt === 'string';
}

function isSyncState(value: unknown, playerId: string): value is LocalProgressionSyncStateV1 {
  if (!isRecord(value)) return false;
  return value.version === 1
    && value.playerId === playerId
    && typeof value.initialCoins === 'number'
    && Number.isSafeInteger(value.initialCoins)
    && value.initialCoins >= 0
    && typeof value.migrationComplete === 'boolean'
    && typeof value.lastObservedCoins === 'number'
    && Number.isSafeInteger(value.lastObservedCoins)
    && value.lastObservedCoins >= 0
    && Array.isArray(value.pendingWalletEvents)
    && value.pendingWalletEvents.every(isWalletEvent);
}

function saveSyncState(state: LocalProgressionSyncStateV1, storage: SyncStorage) {
  storage.setItem(progressionSyncStorageKey(state.playerId), JSON.stringify(state));
}

function progressionSnapshot(state: ProgressionState): ProgressionSnapshotData {
  return {
    saveSchemaVersion: 2,
    unlockedParts: [...state.unlockedSet],
    ladderIndex: state.ladderIndex,
    bestLadder: state.bestLadder,
    championshipCount: state.championshipCount,
    build: { ...state.build },
    upgrades: { ...state.upgrades },
    partUpgrades: { ...state.partUpgrades },
    latestNssLoadout: state.latestNssLoadout === null ? null : {
      ...state.latestNssLoadout,
      combination: { ...state.latestNssLoadout.combination },
      affinities: { ...state.latestNssLoadout.affinities },
    },
  };
}

export function parseServerProgression(value: unknown): ServerProgressionV1 {
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || !Number.isSafeInteger(value.revision)
    || (value.revision as number) < 0
    || !Number.isSafeInteger(value.coins)
    || (value.coins as number) < 0
    || !isRecord(value.snapshot)) {
    throw new ProgressionSyncError(0, 'INVALID_RESPONSE', 'Server returned invalid progression data.');
  }
  return value as unknown as ServerProgressionV1;
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ProgressionSyncError(response.status, 'INVALID_RESPONSE', 'Server returned an invalid response.');
  }
}

function errorFromBody(response: Response, body: unknown) {
  const error = isRecord(body) && isRecord(body.error) ? body.error : null;
  return new ProgressionSyncError(
    response.status,
    typeof error?.code === 'string' ? error.code : 'REQUEST_FAILED',
    typeof error?.message === 'string' ? error.message : 'Progression sync failed.',
  );
}

function removeAcknowledgedEvents(
  state: LocalProgressionSyncStateV1,
  acknowledgedEventIds: readonly string[],
) {
  const acknowledged = new Set(acknowledgedEventIds);
  return state.pendingWalletEvents.filter(event => !acknowledged.has(event.eventId));
}

async function performSync(
  identity: LocalIdentity,
  progression: ProgressionState,
  options: ClientOptions,
): Promise<ProgressionSyncResult> {
  const storage = storageOrDefault(options.storage);
  const fetchImpl = options.fetchImpl ?? fetch;
  ensureProgressionSyncState(identity, progression.coins, storage);

  for (;;) {
    const syncState = loadProgressionSyncState(identity.playerId, storage)
      ?? ensureProgressionSyncState(identity, progression.coins, storage);
    const batch = syncState.pendingWalletEvents.slice(0, MAX_EVENTS_PER_REQUEST);
    const response = await fetchImpl(endpoint(options.baseUrl, '/api/progression/sync'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${identity.deviceToken}`,
        'X-Player-Id': identity.playerId,
      },
      body: JSON.stringify({
        schemaVersion: 1,
        snapshot: progressionSnapshot(progression),
        initialCoins: syncState.initialCoins,
        walletEvents: batch,
      }),
    });
    const body = await responseJson(response);
    if (response.status === 409 && isRecord(body) && isRecord(body.progression)) {
      return {
        status: 'conflict',
        progression: parseServerProgression(body.progression),
        acknowledgedEventIds: [],
      };
    }
    if (!response.ok) throw errorFromBody(response, body);
    if (!isRecord(body) || !Array.isArray(body.acknowledgedEventIds)) {
      throw new ProgressionSyncError(response.status, 'INVALID_RESPONSE', 'Server omitted wallet acknowledgements.');
    }
    const acknowledgedEventIds = body.acknowledgedEventIds.filter((id): id is string => typeof id === 'string');
    if (acknowledgedEventIds.length !== body.acknowledgedEventIds.length
      || batch.some(event => !acknowledgedEventIds.includes(event.eventId))) {
      throw new ProgressionSyncError(response.status, 'INVALID_RESPONSE', 'Server did not acknowledge the submitted wallet batch.');
    }
    const serverProgression = parseServerProgression(body.progression);
    if (syncState.pendingWalletEvents.length <= MAX_EVENTS_PER_REQUEST) {
      return { status: 'synced', progression: serverProgression, acknowledgedEventIds };
    }
    const latest = loadProgressionSyncState(identity.playerId, storage) ?? syncState;
    latest.pendingWalletEvents = removeAcknowledgedEvents(latest, acknowledgedEventIds);
    latest.migrationComplete = true;
    saveSyncState(latest, storage);
  }
}

export function progressionSyncStorageKey(playerId: string) {
  return `${STORAGE_PREFIX}${playerId}`;
}

export function loadProgressionSyncState(
  playerId: string,
  storage: SyncStorage = window.localStorage,
): LocalProgressionSyncStateV1 | null {
  let raw: string | null;
  try {
    raw = storage.getItem(progressionSyncStorageKey(playerId));
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isSyncState(parsed, playerId)) return parsed;
  } catch {
    // Remove malformed data below.
  }
  try {
    storage.removeItem(progressionSyncStorageKey(playerId));
  } catch {
    // Invalid state is ignored even when storage is read-only.
  }
  return null;
}

export function ensureProgressionSyncState(
  identity: LocalIdentity,
  coins: number,
  storage: SyncStorage = window.localStorage,
) {
  const existing = loadProgressionSyncState(identity.playerId, storage);
  if (existing) return existing;
  const initialCoins = Math.max(0, Math.floor(coins));
  const state: LocalProgressionSyncStateV1 = {
    version: 1,
    playerId: identity.playerId,
    initialCoins,
    migrationComplete: false,
    lastObservedCoins: initialCoins,
    pendingWalletEvents: [],
  };
  saveSyncState(state, storage);
  return state;
}

export function recordWalletObservation(coins: number, options: ObservationOptions = {}) {
  const storage = storageOrDefault(options.storage);
  const identity = loadLocalIdentity(storage);
  if (!identity) return null;
  const nextCoins = Math.max(0, Math.floor(coins));
  const state = ensureProgressionSyncState(identity, nextCoins, storage);
  const delta = nextCoins - state.lastObservedCoins;
  if (delta === 0) return state;
  state.pendingWalletEvents.push({
    eventId: (options.uuid ?? (() => crypto.randomUUID()))(),
    kind: delta > 0 ? 'credit' : 'debit',
    delta,
    source: 'local_progression',
    createdAt: (options.now ?? (() => new Date()))().toISOString(),
  });
  state.lastObservedCoins = nextCoins;
  saveSyncState(state, storage);
  return state;
}

export function syncPlayerProgression(
  identity: LocalIdentity,
  progression: ProgressionState,
  options: ClientOptions = {},
) {
  const existing = inFlight.get(identity.playerId);
  if (existing) return existing;
  const promise = performSync(identity, progression, options)
    .finally(() => { inFlight.delete(identity.playerId); });
  inFlight.set(identity.playerId, promise);
  return promise;
}

export function commitProgressionSync(
  identity: LocalIdentity,
  result: ProgressionSyncResult,
  storage: SyncStorage = window.localStorage,
) {
  const state = loadProgressionSyncState(identity.playerId, storage)
    ?? ensureProgressionSyncState(identity, result.progression.coins, storage);
  state.pendingWalletEvents = result.status === 'conflict'
    ? []
    : removeAcknowledgedEvents(state, result.acknowledgedEventIds);
  state.initialCoins = result.progression.revision === 0 ? result.progression.coins : state.initialCoins;
  state.migrationComplete = result.progression.revision > 0;
  state.lastObservedCoins = result.progression.coins;
  saveSyncState(state, storage);
  return state;
}
