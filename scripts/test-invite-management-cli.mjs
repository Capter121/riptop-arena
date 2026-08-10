import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { authenticateIdentity, redeemInvite } from '../server/auth/invite-service.mjs';

const temporaryRoot = mkdtempSync(join(tmpdir(), 'nss-invite-cli-'));
const databasePath = join(temporaryRoot, 'arena.sqlite');
const emptyDatabasePath = join(temporaryRoot, 'empty.sqlite');
const cliPath = fileURLToPath(new URL('./manage-invites.mjs', import.meta.url));

function runCli(args, targetDatabasePath = databasePath) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, DATABASE_PATH: targetDatabasePath },
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

  const group = runCli(['create', '--code', 'GROUP-2026', '--max-uses', '3']);
  assert.equal(group.status, 0, group.stderr);
  const writableDatabase = new DatabaseSync(databasePath);
  try {
    writableDatabase.prepare(`
      UPDATE invites SET enabled = 0, use_count = 1, created_at = ? WHERE code = ?
    `).run('2026-01-01T00:00:00.000Z', 'FRIENDS-2026');
    writableDatabase.prepare('UPDATE invites SET created_at = ? WHERE code = ?')
      .run('2026-01-03T00:00:00.000Z', 'GROUP-2026');
    writableDatabase.prepare(`
      INSERT INTO players (id, display_name, device_token_hash, invite_code) VALUES (?, ?, ?, ?)
    `).run('hidden-player', 'Hidden Nova', 'f'.repeat(64), 'FRIENDS-2026');
  } finally {
    writableDatabase.close();
  }

  const maskedList = runCli(['list']);
  assert.equal(maskedList.status, 0, maskedList.stderr);
  assert.match(maskedList.stdout, /CODE\s+STATUS\s+USES\s+CREATED_AT/);
  assert.match(maskedList.stdout, /FR\*{8}26\s+DISABLED\s+1\/1/);
  assert.match(maskedList.stdout, /GR\*{6}26\s+ENABLED\s+0\/3/);
  assert.ok(maskedList.stdout.indexOf('GR******26') < maskedList.stdout.indexOf('FR********26'));
  for (const secret of [generatedCode, sharedCode, 'FRIENDS-2026', 'GROUP-2026', 'Hidden Nova', 'hidden-player', 'f'.repeat(64)]) {
    assert.ok(!maskedList.stdout.includes(secret), `Masked list leaked ${secret}.`);
  }

  const revealedList = runCli(['list', '--reveal']);
  assert.equal(revealedList.status, 0, revealedList.stderr);
  for (const code of [generatedCode, sharedCode, 'FRIENDS-2026', 'GROUP-2026']) {
    assert.ok(revealedList.stdout.includes(code));
  }
  assert.ok(!revealedList.stdout.includes('Hidden Nova'));

  const emptyList = runCli(['list'], emptyDatabasePath);
  assert.equal(emptyList.status, 0, emptyList.stderr);
  assert.match(emptyList.stdout, /No invite codes found/i);

  for (const args of [
    ['list', '--code', 'FRIENDS-2026'],
    ['list', '--max-uses', '2'],
    ['list', '--unknown'],
    ['list', '--reveal', '--reveal'],
  ]) {
    const invalid = runCli(args);
    assert.notEqual(invalid.status, 0, `Expected list failure for ${JSON.stringify(args)}.`);
    assert.match(invalid.stderr, /Usage:|unknown/i);
  }

  const disabled = runCli(['disable', 'GROUP-2026']);
  assert.equal(disabled.status, 0, disabled.stderr);
  assert.match(disabled.stdout, /GR\*{6}26/);
  assert.ok(!disabled.stdout.includes('GROUP-2026'));
  assert.equal(
    readDatabase(database => database.prepare('SELECT enabled FROM invites WHERE code = ?').get('GROUP-2026').enabled),
    0,
  );

  const disabledAgain = runCli(['disable', 'GROUP-2026']);
  assert.equal(disabledAgain.status, 0, disabledAgain.stderr);
  assert.match(disabledAgain.stdout, /already disabled/i);
  assert.ok(!disabledAgain.stdout.includes('GROUP-2026'));

  const missing = runCli(['disable', 'MISSING-2026']);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /not found/i);

  for (const args of [
    ['disable'],
    ['disable', 'GROUP-2026', 'EXTRA'],
  ]) {
    const invalid = runCli(args);
    assert.notEqual(invalid.status, 0, `Expected disable failure for ${JSON.stringify(args)}.`);
    assert.match(invalid.stderr, /Usage:|requires|unknown/i);
  }

  const identityCode = 'IDENTITY-2026';
  const identityInvite = runCli(['create', '--code', identityCode, '--max-uses', '2']);
  assert.equal(identityInvite.status, 0, identityInvite.stderr);
  const identityDatabase = new DatabaseSync(databasePath);
  let identity;
  try {
    identity = redeemInvite(identityDatabase, { inviteCode: identityCode, displayName: 'Nova' });
  } finally {
    identityDatabase.close();
  }

  const identityDisabled = runCli(['disable', identityCode]);
  assert.equal(identityDisabled.status, 0, identityDisabled.stderr);
  assert.ok(!identityDisabled.stdout.includes(identityCode));
  const authenticationDatabase = new DatabaseSync(databasePath);
  try {
    assert.equal(authenticateIdentity(authenticationDatabase, identity).playerId, identity.playerId);
    assert.throws(
      () => redeemInvite(authenticationDatabase, { inviteCode: identityCode, displayName: 'Rin' }),
      error => error?.code === 'INVITE_DISABLED',
    );
  } finally {
    authenticationDatabase.close();
  }

  console.log('Invite management CLI tests passed.');
} finally {
  removeIfPresent(`${emptyDatabasePath}-shm`);
  removeIfPresent(`${emptyDatabasePath}-wal`);
  removeIfPresent(emptyDatabasePath);
  removeIfPresent(`${databasePath}-shm`);
  removeIfPresent(`${databasePath}-wal`);
  removeIfPresent(databasePath);
  rmdirSync(temporaryRoot);
}
