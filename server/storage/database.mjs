import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

export const DEFAULT_BUSY_TIMEOUT_MS = 5_000;
export const DEFAULT_DATABASE_PATH = fileURLToPath(new URL('../../data/arena.sqlite', import.meta.url));

export function openDatabase(path = process.env.DATABASE_PATH || DEFAULT_DATABASE_PATH) {
  if (typeof path !== 'string' || path.length === 0) throw new TypeError('Database path must be a non-empty string.');
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  const database = new DatabaseSync(path);
  try {
    database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = ${DEFAULT_BUSY_TIMEOUT_MS};
      PRAGMA journal_mode = WAL;
    `);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
