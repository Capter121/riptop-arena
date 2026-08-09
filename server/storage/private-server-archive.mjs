import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, copyFile, lstat, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import { backup as backupDatabase, DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MIGRATIONS_PATH = fileURLToPath(new URL('./migrations/', import.meta.url));
const MIGRATION_NAME = /^(\d{3})_[a-z0-9_]+\.sql$/;
const SHA256 = /^[a-f0-9]{64}$/;

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

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isPlainObject(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

function validFileRecord(value) {
  return hasExactKeys(value, ['path', 'bytes', 'sha256'])
    && typeof value.path === 'string'
    && Number.isSafeInteger(value.bytes)
    && value.bytes >= 0
    && typeof value.sha256 === 'string'
    && SHA256.test(value.sha256);
}

function validArchiveFilePath(path) {
  if (typeof path !== 'string' || path.length === 0 || path.includes('\\')) return false;
  if (path !== posix.normalize(path) || posix.isAbsolute(path) || /^[A-Za-z]:/.test(path)) return false;
  return path.split('/').every(part => part.length > 0 && part !== '.' && part !== '..');
}

function validateManifest(value) {
  if (!hasExactKeys(value, ['formatVersion', 'createdAt', 'database', 'uploads'])) {
    throw new Error('Invalid backup manifest keys.');
  }
  if (value.formatVersion !== 1) throw new Error('Unsupported backup format version.');
  const createdAt = new Date(value.createdAt);
  if (typeof value.createdAt !== 'string'
    || !Number.isFinite(createdAt.getTime())
    || createdAt.toISOString() !== value.createdAt) {
    throw new Error('Invalid backup creation time.');
  }
  if (!hasExactKeys(
    value.database,
    ['path', 'bytes', 'sha256', 'migrationVersions', 'quickCheck'],
  )) {
    throw new Error('Invalid database manifest keys.');
  }
  if (!validFileRecord({
    path: value.database.path,
    bytes: value.database.bytes,
    sha256: value.database.sha256,
  }) || value.database.path !== 'arena.sqlite' || value.database.quickCheck !== 'ok') {
    throw new Error('Invalid database manifest record.');
  }
  if (!Array.isArray(value.database.migrationVersions)
    || value.database.migrationVersions.some(version => !Number.isSafeInteger(version) || version <= 0)
    || value.database.migrationVersions.some((version, index, versions) => index > 0 && version <= versions[index - 1])) {
    throw new Error('Invalid database migration versions.');
  }
  if (!hasExactKeys(value.uploads, ['included', 'files'])
    || typeof value.uploads.included !== 'boolean'
    || !Array.isArray(value.uploads.files)) {
    throw new Error('Invalid uploads manifest.');
  }
  if (!value.uploads.included && value.uploads.files.length > 0) {
    throw new Error('Uploads cannot contain files when they are not included.');
  }
  const seenPaths = new Set();
  for (const file of value.uploads.files) {
    if (!validFileRecord(file)
      || !file.path.startsWith('uploads/')
      || !validArchiveFilePath(file.path)) {
      throw new Error('Upload manifest path is invalid.');
    }
    if (seenPaths.has(file.path)) throw new Error('Upload manifest contains duplicate paths.');
    seenPaths.add(file.path);
  }
  return value;
}

async function listArchiveEntries(backupPath) {
  const files = [];
  const directories = [];

  async function visit(directoryPath, relativeDirectory = '') {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const entryPath = join(directoryPath, entry.name);
      const entryStat = await lstat(entryPath);
      if (entryStat.isSymbolicLink()) throw new Error('Backup archives cannot contain symbolic links.');
      const archivePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (!validArchiveFilePath(archivePath)) throw new Error('Backup archive path is invalid.');
      if (entryStat.isDirectory()) {
        directories.push(archivePath);
        await visit(entryPath, archivePath);
      } else if (entryStat.isFile()) {
        files.push(archivePath);
      } else {
        throw new Error('Backup archives may contain only directories and regular files.');
      }
    }
  }

  await visit(backupPath);
  return {
    files: files.sort(),
    directories: directories.sort(),
  };
}

function expectedArchiveDirectories(uploadFiles, uploadsIncluded) {
  const directories = new Set(uploadsIncluded ? ['uploads'] : []);
  for (const file of uploadFiles) {
    let parent = posix.dirname(file.path);
    while (parent !== '.') {
      directories.add(parent);
      parent = posix.dirname(parent);
    }
  }
  return [...directories].sort();
}

async function supportedMigrationVersions() {
  const versions = [];
  for (const filename of await readdir(MIGRATIONS_PATH)) {
    const match = MIGRATION_NAME.exec(filename);
    if (match) versions.push(Number(match[1]));
  }
  return versions.sort((left, right) => left - right);
}

async function inspectArchive(backupPath) {
  const backupStat = await pathType(backupPath);
  if (!backupStat?.isDirectory() || backupStat.isSymbolicLink()) {
    throw new Error('Backup path must reference an existing regular directory.');
  }
  const manifestPath = join(backupPath, 'manifest.json');
  const manifestStat = await pathType(manifestPath);
  if (!manifestStat?.isFile() || manifestStat.isSymbolicLink()) {
    throw new Error('Backup manifest must be a regular file.');
  }

  let manifestValue;
  try {
    manifestValue = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    throw new Error('Backup manifest is not valid JSON.');
  }
  const manifest = validateManifest(manifestValue);
  const entries = await listArchiveEntries(backupPath);
  const expectedFiles = [
    'arena.sqlite',
    'manifest.json',
    ...manifest.uploads.files.map(file => file.path),
  ].sort();
  const expectedDirectories = expectedArchiveDirectories(
    manifest.uploads.files,
    manifest.uploads.included,
  );
  if (entries.files.join('\0') !== expectedFiles.join('\0')
    || entries.directories.join('\0') !== expectedDirectories.join('\0')) {
    throw new Error('Backup archive contents do not match the manifest.');
  }

  const databasePath = join(backupPath, 'arena.sqlite');
  const databaseRecord = await fileRecord(databasePath);
  if (databaseRecord.bytes !== manifest.database.bytes) {
    throw new Error('Database size mismatch.');
  }
  if (databaseRecord.sha256 !== manifest.database.sha256) {
    throw new Error('Database hash mismatch.');
  }
  for (const upload of manifest.uploads.files) {
    const uploadPath = join(backupPath, ...upload.path.split('/'));
    if (!isWithin(backupPath, uploadPath)) throw new Error('Upload manifest path is invalid.');
    const record = await fileRecord(uploadPath);
    if (record.bytes !== upload.bytes) throw new Error(`Upload size mismatch: ${upload.path}`);
    if (record.sha256 !== upload.sha256) throw new Error(`Upload hash mismatch: ${upload.path}`);
  }

  const inspection = inspectDatabase(databasePath);
  if (inspection.migrationVersions.join('\0') !== manifest.database.migrationVersions.join('\0')) {
    throw new Error('Manifest migration versions do not match the database.');
  }
  const supportedVersions = await supportedMigrationVersions();
  for (let index = 0; index < inspection.migrationVersions.length; index += 1) {
    if (inspection.migrationVersions[index] !== supportedVersions[index]) {
      throw new Error('Backup requires a newer migration or has an incompatible migration history.');
    }
  }

  return {
    manifest,
    fileCount: 1 + manifest.uploads.files.length,
    totalBytes: manifest.database.bytes
      + manifest.uploads.files.reduce((total, file) => total + file.bytes, 0),
  };
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
  const backupPath = requiredPath(options.backupPath, 'Backup path');
  const databasePath = requiredPath(options.databasePath, 'Database path');
  const archive = await inspectArchive(backupPath);
  if (isWithin(backupPath, databasePath)) throw new Error('Restore target cannot be inside the backup archive.');
  if (await pathType(databasePath)) throw new Error('Restore database target already exists.');

  let uploadsPath = null;
  if (archive.manifest.uploads.included) {
    uploadsPath = requiredPath(options.uploadsPath, 'Uploads path');
    if (isWithin(backupPath, uploadsPath)) throw new Error('Restore target cannot be inside the backup archive.');
    if (await pathType(uploadsPath)) throw new Error('Restore uploads target already exists.');
  }
  if (options.dryRun !== true) throw new Error('Restore creation is not implemented.');

  return {
    operation: 'restore',
    status: 'planned',
    dryRun: true,
    backupPath,
    databasePath,
    uploadsIncluded: archive.manifest.uploads.included,
    fileCount: archive.fileCount,
    totalBytes: archive.totalBytes,
  };
}
