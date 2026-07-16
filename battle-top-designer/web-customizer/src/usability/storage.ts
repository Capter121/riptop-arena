import { isUsabilitySession, type UsabilitySession, USABILITY_SCHEMA_VERSION } from './session';

export const usabilitySessionStorageKey = 'nova-spin:phase3b:test-session:v1';

type StorageReader = Pick<Storage, 'getItem'>;
type StorageWriter = Pick<Storage, 'setItem'>;
type StorageRemover = Pick<Storage, 'removeItem'>;

export type UsabilityLoadResult = {
  status: 'ok' | 'missing' | 'corrupt' | 'version_mismatch' | 'denied';
  session: UsabilitySession | null;
};

export function loadUsabilitySession(storage: StorageReader = localStorage): UsabilityLoadResult {
  let text: string | null;
  try { text = storage.getItem(usabilitySessionStorageKey); } catch { return { status: 'denied', session: null }; }
  if (!text) return { status: 'missing', session: null };
  let value: unknown;
  try { value = JSON.parse(text); } catch { return { status: 'corrupt', session: null }; }
  if ((value as { schemaVersion?: unknown })?.schemaVersion !== USABILITY_SCHEMA_VERSION) return { status: 'version_mismatch', session: null };
  return isUsabilitySession(value) ? { status: 'ok', session: value } : { status: 'corrupt', session: null };
}

export function saveUsabilitySession(session: UsabilitySession, storage: StorageWriter = localStorage): boolean {
  try {
    storage.setItem(usabilitySessionStorageKey, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

export function clearUsabilitySession(storage: StorageRemover = localStorage): boolean {
  try {
    storage.removeItem(usabilitySessionStorageKey);
    return true;
  } catch {
    return false;
  }
}
