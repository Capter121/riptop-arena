import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const PORT = 8091;
const URL = `ws://127.0.0.1:${PORT}`;
const v = 2;
const catalogSha256 = '180ab25494b1f4249644159379202ea8f8a631608d3c804d8c47a2ecac918b1d';

function legacyLoadout() {
  return {
    kind: 'legacy',
    build: { attackRing: 'round', core: 'balanced', driver: 'grip' },
    upgrades: { attack: 0, defense: 0, stamina: 0 },
    partUpgrades: {},
  };
}

function nssLoadout(overrides = {}) {
  return {
    kind: 'nss-v1',
    comboId: 'nss-p2c-0138',
    loadout: {
      schemaVersion: 1,
      interfaceId: 'NSS-V1',
      combination: {
        core: 'core_solar_wolf',
        blade: 'blade_storm_fang',
        assist: 'assist_heavy',
        gear: 'gear_low',
        tip: 'tip_flat_attack',
      },
    },
    upgrades: { attack: 0, defense: 0, stamina: 0 },
    catalogSha256,
    ...overrides,
  };
}

class TestClient {
  constructor(ws) {
    this.ws = ws;
    this.inbox = [];
    this.waiters = [];
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      const waiterIndex = this.waiters.findIndex((waiter) => waiter.type === message.type);
      if (waiterIndex >= 0) {
        const [waiter] = this.waiters.splice(waiterIndex, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      } else {
        this.inbox.push(message);
      }
    });
  }

  send(message) {
    this.ws.send(JSON.stringify({ v, ...message }));
  }

  waitFor(type, timeoutMs = 2_000) {
    const index = this.inbox.findIndex((message) => message.type === type);
    if (index >= 0) return Promise.resolve(this.inbox.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { type, resolve, timer: null };
      waiter.timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error(`Timed out waiting for ${type}`));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  close() {
    this.ws.close();
  }
}

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    ws.once('open', () => resolve(new TestClient(ws)));
    ws.once('error', reject);
  });
}

function join(client, name, loadout = legacyLoadout()) {
  client.send({
    type: 'JOIN_QUEUE',
    displayName: name,
    loadout,
  });
}

async function matchedPair(prefix, firstLoadout, secondLoadout) {
  const first = await connect();
  const second = await connect();
  join(first, `${prefix}-1`, firstLoadout);
  await first.waitFor('QUEUED');
  join(second, `${prefix}-2`, secondLoadout);
  const [firstMatch, secondMatch] = await Promise.all([first.waitFor('MATCHED'), second.waitFor('MATCHED')]);
  assert.equal(firstMatch.roomId, secondMatch.roomId);
  const host = firstMatch.role === 'host' ? first : second;
  const guest = host === first ? second : first;
  return { first, second, host, guest, roomId: firstMatch.roomId, firstMatch, secondMatch };
}

