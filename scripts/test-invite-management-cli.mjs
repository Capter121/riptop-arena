import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const temporaryRoot = mkdtempSync(join(tmpdir(), 'nss-invite-cli-'));
const databasePath = join(temporaryRoot, 'arena.sqlite');
const cliPath = fileURLToPath(new URL('./manage-invites.mjs', import.meta.url));

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, DATABASE_PATH: databasePath },
    windowsHide: true,
  });
}

function readDatabase(callback) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return callback(database);
  } finally {
    database.close();
  }
}

function removeIfPresent(path) {
  if (existsSync(path)) unlinkSync(path);
}

try {
  const created = runCli(['create']);
  assert.equal(created.status, 0, created.stderr);
  const generatedCode = created.stdout.match(/NSS-[0-9A-F]{20}/)?.[0];
  assert.ok(generatedCode, created.stdout);
  assert.match(created.stdout, /Max uses:\s+1/i);
  assert.ok(created.stdout.includes(databasePath));

  readDatabase(database => {
    assert.deepEqual(
      database.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(row => row.version),
      [1, 2, 3, 4],
    );
    assert.deepEqual(
      { ...database.prepare('SELECT code, enabled, max_uses, use_count FROM invites WHERE code = ?').get(generatedCode) },
      { code: generatedCode, enabled: 1, max_uses: 1, use_count: 0 },
    );
  });

  const shared = runCli(['create', '--max-uses', '5']);
  assert.equal(shared.status, 0, shared.stderr);
  const sharedCode = shared.stdout.match(/NSS-[0-9A-F]{20}/)?.[0];
  assert.ok(sharedCode, shared.stdout);
  assert.equal(
    readDatabase(database => database.prepare('SELECT max_uses FROM invites WHERE code = ?').get(sharedCode).max_uses),
    5,
  );

  const custom = runCli(['create', '--code', 'FRIENDS-2026']);
  assert.equal(custom.status, 0, custom.stderr);
  assert.match(custom.stdout, /FRIENDS-2026/);
  assert.equal(
    readDatabase(database => database.prepare('SELECT max_uses FROM invites WHERE code = ?').get('FRIENDS-2026').max_uses),
    1,
  );

  const duplicate = runCli(['create', '--code', 'FRIENDS-2026', '--max-uses', '9']);
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /already exists/i);
  assert.equal(
    readDatabase(database => database.prepare('SELECT max_uses FROM invites WHERE code = ?').get('FRIENDS-2026').max_uses),
    1,
  );

  for (const args of [
    ['create', '--code', 'SHORT'],
    ['create', '--code', 'A'.repeat(65)],
    ['create', '--code', ' BAD123 '],
    ['create', '--code', 'BAD.CODE'],
    ['create', '--max-uses', '0'],
    ['create', '--max-uses', '-1'],
    ['create', '--max-uses', '1.5'],
    ['create', '--max-uses', 'many'],
    ['create', '--max-uses', '9007199254740992'],
    ['create', '--code'],
    ['create', '--unknown'],
    ['unknown'],
    [],
  ]) {
    const invalid = runCli(args);
    assert.notEqual(invalid.status, 0, `Expected failure for ${JSON.stringify(args)}.`);
    assert.match(invalid.stderr, /Usage:|must|unknown|requires/i);
  }

  console.log('Invite management CLI creation tests passed.');
} finally {
  removeIfPresent(`${databasePath}-shm`);
  removeIfPresent(`${databasePath}-wal`);
  removeIfPresent(databasePath);
  rmdirSync(temporaryRoot);
}
