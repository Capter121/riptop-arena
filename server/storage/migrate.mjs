import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));
const MIGRATION_NAME = /^(\d{3})_([a-z0-9_]+)\.sql$/;

async function loadMigrations(migrationsDir) {
  const migrations = [];
  for (const filename of await readdir(migrationsDir)) {
    const match = MIGRATION_NAME.exec(filename);
    if (!match) continue;
    migrations.push({
      version: Number(match[1]),
      name: match[2],
      filename,
      sql: await readFile(join(migrationsDir, filename), 'utf8'),
    });
  }
  migrations.sort((left, right) => left.version - right.version);
  for (let index = 1; index < migrations.length; index += 1) {
    if (migrations[index - 1].version === migrations[index].version) {
      throw new Error(`Duplicate migration version: ${migrations[index].version}`);
    }
  }
  return migrations;
}

export async function migrateDatabase(database, options = {}) {
  const migrationsDir = options.migrationsDir ?? DEFAULT_MIGRATIONS_DIR;
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  const appliedVersions = new Set(database.prepare('SELECT version FROM schema_migrations').all().map(row => row.version));
  const migrations = await loadMigrations(migrationsDir);
  const applied = [];

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;
    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(migration.sql);
      database.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
        .run(migration.version, migration.name);
      database.exec('COMMIT');
      applied.push(migration.version);
    } catch (error) {
      try {
        database.exec('ROLLBACK');
      } catch {
        // Preserve the original migration error.
      }
      throw new Error(`Migration failed: ${migration.filename}`, { cause: error });
    }
  }
  return applied;
}
