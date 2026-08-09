import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import {
  backupPrivateServer,
  restorePrivateServer,
} from '../server/storage/private-server-archive.mjs';

const root = await mkdtemp(join(tmpdir(), 'nss-private-archive-'));
const databasePath = join(root, 'arena.sqlite');
const databaseDirectory = join(root, 'database-directory');
const uploadsPath = join(root, 'uploads');
const backupRoot = join(root, 'backups');
const now = new Date('2026-08-09T01:02:03.004Z');
const expectedBackupPath = join(backupRoot, 'nss-private-20260809T010203004Z');

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

  console.log('Private server archive boundary tests passed.');
} finally {
  await rmdir(expectedBackupPath);
  await rmdir(backupRoot);
  await rmdir(uploadsPath);
  await rmdir(databaseDirectory);
  await unlink(databasePath);
  await rmdir(root);
}
