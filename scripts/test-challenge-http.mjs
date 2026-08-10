import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { redeemInvite } from '../server/auth/invite-service.mjs';
import { createArenaHttpServer } from '../server/http-server.mjs';
import { createDefaultProgressionSnapshot } from '../server/progression/progression-service.mjs';
import { openDatabase } from '../server/storage/database.mjs';
import { migrateDatabase } from '../server/storage/migrate.mjs';

const fixture = JSON.parse(await readFile(new URL('../tests/fixtures/challenge-contract-v1.json', import.meta.url), 'utf8'));
const database = openDatabase(':memory:');
let server;
try {
  await migrateDatabase(database);
  database.prepare('INSERT INTO invites (code, max_uses) VALUES (?, ?)').run('HTTPCHAL', 2);
  const creator = redeemInvite(database, { inviteCode: 'HTTPCHAL', displayName: 'Nova' });
  const friend = redeemInvite(database, { inviteCode: 'HTTPCHAL', displayName: 'Rin' });
  const snapshot = { ...createDefaultProgressionSnapshot(), latestNssLoadout: fixture.loadout };
  database.prepare('INSERT INTO player_progression (player_id, snapshot_json) VALUES (?, ?)').run(creator.playerId, JSON.stringify(snapshot));
  database.prepare('INSERT INTO player_progression (player_id, snapshot_json) VALUES (?, ?)').run(friend.playerId, JSON.stringify(snapshot));
  const ids = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '88888888-8888-4888-8888-888888888888',
  ];
  server = createArenaHttpServer({
    database,
    challengeServiceOptions: {
      now: () => new Date('2026-08-10T00:00:00.000Z'),
      createSeed: () => fixture.inputLog.seed,
      createId: () => ids.shift(),
    },
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const headers = identity => ({
    'content-type': 'application/json',
    authorization: `Bearer ${identity.deviceToken}`,
    'x-player-id': identity.playerId,
  });
  const createBody = {
    requestId: '44444444-4444-4444-8444-444444444444',
    mode: 'fair',
    arena: 'classic_grid',
    message: '',
  };
  assert.equal((await fetch(`${baseUrl}/api/challenge-offers`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(createBody) })).status, 401);
  const createResponse = await fetch(`${baseUrl}/api/challenge-offers`, { method: 'POST', headers: headers(creator), body: JSON.stringify(createBody) });
  assert.equal(createResponse.status, 201);
  const offer = await createResponse.json();
  assert.equal((await fetch(`${baseUrl}/api/challenge-offers/${offer.id}`, { headers: headers(friend) })).status, 200);
  const claimResponse = await fetch(`${baseUrl}/api/challenge-offers/${offer.id}/claim`, { method: 'POST', headers: headers(friend) });
  assert.equal(claimResponse.status, 201);
  const challenge = await claimResponse.json();
  assert.equal((await fetch(`${baseUrl}/api/challenges?group=waiting_me`, { headers: headers(friend) })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/challenges/${challenge.id}`, { headers: headers(creator) })).status, 200);
  const resultResponse = await fetch(`${baseUrl}/api/challenges/${challenge.id}/results`, {
    method: 'POST',
    headers: headers(friend),
    body: JSON.stringify({
      submissionId: '55555555-5555-4555-8555-555555555555',
      inputLog: fixture.inputLog,
      outcome: fixture.outcome,
    }),
  });
  assert.equal(resultResponse.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/challenges/${challenge.id}/rematch`, { method: 'POST', headers: headers(friend) })).status, 201);

  const secondCreate = await fetch(`${baseUrl}/api/challenge-offers`, {
    method: 'POST',
    headers: headers(creator),
    body: JSON.stringify({ ...createBody, requestId: '66666666-6666-4666-8666-666666666666' }),
  });
  const secondOffer = await secondCreate.json();
  assert.equal((await fetch(`${baseUrl}/api/challenge-offers/${secondOffer.id}/revoke`, { method: 'POST', headers: headers(creator) })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/challenge-offers/not-a-uuid`, { headers: headers(friend) })).status, 404);
  const malformed = await fetch(`${baseUrl}/api/challenge-offers`, { method: 'POST', headers: headers(creator), body: '{' });
  assert.equal(malformed.status, 400);
  const extra = await fetch(`${baseUrl}/api/challenge-offers`, { method: 'POST', headers: headers(creator), body: JSON.stringify({ ...createBody, requestId: '77777777-7777-4777-8777-777777777777', extra: true }) });
  assert.equal(extra.status, 400);
  const tooLarge = await fetch(`${baseUrl}/api/challenges/${challenge.id}/results`, {
    method: 'POST',
    headers: headers(friend),
    body: JSON.stringify({ padding: 'x'.repeat(2 * 1024 * 1024) }),
  });
  assert.equal(tooLarge.status, 413);
  console.log('Challenge HTTP API tests passed.');
} finally {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  database.close();
}
