const STORAGE_PREFIX = 'nss.pendingChallengeResult.v1.';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SEED = /^[0-9a-f]{32}$/;

type PendingStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;

export interface PendingChallengeEnvelope {
  submissionId: string;
  inputLog: Record<string, unknown>;
  outcome: Record<string, unknown>;
}

export interface PendingChallengeResultV1 {
  version: 1;
  playerId: string;
  challengeId: string;
  envelope: PendingChallengeEnvelope;
}

function storageOrDefault(storage?: PendingStorage) {
  return storage ?? window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isEnvelope(value: unknown): value is PendingChallengeEnvelope {
  if (!isRecord(value)
    || Object.keys(value).sort().join(',') !== 'inputLog,outcome,submissionId'
    || typeof value.submissionId !== 'string'
    || !UUID_V4.test(value.submissionId)
    || !isRecord(value.inputLog)
    || !isRecord(value.outcome)) return false;
  return value.inputLog.simulationVersion === 1
    && typeof value.inputLog.seed === 'string'
    && SEED.test(value.inputLog.seed)
    && Array.isArray(value.inputLog.playerVoiceFrames)
    && Array.isArray(value.inputLog.turns)
    && value.outcome.simulationVersion === 1
    && value.outcome.seed === value.inputLog.seed;
}

function isPending(value: unknown, playerId: string, challengeId: string): value is PendingChallengeResultV1 {
  return isRecord(value)
    && Object.keys(value).sort().join(',') === 'challengeId,envelope,playerId,version'
    && value.version === 1
    && value.playerId === playerId
    && value.challengeId === challengeId
    && UUID_V4.test(playerId)
    && UUID_V4.test(challengeId)
    && isEnvelope(value.envelope);
}

export function pendingResultStorageKey(playerId: string, challengeId: string) {
  return `${STORAGE_PREFIX}${playerId}.${challengeId}`;
}

export function savePendingResult(
  playerId: string,
  challengeId: string,
  envelope: PendingChallengeEnvelope,
  storage: PendingStorage = window.localStorage,
) {
  if (!UUID_V4.test(playerId) || !UUID_V4.test(challengeId) || !isEnvelope(envelope)) return false;
  try {
    storage.setItem(pendingResultStorageKey(playerId, challengeId), JSON.stringify({
      version: 1, playerId, challengeId, envelope,
    }));
    return true;
  } catch {
    return false;
  }
}

export function loadPendingResult(
  playerId: string,
  challengeId: string,
  storage: PendingStorage = window.localStorage,
): PendingChallengeResultV1 | null {
  const key = pendingResultStorageKey(playerId, challengeId);
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (isPending(value, playerId, challengeId)) return value;
  } catch {
    // Invalid or inaccessible records are removed below when possible.
  }
  try { storage.removeItem(key); } catch { /* Read-only storage stays isolated. */ }
  return null;
}

export function removePendingResult(
  playerId: string,
  challengeId: string,
  storage: PendingStorage = window.localStorage,
) {
  try {
    storage.removeItem(pendingResultStorageKey(playerId, challengeId));
    return true;
  } catch {
    return false;
  }
}

export function listPendingResultsForPlayer(
  playerId: string,
  storage: PendingStorage = window.localStorage,
) {
  const records: PendingChallengeResultV1[] = [];
  const prefix = `${STORAGE_PREFIX}${playerId}.`;
  let keys: string[];
  try {
    keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter((key): key is string => typeof key === 'string' && key.startsWith(prefix));
  } catch {
    return records;
  }
  for (const key of keys) {
    const challengeId = key.slice(prefix.length);
    const record = loadPendingResult(playerId, challengeId, storage);
    if (record) records.push(record);
  }
  return records;
}

export function createPendingRetrySession() {
  return new Set<string>();
}

export async function retryPendingResultsOnce(
  playerId: string,
  submit: (challengeId: string, envelope: PendingChallengeEnvelope) => Promise<unknown>,
  options: { storage?: PendingStorage; session: Set<string> },
) {
  const storage = storageOrDefault(options.storage);
  for (const record of listPendingResultsForPlayer(playerId, storage)) {
    const key = pendingResultStorageKey(playerId, record.challengeId);
    if (options.session.has(key)) continue;
    options.session.add(key);
    try {
      await submit(record.challengeId, record.envelope);
      removePendingResult(playerId, record.challengeId, storage);
    } catch {
      // One automatic attempt per page session; keep the exact envelope for manual retry.
    }
  }
}

export async function settleChallengeResult(
  playerId: string,
  challengeId: string,
  envelope: PendingChallengeEnvelope,
  submit: (challengeId: string, envelope: PendingChallengeEnvelope) => Promise<unknown>,
  storage: PendingStorage = window.localStorage,
): Promise<'submitted' | 'pending' | 'storage_failed'> {
  if (!savePendingResult(playerId, challengeId, envelope, storage)) return 'storage_failed';
  try {
    await submit(challengeId, envelope);
    removePendingResult(playerId, challengeId, storage);
    return 'submitted';
  } catch {
    return 'pending';
  }
}
