import { backupPrivateServer } from '../server/storage/private-server-archive.mjs';
import { DEFAULT_DATABASE_PATH } from '../server/storage/database.mjs';

function parseArguments(argv) {
  const options = { dryRun: false, output: null };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== '--dry-run' && argument !== '--output') {
      throw new Error(`Unknown argument: ${argument}`);
    }
    if (seen.has(argument)) throw new Error(`Duplicate argument: ${argument}`);
    seen.add(argument);
    if (argument === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error('--output requires a path.');
    options.output = value;
  }
  return options;
}

try {
  const arguments_ = parseArguments(process.argv.slice(2));
  const result = await backupPrivateServer({
    databasePath: process.env.DATABASE_PATH || DEFAULT_DATABASE_PATH,
    backupRoot: arguments_.output || process.env.BACKUP_ROOT,
    uploadsPath: process.env.UPLOAD_ROOT || undefined,
    dryRun: arguments_.dryRun,
  });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Private server backup failed.');
  process.exitCode = 1;
}