const server = spawn(process.execPath, ['server/match-server.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(PORT),
    READY_TIMEOUT_MS: '300',
    TURN_TIMEOUT_MS: '500',
    HEARTBEAT_INTERVAL_MS: '100',
    HEARTBEAT_DEAD_MS: '700',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not start.')), 2_000);
    server.stdout.on('data', (data) => {
      if (!data.toString().includes('Match server listening')) return;
      clearTimeout(timer);
      resolve();
    });
    server.once('exit', (code) => reject(new Error(`Server exited early with ${code}.`)));
  });

  const health = await fetch(`http://127.0.0.1:${PORT}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });

  const battle = await matchedPair('battle');
  battle.host.send({ type: 'CLIENT_READY', roomId: battle.roomId });
  battle.guest.send({ type: 'CLIENT_READY', roomId: battle.roomId });
  await battle.host.waitFor('ALL_READY');

  const startDelayMs = 500;
  const launchConfig = { hostX: -6, guestX: 6, z: 0, hostPower: 0.8, guestPower: 0.8 };
  battle.host.send({ type: 'MATCH_START', roomId: battle.roomId, startDelayMs, launchConfig });
  await Promise.all([battle.host.waitFor('MATCH_START'), battle.guest.waitFor('MATCH_START')]);
  const [hostTurn, guestTurn] = await Promise.all([
    battle.host.waitFor('TURN_OPEN'),
    battle.guest.waitFor('TURN_OPEN'),
  ]);
  assert.equal(hostTurn.turnId, 1);
  assert.equal(guestTurn.turnId, 1);

  battle.host.send({ type: 'TURN_ACTION', roomId: battle.roomId, turnId: 1, action: { kind: 'charge' } });
  battle.guest.send({ type: 'TURN_ACTION', roomId: battle.roomId, turnId: 1, action: { kind: 'defense' } });
  const actionSet = await battle.host.waitFor('TURN_ACTION_SET');
  assert.equal(actionSet.hostAction.kind, 'charge');
  assert.equal(actionSet.guestAction.kind, 'defense');

  const qteResolution = {
    kind: 'clash_qte',
    playerAction: { kind: 'attack', skillId: 'wind_blade' },
    aiAction: { kind: 'attack', skillId: 'wind_blade' },
    winner: null,
    loser: null,
    playerSpiritDelta: -20,
    enemySpiritDelta: -20,
    playerVisual: 'clash',
    enemyVisual: 'clash',
    safeNoSpinDamage: true,
    log: 'QTE test',
  };
  battle.host.send({ type: 'CLASH_QTE_START', roomId: battle.roomId, turnId: 1, resolution: qteResolution });
  const qteStart = await battle.guest.waitFor('CLASH_QTE_START');
  assert.equal(qteStart.resolution.kind, 'clash_qte');

  battle.guest.send({ type: 'CLASH_QTE_SCORE', roomId: battle.roomId, turnId: 1, score: 128, final: false });
  const hostScore = await battle.host.waitFor('CLASH_QTE_SCORE');
  assert.equal(hostScore.score, 128);

  battle.host.send({ type: 'CLASH_QTE_SCORE', roomId: battle.roomId, turnId: 1, score: 144, final: true });
  const guestScore = await battle.guest.waitFor('CLASH_QTE_SCORE');
  assert.equal(guestScore.final, true);

  battle.guest.send({ type: 'TURN_ACTION', roomId: battle.roomId, turnId: 1, action: { kind: 'charge' } });
  const duplicateError = await battle.guest.waitFor('ERROR');
  assert.equal(duplicateError.code, 'ACTION_ALREADY_SUBMITTED');

  battle.host.send({ type: 'TURN_OPEN', roomId: battle.roomId, turnId: 2 });
  await Promise.all([battle.host.waitFor('TURN_OPEN'), battle.guest.waitFor('TURN_OPEN')]);
  battle.host.send({ type: 'TURN_ACTION', roomId: battle.roomId, turnId: 2, action: { kind: 'charge' } });
  const timeout = await battle.host.waitFor('TURN_TIMEOUT');
  assert.equal(timeout.loser, 'guest');
  battle.first.close();
  battle.second.close();

  const readyTimeout = await matchedPair('ready-timeout');
  readyTimeout.host.send({ type: 'CLIENT_READY', roomId: readyTimeout.roomId });
  const readyError = await readyTimeout.host.waitFor('ERROR');
  assert.equal(readyError.code, 'READY_TIMEOUT');
  readyTimeout.first.close();
  readyTimeout.second.close();

  const disconnect = await matchedPair('disconnect');
  disconnect.guest.close();
  const disconnected = await disconnect.host.waitFor('PEER_DISCONNECTED');
  assert.equal(disconnected.roomId, disconnect.roomId);
  disconnect.host.close();

  const mixed = await matchedPair('mixed', nssLoadout(), legacyLoadout());
  assert.equal(mixed.firstMatch.opponentLoadout.kind, 'legacy');
  assert.equal(mixed.secondMatch.opponentLoadout.kind, 'nss-v1');
  mixed.host.send({ type: 'CLIENT_READY', roomId: mixed.roomId });
  mixed.guest.send({ type: 'CLIENT_READY', roomId: mixed.roomId });
  await mixed.host.waitFor('ALL_READY');
  mixed.first.close();
  mixed.second.close();

  const badHash = await connect();
  join(badHash, 'bad-hash', nssLoadout({ catalogSha256: '0'.repeat(64) }));
  assert.equal((await badHash.waitFor('ERROR')).code, 'CATALOG_MISMATCH');
  badHash.close();

  const badFamily = await connect();
  const familyMismatch = nssLoadout();
  familyMismatch.loadout.combination.core = 'blade_storm_fang';
  join(badFamily, 'bad-family', familyMismatch);
  assert.equal((await badFamily.waitFor('ERROR')).code, 'INVALID_LOADOUT');
  badFamily.close();

  const badCombo = await connect();
  join(badCombo, 'bad-combo', nssLoadout({ comboId: 'nss-p2c-0001' }));
  assert.equal((await badCombo.waitFor('ERROR')).code, 'INVALID_LOADOUT');
  badCombo.close();

  const derivedStats = await connect();
  join(derivedStats, 'derived-stats', nssLoadout({ stats: { attack: 999 } }));
  assert.equal((await derivedStats.waitFor('ERROR')).code, 'INVALID_LOADOUT');
  derivedStats.close();

  const oldProtocol = await connect();
  oldProtocol.ws.send(JSON.stringify({ v: 1, type: 'JOIN_QUEUE', displayName: 'v1', loadout: legacyLoadout() }));
  assert.equal((await oldProtocol.waitFor('ERROR')).code, 'PROTOCOL_MISMATCH');
  oldProtocol.close();

  console.log('Match server smoke tests passed.');
} finally {
  server.kill();
}
