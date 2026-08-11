import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import catalog from '../../shared/campaign/campaign-v1.json' with { type: 'json' };
import { createArenaHttpServer } from '../../server/http-server.mjs';
import { redeemInvite } from '../../server/auth/invite-service.mjs';
import { createDefaultProgressionSnapshot } from '../../server/progression/progression-service.mjs';
import { openDatabase } from '../../server/storage/database.mjs';
import { migrateDatabase } from '../../server/storage/migrate.mjs';

const databasePath = join(tmpdir(), `nss-campaign-e2e-${randomUUID()}.sqlite`);
const database = openDatabase(databasePath);
await migrateDatabase(database);
database.prepare('INSERT INTO invites (code, max_uses) VALUES (?, ?)').run('E2ECAMP', 2);
const player = redeemInvite(database, { inviteCode: 'E2ECAMP', displayName: 'Nova' });
const friend = redeemInvite(database, { inviteCode: 'E2ECAMP', displayName: 'Rin' });
const loadout = {
  schemaVersion: 2, interfaceId: 'NSS-V1',
  combination: { core: 'core_solar_wolf', blade: 'blade_orbit_halo', assist: 'assist_guard', gear: 'gear_high', tip: 'tip_needle_stamina' },
  affinities: { core: 'LIGHT', blade: 'WATER', assist: 'WATER', gear: 'WATER', tip: 'WATER' },
};
const snapshot = createDefaultProgressionSnapshot();
snapshot.latestNssLoadout = loadout;
for (const identity of [player, friend]) {
  database.prepare('INSERT INTO player_progression (player_id, snapshot_json, initial_coins_imported) VALUES (?, ?, 1)')
    .run(identity.playerId, JSON.stringify(snapshot));
}

