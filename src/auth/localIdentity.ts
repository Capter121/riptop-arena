export const LOCAL_IDENTITY_STORAGE_KEY = 'nss.inviteIdentity.v1';

export interface LocalIdentity {
  version: 1;
  playerId: string;
  displayName: string;
  deviceToken: string;
}

type IdentityStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const PLAYER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DEVICE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function isLocalIdentity(value: unknown): value is LocalIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<LocalIdentity>;
  return candidate.version === 1
    && typeof candidate.playerId === 'string'
    && PLAYER_ID.test(candidate.playerId)
    && typeof candidate.displayName === 'string'
    && candidate.displayName === candidate.displayName.trim()
    && candidate.displayName.length >= 1
    && candidate.displayName.length <= 32
    && typeof candidate.deviceToken === 'string'
    && DEVICE_TOKEN.test(candidate.deviceToken);
}

export function loadLocalIdentity(storage: IdentityStorage = window.localStorage): LocalIdentity | null {
  let raw: string | null;
  try {
    raw = storage.getItem(LOCAL_IDENTITY_STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (isLocalIdentity(value)) return value;
  } catch {
    // Remove malformed data below.
  }
  try {
    storage.removeItem(LOCAL_IDENTITY_STORAGE_KEY);
  } catch {
    // Storage may be read-only; the invalid identity is still ignored.
  }
  return null;
}

export function saveLocalIdentity(identity: LocalIdentity, storage: IdentityStorage = window.localStorage): boolean {
  if (!isLocalIdentity(identity)) return false;
  try {
    storage.setItem(LOCAL_IDENTITY_STORAGE_KEY, JSON.stringify(identity));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalIdentity(storage: IdentityStorage = window.localStorage): boolean {
  try {
    storage.removeItem(LOCAL_IDENTITY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
