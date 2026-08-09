import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rmdir,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import {
  backupPrivateServer,
  restorePrivateServer,
} from '../server/storage/private-server-archive.mjs';
import { openDatabase } from '../server/storage/database.mjs';
import { migrateDatabase } from '../server/storage/migrate.mjs';

async function unlinkIfPresent(path) {
  try {
    await unlink(path);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function rmdirIfPresent(path) {
  try {
    await rmdir(path);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

function immutableDatabaseUrl(path) {
  const url = pathToFileURL(path);
  url.searchParams.set('immutable', '1');
  return url;
}

const root = await mkdtemp(join(tmpdir(), 'nss-private-archive-'));
const databasePath = join(root, 'arena.sqlite');
const databaseDirectory = join(root, 'database-directory');
const uploadsPath = join(root, 'uploads');
const backupRoot = join(root, 'backups');
const now = new Date('2026-08-09T01:02:03.004Z');
const expectedBackupPath = join(backupRoot, 'nss-private-20260809T010203004Z');
const liveDatabasePath = join(root, 'live.sqlite');
const liveBackupRoot = join(root, 'live-backups');
const liveNow = new Date('2026-08-09T01:02:04.005Z');
const liveBackupPath = join(liveBackupRoot, 'nss-private-20260809T010204005Z');
const failedDatabasePath = join(root, 'invalid.sqlite');
const failedBackupRoot = join(root, 'failed-backups');
const failedNow = new Date('2026-08-09T01:02:05.006Z');
const failedBackupPath = join(failedBackupRoot, 'nss-private-20260809T010205006Z');

let liveDatabase;

try {
  await writeFile(databasePath, 'step-one-database', 'utf8');

  await assert.rejects(
    () => backupPrivateServer({ databasePath, dryRun: true, now }),
    /backup root/i,
  );
  await assert.rejects(
    () => backupPrivateServer({ databasePath: join(root, 'missing.sqlite'), backupRoot, dryRun: true, now }),
    /database.*regular file/i,
  );

  await mkdir(databaseDirectory);
  await assert.rejects(
    () => backupPrivateServer({ databasePath: databaseDirectory, backupRoot, dryRun: true, now }),
    /database.*regular file/i,
  );

  await mkdir(uploadsPath);
  await assert.rejects(
    () => backupPrivateServer({
      databasePath,
      uploadsPath,
      backupRoot: join(uploadsPath, 'backups'),
      dryRun: true,
      now,
    }),
    /inside the uploads directory/i,
  );

  const dryRun = await backupPrivateServer({
    databasePath: join(root, '.', 'arena.sqlite'),
    backupRoot: join(root, 'unused', '..', 'backups'),
    uploadsPath,
    dryRun: true,
    now,
  });
  assert.deepEqual(dryRun, {
    operation: 'backup',
    status: 'planned',
    dryRun: true,
    backupPath: expectedBackupPath,
    databasePath,
    uploadsIncluded: true,
  });
  assert.equal(isAbsolute(dryRun.backupPath), true);
  assert.deepEqual((await readdir(root)).sort(), [
    'arena.sqlite',
    'database-directory',
    'uploads',
  ]);

  await mkdir(backupRoot);
  await mkdir(expectedBackupPath);
  await assert.rejects(
    () => backupPrivateServer({ databasePath, backupRoot, dryRun: true, now }),
    /backup target already exists/i,
  );

  await assert.rejects(
    () => restorePrivateServer({ databasePath, dryRun: true }),
    /backup path/i,
  );

  liveDatabase = openDatabase(liveDatabasePath);
  assert.equal(liveDatabase.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
  await migrateDatabase(liveDatabase);
  liveDatabase.prepare('INSERT INTO invites (code, max_uses) VALUES (?, ?)').run('BACKUP01', 2);
  liveDatabase.prepare(`
    INSERT INTO players (id, display_name, device_token_hash, invite_code)
    VALUES (?, ?, ?, ?)
  `).run('backup-player', 'Backup Nova', 'a'.repeat(64), 'BACKUP01');
  liveDatabase.prepare(`
    INSERT INTO player_progression (player_id, snapshot_json, coins, initial_coins_imported)
    VALUES (?, ?, ?, ?)
  `).run('backup-player', '{"ladderIndex":1}', 275, 1);

  const backupResult = await backupPrivateServer({
    databasePath: liveDatabasePath,
    backupRoot: liveBackupRoot,
    now: liveNow,
  });
  assert.equal(backupResult.operation, 'backup');
  assert.equal(backupResult.status, 'complete');
  assert.equal(backupResult.dryRun, false);
  assert.equal(backupResult.backupPath, liveBackupPath);
  assert.equal(backupResult.fileCount, 1);
  assert.equal(backupResult.totalBytes, (await stat(join(liveBackupPath, 'arena.sqlite'))).size);

  const manifest = JSON.parse(await readFile(join(liveBackupPath, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest, {
    formatVersion: 1,
    createdAt: liveNow.toISOString(),
    database: {
      path: 'arena.sqlite',
      bytes: backupResult.totalBytes,
      sha256: await sha256(join(liveBackupPath, 'arena.sqlite')),
      migrationVersions: [1, 2, 3],
      quickCheck: 'ok',
    },
    uploads: {
      included: false,
      files: [],
    },
  });

  const snapshot = new DatabaseSync(immutableDatabaseUrl(join(liveBackupPath, 'arena.sqlite')), { readOnly: true });
  try {
    assert.equal(snapshot.prepare('PRAGMA quick_check').get().quick_check, 'ok');
    assert.equal(
      snapshot.prepare('SELECT display_name FROM players WHERE id = ?').get('backup-player').display_name,
      'Backup Nova',
    );
    const progression = snapshot.prepare(`
      SELECT coins, initial_coins_imported FROM player_progression WHERE player_id = ?
    `).get('backup-player');
    assert.equal(progression.coins, 275);
    assert.equal(progression.initial_coins_imported, 1);
  } finally {
    snapshot.close();
  }

  await writeFile(failedDatabasePath, 'not a sqlite database', 'utf8');
  await assert.rejects(
    () => backupPrivateServer({
      databasePath: failedDatabasePath,
      backupRoot: failedBackupRoot,
      now: failedNow,
    }),
  );
  await assert.rejects(() => access(join(failedBackupPath, 'manifest.json')), error => error?.code === 'ENOENT');

  console.log('Private server archive boundary and SQLite snapshot tests passed.');
} finally {
  liveDatabase?.close();
  await unlinkIfPresent(join(failedBackupPath, 'manifest.json'));
  await unlinkIfPresent(join(failedBackupPath, 'arena.sqlite'));
  await rmdirIfPresent(failedBackupPath);
  await rmdirIfPresent(failedBackupRoot);
  await unlinkIfPresent(failedDatabasePath);
  await unlinkIfPresent(join(liveBackupPath, 'manifest.json'));
  await unlinkIfPresent(join(liveBackupPath, 'arena.sqlite-shm'));
  await unlinkIfPresent(join(liveBackupPath, 'arena.sqlite-wal'));
  await unlinkIfPresent(join(liveBackupPath, 'arena.sqlite'));
  await rmdirIfPresent(liveBackupPath);
  await rmdirIfPresent(liveBackupRoot);
  await unlinkIfPresent(`${liveDatabasePath}-shm`);
  await unlinkIfPresent(`${liveDatabasePath}-wal`);
  await unlinkIfPresent(liveDatabasePath);
  await rmdirIfPresent(expectedBackupPath);
  await rmdirIfPresent(backupRoot);
  await rmdirIfPresent(uploadsPath);
  await rmdirIfPresent(databaseDirectory);
  await unlinkIfPresent(databasePath);
  await rmdirIfPresent(root);
}
