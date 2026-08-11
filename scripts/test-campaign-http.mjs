import assert from 'node:assert/strict';
import { redeemInvite } from '../server/auth/invite-service.mjs';
import { createArenaHttpServer } from '../server/http-server.mjs';
import { createDefaultProgressionSnapshot } from '../server/progression/progression-service.mjs';
import { openDatabase } from '../server/storage/database.mjs';
import { migrateDatabase } from '../server/storage/migrate.mjs';

const database = openDatabase(':memory:');
let server;
try {
  await migrateDatabase(database);
  database.prepare('INSERT INTO invites (code, max_uses) VALUES (?, ?)').run('HTTPCAMP', 2);
  const player = redeemInvite(database, { inviteCode: 'HTTPCAMP', displayName: 'Nova' });
  const friend = redeemInvite(database, { inviteCode: 'HTTPCAMP', displayName: 'Rin' });
  const snapshot = createDefaultProgressionSnapshot();
  snapshot.latestNssLoadout = {
    schemaVersion: 2,
    interfaceId: 'NSS-V1',
    combination: { core: 'core_solar_wolf', blade: 'blade_orbit_halo', assist: 'assist_guard', gear: 'gear_high', tip: 'tip_needle_stamina' },
    affinities: { core: 'LIGHT', blade: 'WATER', assist: 'WATER', gear: 'WATER', tip: 'EARTH' },
  };
  for (const identity of [player, friend]) {
    database.prepare(`
      INSERT INTO player_progression (player_id, snapshot_json, initial_coins_imported)
      VALUES (?, ?, 1)
    `).run(identity.playerId, JSON.stringify(snapshot));
  }
  server = createArenaHttpServer({
    database,
    campaignServiceOptions: {
      now: () => new Date('2026-08-11T12:00:00.000Z'),
      createId: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createSeed: () => '0123456789abcdef0123456789abcdef',
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

  assert.equal((await fetch(`${baseUrl}/api/campaign`)).status, 401);
  const archiveResponse = await fetch(`${baseUrl}/api/campaign`, { headers: headers(player) });
  assert.equal(archiveResponse.status, 200);
  assert.equal((await archiveResponse.json()).nextOpponentId, 'blaze-fang');

  const locked = await fetch(`${baseUrl}/api/campaign/attempts`, {
    method: 'POST', headers: headers(player),
    body: JSON.stringify({ requestId: '11111111-1111-4111-8111-111111111111', opponentId: 'sky-gale' }),
  });
  assert.equal(locked.status, 409);
  assert.equal((await locked.json()).error.code, 'CAMPAIGN_OPPONENT_LOCKED');

  const startResponse = await fetch(`${baseUrl}/api/campaign/attempts`, {
    method: 'POST', headers: headers(player),
    body: JSON.stringify({ requestId: '22222222-2222-4222-8222-222222222222', opponentId: 'blaze-fang' }),
  });
  assert.equal(startResponse.status, 201);
  const attempt = await startResponse.json();
  assert.equal(attempt.attemptId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(attempt.seed, '0123456789abcdef0123456789abcdef');

  const resultBody = {
    requestId: '33333333-3333-4333-8333-333333333333',
    outcome: {
      simulationVersion: 1,
      seed: attempt.seed,
      winner: 'player',
      kind: 'spin finish',
      turnCount: 6,
      tickCount: 900,
      player: { spin: 50, integrity: 100, stamina: 30, spirit: 20, burst: 10, tilt: 0.5, alive: true },
      enemy: { spin: 0, integrity: 0, stamina: 0, spirit: 0, burst: 100, tilt: 1, alive: false },
    },
  };
  assert.equal((await fetch(`${baseUrl}/api/campaign/attempts/${attempt.attemptId}/result`, {
    method: 'POST', headers: headers(friend), body: JSON.stringify(resultBody),
  })).status, 403);
  const resultResponse = await fetch(`${baseUrl}/api/campaign/attempts/${attempt.attemptId}/result`, {
    method: 'POST', headers: headers(player), body: JSON.stringify(resultBody),
  });
  assert.equal(resultResponse.status, 200);
  const result = await resultResponse.json();
  assert.equal(result.progress.nextOpponentId, 'sky-gale');
  assert.equal(result.progression.coins, 325);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/campaign/attempts/${attempt.attemptId}/result`, {
    method: 'POST', headers: headers(player), body: JSON.stringify(resultBody),
  })).json(), result);

  const malformed = await fetch(`${baseUrl}/api/campaign/attempts`, {
    method: 'POST', headers: headers(player), body: '{',
  });
  assert.equal(malformed.status, 400);
  const media = await fetch(`${baseUrl}/api/campaign/attempts`, {
    method: 'POST', headers: { ...headers(player), 'content-type': 'text/plain' }, body: '{}',
  });
  assert.equal(media.status, 415);
  const oversized = await fetch(`${baseUrl}/api/campaign/attempts`, {
    method: 'POST', headers: headers(player), body: JSON.stringify({ padding: 'x'.repeat(65 * 1024) }),
  });
  assert.equal(oversized.status, 413);

  console.log('Campaign HTTP API tests passed.');
} finally {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  database.close();
}