let server = createArenaHttpServer({ database });
async function listen() {
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  return `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
}
let apiBase = await listen();

test.afterAll(async () => {
  if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
  database.close();
  await rm(databasePath, { force: true });
  await rm(`${databasePath}-wal`, { force: true });
  await rm(`${databasePath}-shm`, { force: true });
});

function headers(identity: typeof player) {
  return { 'content-type': 'application/json', authorization: `Bearer ${identity.deviceToken}`, 'x-player-id': identity.playerId };
}

async function api(identity: typeof player, path: string, body?: unknown) {
  const response = await fetch(`${apiBase}${path}`, body === undefined ? { headers: headers(identity) } : {
    method: 'POST', headers: headers(identity), body: JSON.stringify(body),
  });
  const value = await response.json();
  expect(response.ok, JSON.stringify(value)).toBe(true);
  return value;
}

function localProgression() {
  return { ...snapshot, saveSchemaVersion: 2, coins: 0 };
}

async function preparePage(context: BrowserContext, identity: typeof player, offline: { result: boolean }) {
  await context.addInitScript(({ currentIdentity, progression }) => {
    localStorage.setItem('nss.inviteIdentity.v1', JSON.stringify(currentIdentity));
    localStorage.setItem('riptop-progression-v1', JSON.stringify(progression));
  }, { currentIdentity: identity, progression: localProgression() });
  const page = await context.newPage();
  await page.route('**/models/parts/*.glb', route => route.continue({
    url: route.request().url().replace('/models/parts/', '/battle-top-designer/public/models/parts/'),
  }));
  await page.route('**/api/**', async route => {
    const requestUrl = new URL(route.request().url());
    if (offline.result && /\/api\/campaign\/attempts\/[0-9a-f-]+\/result$/.test(requestUrl.pathname)) {
      await route.abort();
      return;
    }
    const response = await route.fetch({ url: `${apiBase}${requestUrl.pathname}${requestUrl.search}` });
    await route.fulfill({ response });
  });
  return page;
}

function fullOutcome(attempt: any, opponent: any) {
  const performance = opponent.objectives.performance;
  const finish = performance.kind === 'finish'
    ? { ringout: 'ring out', spin: 'spin finish', burst: 'burst finish', timeout: 'timeout' }[performance.finish]
    : 'burst finish';
  return {
    simulationVersion: 1, seed: attempt.seed, winner: 'player', kind: finish, turnCount: 1, tickCount: 60,
    player: { spin: 100, integrity: attempt.player.maxIntegrity, stamina: 100, spirit: 0, burst: 0, tilt: 0.1, alive: true },
    enemy: { spin: 0, integrity: 0, stamina: 0, spirit: 0, burst: 100, tilt: 1, alive: false },
  };
}

test('completes and persists the isolated eight-rival campaign', async ({ browser }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  const failedAttempt = await api(player, '/api/campaign/attempts', { requestId: randomUUID(), opponentId: 'blaze-fang' });
  await api(player, `/api/campaign/attempts/${failedAttempt.attemptId}/result`, {
    requestId: randomUUID(), outcome: { ...fullOutcome(failedAttempt, catalog.opponents[0]), winner: 'enemy',
      player: { spin: 0, integrity: 0, stamina: 0, spirit: 0, burst: 100, tilt: 1, alive: false },
      enemy: { spin: 100, integrity: 100, stamina: 100, spirit: 0, burst: 0, tilt: 0, alive: true } },
  });
  expect((await api(player, '/api/campaign')).nextOpponentId).toBe('blaze-fang');

  const offline = { result: false };
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await preparePage(context, player, offline);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/campaign/?opponent=blaze-fang');
  await page.getByRole('link', { name: /挑战 烈焰獠牙/ }).click();
  await page.waitForFunction(() => (window as any).__THREE_GAME_DIAGNOSTICS__?.online?.battleMode === 'campaign');
  const canvasBox = await page.locator('canvas[data-engine^="three.js"]').boundingBox();
  expect(canvasBox?.width).toBeGreaterThan(0);
  expect(canvasBox?.height).toBeGreaterThan(0);
  offline.result = true;
  await page.evaluate(() => { const qa = (window as any).__RIPTOP_QA__; qa.quickLaunch(); qa.forceResult('player'); });
  await expect(page.getByText('网络中断，结果已保存在本机并等待确认')).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('nss.pendingCampaignResult.v1.')).length)).toBe(1);
  offline.result = false;
  await page.goto('/campaign/?opponent=blaze-fang');
  await expect(page.getByText('3 / 24')).toBeVisible();
  expect((await api(player, '/api/campaign')).nextOpponentId).toBe('sky-gale');

  for (const opponent of catalog.opponents.slice(1)) {
    const current = JSON.parse(database.prepare('SELECT snapshot_json FROM player_progression WHERE player_id = ?').get(player.playerId).snapshot_json);
    const affinity = opponent.objectives.strategy.kind === 'primary_affinity' ? opponent.objectives.strategy.affinity : null;
    current.latestNssLoadout.affinities = affinity
      ? { core: affinity === 'DARK' ? 'DARK' : affinity === 'LIGHT' ? 'LIGHT' : 'LIGHT', blade: affinity, assist: affinity, gear: affinity, tip: affinity }
      : { core: 'LIGHT', blade: 'FIRE', assist: 'FIRE', gear: 'WATER', tip: 'EARTH' };
    database.prepare('UPDATE player_progression SET snapshot_json = ? WHERE player_id = ?').run(JSON.stringify(current), player.playerId);
    const attempt = await api(player, '/api/campaign/attempts', { requestId: randomUUID(), opponentId: opponent.id });
    await api(player, `/api/campaign/attempts/${attempt.attemptId}/result`, { requestId: randomUUID(), outcome: fullOutcome(attempt, opponent) });
  }
  const complete = await api(player, '/api/campaign');
  expect(complete.totalStars).toBe(24);
  expect(complete.championshipCount).toBe(1);
  const atlas = await api(player, '/api/campaign/attempts', { requestId: randomUUID(), opponentId: 'atlas-guardian' });
  const repeat = await api(player, `/api/campaign/attempts/${atlas.attemptId}/result`, { requestId: randomUUID(), outcome: fullOutcome(atlas, catalog.opponents[7]) });
  expect(repeat.rewards.championshipCrowns).toBe(0);

  await new Promise<void>(resolve => server.close(() => resolve()));
  server = createArenaHttpServer({ database });
  apiBase = await listen();
  await page.reload();
  await expect(page.getByText('24 / 24')).toBeVisible();

  const friendContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const friendPage = await preparePage(friendContext, friend, { result: false });
  await friendPage.goto('/campaign/');
  await expect(friendPage.getByText('0 / 24')).toBeVisible();
  expect(await friendPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await friendPage.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('nss.pendingCampaignResult.v1.')).length)).toBe(0);
  await friendPage.screenshot({ path: 'output/playwright/campaign-e2e-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
  await friendContext.close();
  await context.close();
});
