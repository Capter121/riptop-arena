import { loadLocalIdentity } from '../auth/localIdentity';

export const ONLINE_GUEST_NAME_STORAGE_KEY = 'nss.onlineGuestName.v1';

type OnlineNameStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type OnlineIdentity = {
  displayName: string;
  kind: 'identity' | 'guest';
};

export function normalizeOnlineDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const displayName = value.trim();
  return displayName.length >= 1 && displayName.length <= 32 ? displayName : null;
}

export function loadOnlineIdentity(storage: OnlineNameStorage = window.localStorage): OnlineIdentity | null {
  const identity = loadLocalIdentity(storage);
  if (identity) return { displayName: identity.displayName, kind: 'identity' };
  let saved: string | null;
  try {
    saved = storage.getItem(ONLINE_GUEST_NAME_STORAGE_KEY);
  } catch {
    return null;
  }
  if (saved === null) return null;
  const displayName = normalizeOnlineDisplayName(saved);
  if (displayName) return { displayName, kind: 'guest' };
  try {
    storage.removeItem(ONLINE_GUEST_NAME_STORAGE_KEY);
  } catch {
    // Invalid data is ignored even when browser storage cannot be cleaned.
  }
  return null;
}

export function saveOnlineGuestName(value: unknown, storage: OnlineNameStorage = window.localStorage): string | null {
  const displayName = normalizeOnlineDisplayName(value);
  if (!displayName) return null;
  try {
    storage.setItem(ONLINE_GUEST_NAME_STORAGE_KEY, displayName);
    return displayName;
  } catch {
    return null;
  }
}
