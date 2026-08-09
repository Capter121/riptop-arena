import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, copyFile, lstat, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { backup as backupDatabase, DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

function requiredPath(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be provided.`);
  }
  return resolve(value);
}

async function pathType(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function isWithin(parentPath, candidatePath) {
  const child = relative(parentPath, candidatePath);
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`));
}

function backupDirectoryName(now) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError('Backup time must be a valid Date.');
  }
  return `nss-private-${now.toISOString().replace(/[-:.]/g, '')}`;
}

async function fileRecord(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return {
    bytes: (await stat(path)).size,
    sha256: hash.digest('hex'),
  };
}

function inspectDatabase(path) {
  const databaseUrl = pathToFileURL(path);
  databaseUrl.searchParams.set('immutable', '1');
  const database = new DatabaseSync(databaseUrl, { readOnly: true, timeout: 5_000 });
  try {
    const quickCheck = database.prepare('PRAGMA quick_check').get().quick_check;
    if (quickCheck !== 'ok') throw new Error('SQLite quick_check failed for the database snapshot.');
    const migrationVersions = database.prepare(`
      SELECT version FROM schema_migrations ORDER BY version
    `).all().map(row => row.version);
    return { quickCheck, migrationVersions };
  } finally {
    database.close();
  }
}

async function listUploadFiles(uploadsPath) {
  const files = [];

  async function visit(directoryPath) {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const sourcePath = join(directoryPath, entry.name);
      if (!isWithin(uploadsPath, sourcePath)) throw new Error('Upload path escapes the uploads directory.');
      const sourceStat = await lstat(sourcePath);
      if (sourceStat.isSymbolicLink()) throw new Error('Symbolic links are not supported in uploads.');
      if (sourceStat.isDirectory()) {
        await visit(sourcePath);
      } else if (sourceStat.isFile()) {
        files.push({
          sourcePath,
          relativePath: relative(uploadsPath, sourcePath).split(sep).join('/'),
        });
      } else {
        throw new Error('Uploads may contain only directories and regular files.');
      }
    }
  }

  await visit(uploadsPath);
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return files;
}

export async function backupPrivateServer(options = {}) {
  const databasePath = requiredPath(options.databasePath, 'Database path');
  const backupRoot = requiredPath(options.backupRoot, 'Backup root');
  const uploadsPath = options.uploadsPath == null
    ? null
    : requiredPath(options.uploadsPath, 'Uploads path');
  const now = options.now ?? new Date();
  const backupPath = join(backupRoot, backupDirectoryName(now));

  const databaseStat = await pathType(databasePath);
  if (!databaseStat?.isFile()) throw new Error('Database path must reference an existing regular file.');

  let uploadsIncluded = false;
  if (uploadsPath) {
    const uploadsStat = await pathType(uploadsPath);
    if (uploadsStat && !uploadsStat.isDirectory()) {
      throw new Error('Uploads path must reference a directory when it exists.');
    }
    uploadsIncluded = uploadsStat !== null;
    if (uploadsIncluded && isWithin(uploadsPath, backupPath)) {
      throw new Error('Backup target cannot be inside the uploads directory.');
    }
  }

  if (await pathType(backupPath)) throw new Error('Backup target already exists.');
  if (options.dryRun === true) {
    return {
      operation: 'backup',
      status: 'planned',
      dryRun: true,
      backupPath,
      databasePath,
      uploadsIncluded,
    };
  }
  const uploadFiles = uploadsIncluded ? await listUploadFiles(uploadsPath) : [];

  await mkdir(backupRoot, { recursive: true, mode: 0o700 });
  await mkdir(backupPath, { mode: 0o700 });
  const snapshotPath = join(backupPath, 'arena.sqlite');
  const sourceDatabase = new DatabaseSync(databasePath, { readOnly: true, timeout: 5_000 });
  try {
    await backupDatabase(sourceDatabase, snapshotPath);
  } finally {
    sourceDatabase.close();
  }
  await chmod(snapshotPath, 0o600);

  const inspection = inspectDatabase(snapshotPath);
  const snapshot = await fileRecord(snapshotPath);
  const uploadRecords = [];
  if (uploadsIncluded) {
    const uploadTargetRoot = join(backupPath, 'uploads');
    await mkdir(uploadTargetRoot, { mode: 0o700 });
    for (const uploadFile of uploadFiles) {
      const sourceStat = await lstat(uploadFile.sourcePath);
      if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
        throw new Error('Upload changed to a non-regular file during backup.');
      }
      const destinationPath = join(uploadTargetRoot, ...uploadFile.relativePath.split('/'));
      if (!isWithin(uploadTargetRoot, destinationPath)) throw new Error('Upload path escapes the backup directory.');
      await mkdir(dirname(destinationPath), { recursive: true, mode: 0o700 });
      await copyFile(uploadFile.sourcePath, destinationPath);
      await chmod(destinationPath, 0o600);
      uploadRecords.push({
        path: `uploads/${uploadFile.relativePath}`,
        ...await fileRecord(destinationPath),
      });
    }
  }
  const manifest = {
    formatVersion: 1,
    createdAt: now.toISOString(),
    database: {
      path: 'arena.sqlite',
      ...snapshot,
      migrationVersions: inspection.migrationVersions,
      quickCheck: inspection.quickCheck,
    },
    uploads: {
      included: uploadsIncluded,
      files: uploadRecords,
    },
  };
  await writeFile(
    join(backupPath, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: 'utf8', flag: 'wx', mode: 0o600 },
  );

  return {
    operation: 'backup',
    status: 'complete',
    dryRun: false,
    backupPath,
    databasePath,
    uploadsIncluded,
    fileCount: 1 + uploadRecords.length,
    totalBytes: snapshot.bytes + uploadRecords.reduce((total, file) => total + file.bytes, 0),
  };
}

export async function restorePrivateServer(options = {}) {
  requiredPath(options.backupPath, 'Backup path');
  throw new Error('Restore validation is not implemented.');
}
