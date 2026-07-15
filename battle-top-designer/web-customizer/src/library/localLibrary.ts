import { combinationId, isCombination, type Combination } from '../domain';

export const libraryStorageKey = 'nova-spin:phase3b:library:v1';

export interface LibraryEntry {
  id: string;
  combination: Combination;
  nickname?: string;
  updatedAt: string;
}

export interface CombinationLibrary {
  schemaVersion: 1;
  recent: LibraryEntry[];
  favorites: LibraryEntry[];
}

export function emptyLibrary(): CombinationLibrary {
  return { schemaVersion: 1, recent: [], favorites: [] };
}

export function normalizeNickname(value: string): string | undefined {
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  return normalized || undefined;
}

function validEntry(value: unknown): value is LibraryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<LibraryEntry>;
  return isCombination(entry.combination)
    && entry.id === combinationId(entry.combination)
    && typeof entry.updatedAt === 'string'
    && (entry.nickname === undefined || normalizeNickname(entry.nickname) === entry.nickname);
}

export function parseLibrary(text: string | null): CombinationLibrary {
  if (!text) return emptyLibrary();
  try {
    const value = JSON.parse(text);
    if (value?.schemaVersion !== 1 || !Array.isArray(value.recent) || !Array.isArray(value.favorites)) return emptyLibrary();
    if (!value.recent.every(validEntry) || !value.favorites.every(validEntry)) return emptyLibrary();
    return { schemaVersion: 1, recent: value.recent.slice(0, 12), favorites: value.favorites.slice(0, 50) };
  } catch {
    return emptyLibrary();
  }
}

function nicknameFor(library: CombinationLibrary, id: string) {
  return [...library.favorites, ...library.recent].find(entry => entry.id === id)?.nickname;
}

function entryFor(library: CombinationLibrary, combination: Combination, updatedAt: string): LibraryEntry {
  const id = combinationId(combination);
  return { id, combination, nickname: nicknameFor(library, id), updatedAt };
}

export function addRecent(library: CombinationLibrary, combination: Combination, updatedAt = new Date().toISOString()): CombinationLibrary {
  const entry = entryFor(library, combination, updatedAt);
  return { ...library, recent: [entry, ...library.recent.filter(item => item.id !== entry.id)].slice(0, 12) };
}

export function toggleFavorite(library: CombinationLibrary, combination: Combination, updatedAt = new Date().toISOString()): CombinationLibrary {
  const id = combinationId(combination);
  if (library.favorites.some(entry => entry.id === id)) return removeFavorite(library, id);
  const entry = entryFor(library, combination, updatedAt);
  return { ...library, favorites: [entry, ...library.favorites].slice(0, 50) };
}

export function removeFavorite(library: CombinationLibrary, id: string): CombinationLibrary {
  return { ...library, favorites: library.favorites.filter(entry => entry.id !== id) };
}

export function setNickname(library: CombinationLibrary, id: string, value: string): CombinationLibrary {
  const nickname = normalizeNickname(value);
  const update = (entry: LibraryEntry) => entry.id === id ? { ...entry, nickname } : entry;
  return { ...library, recent: library.recent.map(update), favorites: library.favorites.map(update) };
}

export function readLibrary(storage: Pick<Storage, 'getItem'> = localStorage): CombinationLibrary {
  try { return parseLibrary(storage.getItem(libraryStorageKey)); } catch { return emptyLibrary(); }
}

export function writeLibrary(library: CombinationLibrary, storage: Pick<Storage, 'setItem'> = localStorage): boolean {
  try {
    storage.setItem(libraryStorageKey, JSON.stringify(library));
    return true;
  } catch {
    return false;
  }
}
