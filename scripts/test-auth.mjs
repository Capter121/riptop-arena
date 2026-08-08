import assert from 'node:assert/strict';
import { openDatabase } from '../server/storage/database.mjs';
import { migrateDatabase } from '../server/storage/migrate.mjs';
import { AuthError, authenticateIdentity, redeemInvite } from '../server/auth/invite-service.mjs';
import { createArenaHttpServer } from '../server/http-server.mjs';

const database = openDatabase(':memory:');
let server;

function addInvite(code, maxUses, enabled = 1) {
  database.prepare('INSERT INTO invites (code, enabled, max_uses) VALUES (?, ?, ?)')
    .run(code, enabled, maxUses);
}

function hasCode(code) {
  return error => error instanceof AuthError && error.code === code;
}

try {
  await migrateDatabase(database);
  addInvite('VALID01', 2);
  addInvite('DISABLED01', 1, 0);

  assert.throws(() => redeemInvite(database, {
    inviteCode: 'MISSING01',
    displayName: 'Missing',
  }), hasCode('INVALID_INVITE'));
  assert.throws(() => redeemInvite(database, {
    inviteCode: 'DISABLED01',
    displayName: 'Disabled',
  }), hasCode('INVITE_DISABLED'));

  const first = redeemInvite(database, { inviteCode: 'VALID01', displayName: '  Nova  ' });
  const second = redeemInvite(database, { inviteCode: 'VALID01', displayName: 'Rin' });
  assert.equal(first.displayName, 'Nova');
  assert.notEqual(first.playerId, second.playerId);
  assert.notEqual(first.deviceToken, second.deviceToken);
  assert.match(first.playerId, /^[0-9a-f-]{36}$/);
  assert.match(first.deviceToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(database.prepare('SELECT use_count FROM invites WHERE code = ?').get('VALID01').use_count, 2);
  assert.throws(() => redeemInvite(database, {
    inviteCode: 'VALID01',
    displayName: 'Exhausted',
  }), hasCode('INVITE_EXHAUSTED'));

  const stored = database.prepare('SELECT device_token_hash FROM players WHERE id = ?').get(first.playerId);
  assert.equal(stored.device_token_hash.length, 64);
  assert.notEqual(stored.device_token_hash, first.deviceToken);
  assert.equal(authenticateIdentity(database, first).displayName, 'Nova');
  database.prepare('UPDATE invites SET enabled = 0 WHERE code = ?').run('VALID01');
  assert.equal(authenticateIdentity(database, first).playerId, first.playerId);
  const forgedToken = `${first.deviceToken.slice(0, -1)}${first.deviceToken.endsWith('x') ? 'y' : 'x'}`;
  assert.throws(() => authenticateIdentity(database, {
    playerId: first.playerId,
    deviceToken: forgedToken,
  }), hasCode('AUTH_INVALID'));

  addInvite('HTTP001', 1);
  server = createArenaHttpServer({ database });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const redeemResponse = await fetch(`${baseUrl}/api/invites/redeem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ inviteCode: 'HTTP001', displayName: 'Mika' }),
  });
  assert.equal(redeemResponse.status, 201);
  const httpIdentity = (await redeemResponse.json()).identity;
  const meResponse = await fetch(`${baseUrl}/api/me`, {
    headers: {
      authorization: `Bearer ${httpIdentity.deviceToken}`,
      'x-player-id': httpIdentity.playerId,
    },
  });
  assert.equal(meResponse.status, 200);
  assert.deepEqual((await meResponse.json()).player, {
    playerId: httpIdentity.playerId,
    displayName: 'Mika',
  });
  const forgedResponse = await fetch(`${baseUrl}/api/me`, {
    headers: {
      authorization: 'Bearer forged-token',
      'x-player-id': httpIdentity.playerId,
    },
  });
  assert.equal(forgedResponse.status, 401);
  assert.equal((await forgedResponse.json()).error.code, 'AUTH_INVALID');

  console.log('Invite identity tests passed.');
} finally {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  database.close();
}
