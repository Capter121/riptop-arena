import assert from 'node:assert/strict';
import { redeemInvite } from '../server/auth/invite-service.mjs';
import { createArenaHttpServer } from '../server/http-server.mjs';
import { createDefaultProgressionSnapshot } from '../server/progression/progression-service.mjs';
import { openDatabase } from '../server/storage/database.mjs';
import { migrateDatabase } from '../server/storage/migrate.mjs';

const RUN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const START = '11111111-1111-4111-8111-111111111111';
const RESUME = '22222222-2222-4222-8222-222222222222';
const RESULT = '33333333-3333-4333-8333-333333333333';
const REWARD = '44444444-4444-4444-8444-444444444444';
const ABANDON = '55555555-5555-4555-8555-555555555555';
const SEED = '0123456789abcdef0123456789abcdef';

const database = openDatabase(':memory:');
let server;
try {
  await migrateDatabase(database);
  database.prepare('INSERT INTO invites (code, max_uses) VALUES (?, ?)').run('HTTPSURV', 2);
  const player = redeemInvite(database, { inviteCode: 'HTTPSURV', displayName: 'Nova' });
  const friend = redeemInvite(database, { inviteCode: 'HTTPSURV', displayName: 'Rin' });
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
    survivalServiceOptions: {
      now: () => new Date('2026-08-12T12:00:00.000Z'),
      createId: () => RUN,
      createSeed: () => SEED,
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

  assert.equal((await fetch(`${baseUrl}/api/survival`)).status, 401);
  const emptyHub = await fetch(`${baseUrl}/api/survival`, { headers: headers(player) });
  assert.equal(emptyHub.status, 200);
  assert.equal((await emptyHub.json()).activeRun, null);

  const startResponse = await fetch(`${baseUrl}/api/survival/runs`, {
    method: 'POST', headers: headers(player), body: JSON.stringify({ requestId: START }),
  });
  assert.equal(startResponse.status, 201);
  const started = await startResponse.json();
  assert.equal(started.created, true);
  assert.equal(started.run.runId, RUN);

  const resumeResponse = await fetch(`${baseUrl}/api/survival/runs`, {
    method: 'POST', headers: headers(player), body: JSON.stringify({ requestId: RESUME }),
  });
  assert.equal(resumeResponse.status, 200);
  assert.equal((await resumeResponse.json()).run.runId, RUN);

  const resultBody = {
    requestId: RESULT,
    configVersion: started.run.configVersion,
    simulationVersion: started.run.simulationVersion,
    battleRulesVersion: started.run.battleRulesVersion,
    wave: 1,
    outcome: {
      simulationVersion: 1,
      seed: started.run.wave.seed,
      winner: 'player',
      kind: 'spin finish',
      turnCount: 2,
      tickCount: 120,
      player: { spin: 10, integrity: started.run.player.maximumIntegrity - 100, stamina: 50, spirit: 0, burst: 20, tilt: 0.5, alive: true },
      enemy: { spin: 0, integrity: 0, stamina: 0, spirit: 0, burst: 100, tilt: 2, alive: false },
    },
  };
  assert.equal((await fetch(`${baseUrl}/api/survival/runs/${RUN}/waves/1/result`, {
    method: 'POST', headers: headers(friend), body: JSON.stringify(resultBody),
  })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/survival/runs/${RUN}/waves/2/result`, {
    method: 'POST', headers: headers(player), body: JSON.stringify(resultBody),
  })).status, 400);
  const resultResponse = await fetch(`${baseUrl}/api/survival/runs/${RUN}/waves/1/result`, {
    method: 'POST', headers: headers(player), body: JSON.stringify(resultBody),
  });
  assert.equal(resultResponse.status, 200);
  const settlement = await resultResponse.json();
  assert.equal(settlement.run.status, 'reward_pending');
  assert.equal(settlement.rewardOptions.length, 3);

  const rewardResponse = await fetch(`${baseUrl}/api/survival/runs/${RUN}/waves/1/reward`, {
    method: 'POST', headers: headers(player),
    body: JSON.stringify({ requestId: REWARD, reward: settlement.rewardOptions[0] }),
  });
  assert.equal(rewardResponse.status, 200);
  assert.equal((await rewardResponse.json()).run.checkpoint.currentWave, 2);

  const leaderboard = await fetch(`${baseUrl}/api/survival/leaderboard?limit=20`, { headers: headers(player) });
  assert.equal(leaderboard.status, 200);
  assert.deepEqual((await leaderboard.json()).entries, []);

  assert.equal((await fetch(`${baseUrl}/api/survival/history`)).status, 401);
  const history = await fetch(`${baseUrl}/api/survival/history?limit=20`, { headers: headers(player) });
  assert.equal(history.status, 200);
  assert.deepEqual(await history.json(), { items: [], nextCursor: null });
  assert.equal((await fetch(`${baseUrl}/api/survival/history?limit=51`, { headers: headers(player) })).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/survival/history?limit=20&limit=10`, { headers: headers(player) })).status, 400);

  const abandonResponse = await fetch(`${baseUrl}/api/survival/runs/${RUN}/abandon`, {
    method: 'POST', headers: headers(player), body: JSON.stringify({ requestId: ABANDON }),
  });
  assert.equal(abandonResponse.status, 200);
  assert.equal((await abandonResponse.json()).status, 'completed');
  assert.equal((await fetch(`${baseUrl}/api/survival/runs/${RUN}/waves/1/reward`, {
    method: 'POST', headers: headers(player),
    body: JSON.stringify({ requestId: START, reward: settlement.rewardOptions[0] }),
  })).status, 409);

  const oversized = await fetch(`${baseUrl}/api/survival/runs`, {
    method: 'POST', headers: headers(player), body: JSON.stringify({ padding: 'x'.repeat(65 * 1024) }),
  });
  assert.equal(oversized.status, 413);
  const unknown = await fetch(`${baseUrl}/api/survival/unknown`, { headers: headers(player) });
  assert.equal(unknown.status, 404);
  assert.match(unknown.headers.get('content-type'), /^application\/json/);

  console.log('Survival HTTP API tests passed.');
} finally {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  database.close();
}
