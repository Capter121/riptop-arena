import { randomBytes } from 'node:crypto';
import { DEFAULT_DATABASE_PATH, openDatabase } from '../server/storage/database.mjs';
import { migrateDatabase } from '../server/storage/migrate.mjs';

const USAGE = 'Usage: npm run invite -- create [--code CODE] [--max-uses NUMBER]';
const CUSTOM_CODE = /^[A-Za-z0-9_-]{6,64}$/;

function parsePositiveInteger(value) {
  if (!/^[0-9]+$/.test(value ?? '')) throw new Error('--max-uses must be a positive integer.');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('--max-uses must be a positive safe integer.');
  }
  return parsed;
}

function parseCreateArguments(args) {
  let code;
  let maxUses = 1;
  let hasCode = false;
  let hasMaxUses = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--code' && !hasCode) {
      hasCode = true;
      code = args[++index];
      if (code === undefined) throw new Error('--code requires a value.');
    } else if (argument === '--max-uses' && !hasMaxUses) {
      hasMaxUses = true;
      const value = args[++index];
      if (value === undefined) throw new Error('--max-uses requires a value.');
      maxUses = parsePositiveInteger(value);
    } else {
      throw new Error(`Unknown argument: ${argument ?? ''}`);
    }
  }

  if (code !== undefined && !CUSTOM_CODE.test(code)) {
    throw new Error('--code must be 6-64 letters, numbers, hyphens, or underscores.');
  }
  return {
    code: code ?? `NSS-${randomBytes(10).toString('hex').toUpperCase()}`,
    maxUses,
  };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command !== 'create') throw new Error(command ? `Unknown command: ${command}` : USAGE);

  const input = parseCreateArguments(args);
  const databasePath = process.env.DATABASE_PATH || DEFAULT_DATABASE_PATH;
  const database = openDatabase(databasePath);
  try {
    await migrateDatabase(database);
    try {
      database.prepare('INSERT INTO invites (code, max_uses) VALUES (?, ?)')
        .run(input.code, input.maxUses);
    } catch (error) {
      if (/UNIQUE constraint failed: invites\.code/i.test(error.message)) {
        throw new Error(`Invite code already exists: ${input.code}`);
      }
      throw error;
    }
  } finally {
    database.close();
  }

  console.log(`Created invite: ${input.code}`);
  console.log(`Max uses: ${input.maxUses}`);
  console.log(`Database: ${databasePath}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (error?.message !== USAGE) console.error(USAGE);
  process.exitCode = 1;
}
