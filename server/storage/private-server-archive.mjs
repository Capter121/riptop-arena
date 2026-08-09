import { lstat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

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

export async function backupPrivateServer(options = {}) {
  const databasePath = requiredPath(options.databasePath, 'Database path');
  const backupRoot = requiredPath(options.backupRoot, 'Backup root');
  const uploadsPath = options.uploadsPath == null
    ? null
    : requiredPath(options.uploadsPath, 'Uploads path');
  const backupPath = join(backupRoot, backupDirectoryName(options.now ?? new Date()));

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
  if (options.dryRun !== true) throw new Error('Backup creation is not implemented.');

  return {
    operation: 'backup',
    status: 'planned',
    dryRun: true,
    backupPath,
    databasePath,
    uploadsIncluded,
  };
}

export async function restorePrivateServer(options = {}) {
  requiredPath(options.backupPath, 'Backup path');
  throw new Error('Restore validation is not implemented.');
}
