import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rmdir,
  stat,
  symlink,
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
const uploadBackupRoot = join(root, 'upload-backups');
const uploadNow = new Date('2026-08-09T01:02:06.007Z');
const uploadBackupPath = join(uploadBackupRoot, 'nss-private-20260809T010206007Z');
const uploadNestedPath = join(uploadsPath, 'badges');
const uploadBadgePath = join(uploadNestedPath, 'badge..v1.txt');
const uploadEmblemPath = join(uploadsPath, 'emblem.webp');
const uploadLinkPath = join(uploadsPath, 'linked.webp');
const linkBackupRoot = join(root, 'link-backups');
const linkNow = new Date('2026-08-09T01:02:07.008Z');
const linkBackupPath = join(linkBackupRoot, 'nss-private-20260809T010207008Z');
const restoreDatabasePath = join(root, 'restored.sqlite');
const restoreUploadsPath = join(root, 'restored-uploads');
const unexpectedArchiveFile = join(liveBackupPath, 'unexpected.txt');
const futureBackupPath = join(root, 'future-backup');
const futureDatabasePath = join(futureBackupPath, 'arena.sqlite');
const oldSourcePath = join(root, 'old.sqlite');
const oldBackupRoot = join(root, 'old-backups');
const oldNow = new Date('2026-08-09T01:02:08.009Z');
const oldBackupPath = join(oldBackupRoot, 'nss-private-20260809T010208009Z');
const uploadRestoreDatabasePath = join(root, 'upload-restored.sqlite');
const oldRestoreDatabasePath = join(root, 'old-restored.sqlite');
const failedRestoreDatabasePath = join(root, 'failed-restored.sqlite');
const failedRestoreUploadsPath = join(root, 'failed-restored-uploads');
const restoreSentinelPath = join(restoreUploadsPath, 'keep.txt');

let liveDatabase;
let oldDatabase;
let restoredOldDatabase;
let uploadLinkCreated = false;

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

  await assert.rejects(
    () => backupPrivateServer({
      databasePath: liveDatabasePath,
      backupRoot: uploadBackupRoot,
      uploadsPath: databasePath,
      dryRun: true,
      now: uploadNow,
    }),
    /uploads path must reference a directory/i,
  );

  await mkdir(uploadNestedPath);
  await writeFile(uploadBadgePath, 'badge recipe', 'utf8');
  await writeFile(uploadEmblemPath, Buffer.from([0, 1, 2, 3, 4]));
  const uploadBackup = await backupPrivateServer({
    databasePath: liveDatabasePath,
    backupRoot: uploadBackupRoot,
    uploadsPath,
    now: uploadNow,
  });
  const uploadManifest = JSON.parse(await readFile(join(uploadBackupPath, 'manifest.json'), 'utf8'));
  assert.equal(uploadBackup.uploadsIncluded, true);
  assert.equal(uploadBackup.fileCount, 3);
  assert.deepEqual(uploadManifest.uploads, {
    included: true,
    files: [
      {
        path: 'uploads/badges/badge..v1.txt',
        bytes: (await stat(uploadBadgePath)).size,
        sha256: await sha256(uploadBadgePath),
      },
      {
        path: 'uploads/emblem.webp',
        bytes: (await stat(uploadEmblemPath)).size,
        sha256: await sha256(uploadEmblemPath),
      },
    ],
  });
  assert.equal(
    uploadBackup.totalBytes,
    uploadManifest.database.bytes + uploadManifest.uploads.files.reduce((sum, file) => sum + file.bytes, 0),
  );
  assert.equal(await readFile(join(uploadBackupPath, 'uploads', 'badges', 'badge..v1.txt'), 'utf8'), 'badge recipe');
  assert.deepEqual(
    await readFile(join(uploadBackupPath, 'uploads', 'emblem.webp')),
    Buffer.from([0, 1, 2, 3, 4]),
  );

  try {
    await symlink(uploadEmblemPath, uploadLinkPath, 'file');
    uploadLinkCreated = true;
  } catch (error) {
    if (error?.code !== 'EPERM' && error?.code !== 'EACCES') throw error;
  }
  if (uploadLinkCreated) {
    await assert.rejects(
      () => backupPrivateServer({
        databasePath: liveDatabasePath,
        backupRoot: linkBackupRoot,
        uploadsPath,
        now: linkNow,
      }),
      /symbolic links.*not supported/i,
    );
    await assert.rejects(() => access(linkBackupPath), error => error?.code === 'ENOENT');
  }

  const liveManifestPath = join(liveBackupPath, 'manifest.json');
  const originalLiveManifestText = await readFile(liveManifestPath, 'utf8');
  const originalLiveManifest = JSON.parse(originalLiveManifestText);
  const originalLiveDatabase = await readFile(join(liveBackupPath, 'arena.sqlite'));
  const liveRestoreOptions = {
    backupPath: liveBackupPath,
    databasePath: restoreDatabasePath,
    uploadsPath,
    dryRun: true,
  };

  const liveRestorePlan = await restorePrivateServer(liveRestoreOptions);
  assert.deepEqual(liveRestorePlan, {
    operation: 'restore',
    status: 'planned',
    dryRun: true,
    backupPath: liveBackupPath,
    databasePath: restoreDatabasePath,
    uploadsIncluded: false,
    fileCount: 1,
    totalBytes: originalLiveManifest.database.bytes,
  });
  await assert.rejects(() => access(restoreDatabasePath), error => error?.code === 'ENOENT');

  const uploadRestorePlan = await restorePrivateServer({
    backupPath: uploadBackupPath,
    databasePath: restoreDatabasePath,
    uploadsPath: restoreUploadsPath,
    dryRun: true,
  });
  assert.equal(uploadRestorePlan.uploadsIncluded, true);
  assert.equal(uploadRestorePlan.fileCount, 3);
  await assert.rejects(() => access(restoreUploadsPath), error => error?.code === 'ENOENT');
  await assert.rejects(
    () => restorePrivateServer({
      backupPath: uploadBackupPath,
      databasePath: restoreDatabasePath,
      dryRun: true,
    }),
    /uploads path.*provided/i,
  );

  async function expectManifestRejected(change, pattern) {
    const changedManifest = structuredClone(originalLiveManifest);
    change(changedManifest);
    await writeFile(liveManifestPath, `${JSON.stringify(changedManifest, null, 2)}\n`, 'utf8');
    try {
      await assert.rejects(() => restorePrivateServer(liveRestoreOptions), pattern);
    } finally {
      await writeFile(liveManifestPath, originalLiveManifestText, 'utf8');
    }
  }

  await expectManifestRejected(manifest => { manifest.formatVersion = 2; }, /format version/i);
  await expectManifestRejected(manifest => { manifest.unexpected = true; }, /manifest keys/i);
  await expectManifestRejected(manifest => { delete manifest.database.quickCheck; }, /database manifest keys/i);
  await expectManifestRejected(manifest => { manifest.database.sha256 = '0'.repeat(64); }, /hash mismatch/i);
  await expectManifestRejected(manifest => {
    manifest.database.migrationVersions = [1, 2, 999];
  }, /migration versions.*database/i);

  await writeFile(liveManifestPath, '{', 'utf8');
  try {
    await assert.rejects(() => restorePrivateServer(liveRestoreOptions), /manifest is not valid json/i);
  } finally {
    await writeFile(liveManifestPath, originalLiveManifestText, 'utf8');
  }

  await unlink(liveManifestPath);
  try {
    await assert.rejects(() => restorePrivateServer(liveRestoreOptions), /manifest must be a regular file/i);
  } finally {
    await writeFile(liveManifestPath, originalLiveManifestText, 'utf8');
  }

  const originalUploadManifestText = await readFile(join(uploadBackupPath, 'manifest.json'), 'utf8');
  const originalUploadManifest = JSON.parse(originalUploadManifestText);
  const traversalManifest = structuredClone(originalUploadManifest);
  traversalManifest.uploads.files[0].path = 'uploads/../outside.txt';
  await writeFile(
    join(uploadBackupPath, 'manifest.json'),
    `${JSON.stringify(traversalManifest, null, 2)}\n`,
    'utf8',
  );
  try {
    await assert.rejects(
      () => restorePrivateServer({
        backupPath: uploadBackupPath,
        databasePath: restoreDatabasePath,
        uploadsPath: restoreUploadsPath,
        dryRun: true,
      }),
      /path.*invalid/i,
    );
  } finally {
    await writeFile(join(uploadBackupPath, 'manifest.json'), originalUploadManifestText, 'utf8');
  }

  const duplicateManifest = structuredClone(originalUploadManifest);
  duplicateManifest.uploads.files.push(structuredClone(duplicateManifest.uploads.files[0]));
  await writeFile(
    join(uploadBackupPath, 'manifest.json'),
    `${JSON.stringify(duplicateManifest, null, 2)}\n`,
    'utf8',
  );
  try {
    await assert.rejects(
      () => restorePrivateServer({
        backupPath: uploadBackupPath,
        databasePath: restoreDatabasePath,
        uploadsPath: restoreUploadsPath,
        dryRun: true,
      }),
      /duplicate paths/i,
    );
  } finally {
    await writeFile(join(uploadBackupPath, 'manifest.json'), originalUploadManifestText, 'utf8');
  }

  await writeFile(unexpectedArchiveFile, 'not declared', 'utf8');
  try {
    await assert.rejects(() => restorePrivateServer(liveRestoreOptions), /archive contents.*manifest/i);
  } finally {
    await unlinkIfPresent(unexpectedArchiveFile);
  }

  await unlink(join(liveBackupPath, 'arena.sqlite'));
  try {
    await assert.rejects(() => restorePrivateServer(liveRestoreOptions), /archive contents.*manifest/i);
  } finally {
    await writeFile(join(liveBackupPath, 'arena.sqlite'), originalLiveDatabase);
  }

  const corruptDatabase = Buffer.from('not a sqlite database');
  const corruptManifest = structuredClone(originalLiveManifest);
  corruptManifest.database.bytes = corruptDatabase.length;
  corruptManifest.database.sha256 = createHash('sha256').update(corruptDatabase).digest('hex');
  await writeFile(join(liveBackupPath, 'arena.sqlite'), corruptDatabase);
  await writeFile(liveManifestPath, `${JSON.stringify(corruptManifest, null, 2)}\n`, 'utf8');
  try {
    await assert.rejects(() => restorePrivateServer(liveRestoreOptions), /sqlite|database/i);
  } finally {
    await writeFile(join(liveBackupPath, 'arena.sqlite'), originalLiveDatabase);
    await writeFile(liveManifestPath, originalLiveManifestText, 'utf8');
  }

  await mkdir(futureBackupPath);
  await copyFile(join(liveBackupPath, 'arena.sqlite'), futureDatabasePath);
  const futureDatabase = new DatabaseSync(futureDatabasePath);
  futureDatabase.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
    .run(999, 'future_migration');
  futureDatabase.close();
  const futureManifest = structuredClone(originalLiveManifest);
  futureManifest.database.bytes = (await stat(futureDatabasePath)).size;
  futureManifest.database.sha256 = await sha256(futureDatabasePath);
  futureManifest.database.migrationVersions = [1, 2, 3, 999];
  await writeFile(join(futureBackupPath, 'manifest.json'), `${JSON.stringify(futureManifest, null, 2)}\n`, 'utf8');
  await assert.rejects(
    () => restorePrivateServer({
      backupPath: futureBackupPath,
      databasePath: restoreDatabasePath,
      dryRun: true,
    }),
    /newer migration/i,
  );

  oldDatabase = openDatabase(oldSourcePath);
  oldDatabase.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);
  oldDatabase.exec(await readFile(new URL('../server/storage/migrations/001_identity.sql', import.meta.url), 'utf8'));
  oldDatabase.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(1, 'identity');
  await backupPrivateServer({
    databasePath: oldSourcePath,
    backupRoot: oldBackupRoot,
    now: oldNow,
  });
  const oldRestorePlan = await restorePrivateServer({
    backupPath: oldBackupPath,
    databasePath: restoreDatabasePath,
    dryRun: true,
  });
  assert.equal(oldRestorePlan.fileCount, 1);

  await writeFile(restoreDatabasePath, 'do not overwrite', 'utf8');
  await assert.rejects(
    () => restorePrivateServer({
      backupPath: liveBackupPath,
      databasePath: restoreDatabasePath,
    }),
    /database target already exists/i,
  );
  assert.equal(await readFile(restoreDatabasePath, 'utf8'), 'do not overwrite');
  await unlink(restoreDatabasePath);

  await mkdir(restoreUploadsPath);
  await writeFile(restoreSentinelPath, 'do not overwrite uploads', 'utf8');
  await assert.rejects(
    () => restorePrivateServer({
      backupPath: uploadBackupPath,
      databasePath: uploadRestoreDatabasePath,
      uploadsPath: restoreUploadsPath,
    }),
    /uploads target already exists/i,
  );
  assert.equal(await readFile(restoreSentinelPath, 'utf8'), 'do not overwrite uploads');
  await unlink(restoreSentinelPath);
  await rmdir(restoreUploadsPath);

  const restoredLive = await restorePrivateServer({
    backupPath: liveBackupPath,
    databasePath: restoreDatabasePath,
    uploadsPath,
  });
  assert.equal(restoredLive.status, 'complete');
  assert.equal(restoredLive.uploadsIncluded, false);
  assert.equal((await readdir(uploadsPath)).includes('emblem.webp'), true);
  const restoredLiveDatabase = new DatabaseSync(immutableDatabaseUrl(restoreDatabasePath), { readOnly: true });
  try {
    assert.equal(
      restoredLiveDatabase.prepare('SELECT coins FROM player_progression WHERE player_id = ?')
        .get('backup-player').coins,
      275,
    );
  } finally {
    restoredLiveDatabase.close();
  }

  const restoredUpload = await restorePrivateServer({
    backupPath: uploadBackupPath,
    databasePath: uploadRestoreDatabasePath,
    uploadsPath: restoreUploadsPath,
  });
  assert.equal(restoredUpload.status, 'complete');
  assert.equal(restoredUpload.fileCount, 3);
  assert.equal(await sha256(uploadRestoreDatabasePath), originalUploadManifest.database.sha256);
  assert.equal(
    await sha256(join(restoreUploadsPath, 'badges', 'badge..v1.txt')),
    originalUploadManifest.uploads.files[0].sha256,
  );
  assert.equal(
    await sha256(join(restoreUploadsPath, 'emblem.webp')),
    originalUploadManifest.uploads.files[1].sha256,
  );

  await restorePrivateServer({
    backupPath: oldBackupPath,
    databasePath: oldRestoreDatabasePath,
  });
  restoredOldDatabase = openDatabase(oldRestoreDatabasePath);
  assert.deepEqual(await migrateDatabase(restoredOldDatabase), [2, 3]);
  assert.deepEqual(
    restoredOldDatabase.prepare('SELECT version FROM schema_migrations ORDER BY version').all()
      .map(row => row.version),
    [1, 2, 3],
  );
  restoredOldDatabase.close();
  restoredOldDatabase = null;

  let restoreCopyCount = 0;
  await assert.rejects(
    () => restorePrivateServer({
      backupPath: uploadBackupPath,
      databasePath: failedRestoreDatabasePath,
      uploadsPath: failedRestoreUploadsPath,
      copyFileImpl: async (...args) => {
        restoreCopyCount += 1;
        if (restoreCopyCount === 2) throw new Error('simulated upload copy failure');
        await copyFile(...args);
      },
    }),
    /simulated upload copy failure/i,
  );
  assert.equal(restoreCopyCount, 2);
  await assert.rejects(() => access(failedRestoreDatabasePath), error => error?.code === 'ENOENT');
  assert.equal(
    await readFile(join(failedRestoreUploadsPath, 'badges', 'badge..v1.txt'), 'utf8'),
    'badge recipe',
  );

  await writeFile(failedDatabasePath, 'not a sqlite database', 'utf8');
  await assert.rejects(
    () => backupPrivateServer({
      databasePath: failedDatabasePath,
      backupRoot: failedBackupRoot,
      now: failedNow,
    }),
  );
  await assert.rejects(() => access(join(failedBackupPath, 'manifest.json')), error => error?.code === 'ENOENT');

  console.log('Private server backup and restore validation tests passed.');
} finally {
  liveDatabase?.close();
  oldDatabase?.close();
  restoredOldDatabase?.close();
  await unlinkIfPresent(join(failedRestoreUploadsPath, 'badges', 'badge..v1.txt'));
  await rmdirIfPresent(join(failedRestoreUploadsPath, 'badges'));
  await unlinkIfPresent(join(failedRestoreUploadsPath, 'emblem.webp'));
  await rmdirIfPresent(failedRestoreUploadsPath);
  await unlinkIfPresent(failedRestoreDatabasePath);
  await unlinkIfPresent(join(restoreUploadsPath, 'badges', 'badge..v1.txt'));
  await rmdirIfPresent(join(restoreUploadsPath, 'badges'));
  await unlinkIfPresent(join(restoreUploadsPath, 'emblem.webp'));
  await unlinkIfPresent(restoreSentinelPath);
  await rmdirIfPresent(restoreUploadsPath);
  await unlinkIfPresent(`${uploadRestoreDatabasePath}-shm`);
  await unlinkIfPresent(`${uploadRestoreDatabasePath}-wal`);
  await unlinkIfPresent(uploadRestoreDatabasePath);
  await unlinkIfPresent(restoreDatabasePath);
  await unlinkIfPresent(`${oldRestoreDatabasePath}-shm`);
  await unlinkIfPresent(`${oldRestoreDatabasePath}-wal`);
  await unlinkIfPresent(oldRestoreDatabasePath);
  await unlinkIfPresent(unexpectedArchiveFile);
  await unlinkIfPresent(join(futureBackupPath, 'manifest.json'));
  await unlinkIfPresent(`${futureDatabasePath}-shm`);
  await unlinkIfPresent(`${futureDatabasePath}-wal`);
  await unlinkIfPresent(futureDatabasePath);
  await rmdirIfPresent(futureBackupPath);
  await unlinkIfPresent(join(oldBackupPath, 'manifest.json'));
  await unlinkIfPresent(join(oldBackupPath, 'arena.sqlite'));
  await rmdirIfPresent(oldBackupPath);
  await rmdirIfPresent(oldBackupRoot);
  await unlinkIfPresent(`${oldSourcePath}-shm`);
  await unlinkIfPresent(`${oldSourcePath}-wal`);
  await unlinkIfPresent(oldSourcePath);
  if (uploadLinkCreated) await unlinkIfPresent(uploadLinkPath);
  await unlinkIfPresent(join(linkBackupPath, 'manifest.json'));
  await unlinkIfPresent(join(linkBackupPath, 'arena.sqlite'));
  await rmdirIfPresent(linkBackupPath);
  await rmdirIfPresent(linkBackupRoot);
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
  await unlinkIfPresent(join(uploadBackupPath, 'manifest.json'));
  await unlinkIfPresent(join(uploadBackupPath, 'uploads', 'badges', 'badge..v1.txt'));
  await rmdirIfPresent(join(uploadBackupPath, 'uploads', 'badges'));
  await unlinkIfPresent(join(uploadBackupPath, 'uploads', 'emblem.webp'));
  await rmdirIfPresent(join(uploadBackupPath, 'uploads'));
  await unlinkIfPresent(join(uploadBackupPath, 'arena.sqlite'));
  await rmdirIfPresent(uploadBackupPath);
  await rmdirIfPresent(uploadBackupRoot);
  await rmdirIfPresent(expectedBackupPath);
  await rmdirIfPresent(backupRoot);
  await unlinkIfPresent(uploadBadgePath);
  await rmdirIfPresent(uploadNestedPath);
  await unlinkIfPresent(uploadEmblemPath);
  await rmdirIfPresent(uploadsPath);
  await rmdirIfPresent(databaseDirectory);
  await unlinkIfPresent(databasePath);
  await rmdirIfPresent(root);
}
