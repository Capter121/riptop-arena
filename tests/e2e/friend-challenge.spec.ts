import { expect, request as playwrightRequest, test, type APIRequestContext, type BrowserContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createArenaHttpServer } from '../../server/http-server.mjs';
import { openDatabase } from '../../server/storage/database.mjs';
import { migrateDatabase } from '../../server/storage/migrate.mjs';

const databasePath = join(tmpdir(), `nss-friend-challenge-e2e-${randomUUID()}.sqlite`);
const database = openDatabase(databasePath);
await migrateDatabase(database);
database.prepare('INSERT INTO invites (code, max_uses) VALUES (?, ?)').run('E2E-FRIENDS', 3);
const server = createArenaHttpServer({ database });
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
const apiBase = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

test.afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  database.close();
  await rm(databasePath, { force: true });
  await rm(`${databasePath}-wal`, { force: true });
  await rm(`${databasePath}-shm`, { force: true });
});

const identityKey = 'nss.inviteIdentity.v1';
const progressionKey = 'riptop-progression-v1';
const loadout = {
  schemaVersion: 2,
  interfaceId: 'NSS-V1',
  combination: {
    assist: 'assist_air',
    blade: 'blade_storm_fang',
    core: 'core_solar_wolf',
    gear: 'gear_medium',
    tip: 'tip_ball_defense',
  },
  affinities: { assist: 'FIRE', blade: 'WIND', core: 'LIGHT', gear: 'WATER', tip: 'EARTH' },
};
const partUpgrades = Object.fromEntries([
  'balanced', 'bulwark', 'drift', 'grip', 'heavy', 'light', 'round', 'rush', 'slash',
].map(id => [id, 0]));

function progression(latestNssLoadout = loadout) {
  return {
    saveSchemaVersion: 2,
    unlockedParts: ['balanced', 'grip', 'round'],
    ladderIndex: 0,
    bestLadder: 0,
    championshipCount: 0,
    coins: 0,
    build: { attackRing: 'round', core: 'balanced', driver: 'grip' },
    upgrades: { attack: 0, defense: 0, stamina: 0 },
    partUpgrades,
    latestNssLoadout,
  };
}

async function redeem(request: APIRequestContext, displayName: string) {
  const response = await request.post('/api/invites/redeem', {
    data: { inviteCode: 'E2E-FRIENDS', displayName },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).identity as {
    version: 1; playerId: string; displayName: string; deviceToken: string;
  };
}

function auth(identity: { playerId: string; deviceToken: string }) {
  return { Authorization: `Bearer ${identity.deviceToken}`, 'X-Player-Id': identity.playerId };
}

async function syncLoadout(request: APIRequestContext, identity: { playerId: string; deviceToken: string }) {
  const { coins, ...snapshot } = progression();
  const response = await request.post('/api/progression/sync', {
    headers: auth(identity),
    data: { schemaVersion: 1, snapshot, initialCoins: coins, walletEvents: [] },
  });
  expect(response.status()).toBe(200);
}

async function seedContext(context: BrowserContext, identity: unknown) {
  await context.addInitScript(({ identityKey, progressionKey, identity, progression }) => {
    localStorage.setItem(identityKey, JSON.stringify(identity));
    localStorage.setItem(progressionKey, JSON.stringify(progression));
  }, { identityKey, progressionKey, identity, progression: progression() });
  await context.route('**/models/parts/*.glb', route => route.continue({
    url: route.request().url().replace('/models/parts/', '/battle-top-designer/public/models/parts/'),
  }));
  await context.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${apiBase}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
}

test('completes a two-identity challenge, idempotent retry, and targeted rematch', async ({ browser }) => {
  test.setTimeout(240_000);
  const request = await playwrightRequest.newContext({ baseURL: apiBase });
  const creator = await redeem(request, 'Creator');
  const responder = await redeem(request, 'Responder');
  const competitor = await redeem(request, 'Competitor');
  await syncLoadout(request, creator);
  await syncLoadout(request, responder);

  const creatorContext = await browser.newContext();
  const responderContext = await browser.newContext();
  await seedContext(creatorContext, creator);
  await seedContext(responderContext, responder);
  const creatorPage = await creatorContext.newPage();
  const responderPage = await responderContext.newPage();

  await creatorPage.goto('/challenges/');
  const create = creatorPage.locator('.challenge-create-form button[type="submit"]');
  await expect(create).toBeEnabled();
  await create.click();
  await expect(creatorPage).toHaveURL(/\/challenge\/[0-9a-f-]{36}$/);
  const offerId = new URL(creatorPage.url()).pathname.split('/').filter(Boolean).at(-1)!;
  await expect(creatorPage.locator('.challenge-share')).toHaveValue(new RegExp(`/challenge/${offerId}$`));

  await responderPage.goto(`/challenge/${offerId}`);
  await expect(responderPage.getByRole('heading', { name: '装配幽灵挑战' })).toBeVisible();
  const openOffer = await request.get(`/api/challenge-offers/${offerId}`, { headers: auth(responder) });
  expect((await openOffer.json()).status).toBe('open');
  await responderPage.getByRole('button', { name: '认领并应战' }).click();
  await expect(responderPage).toHaveURL(/\/arena\/\?challenge=[0-9a-f-]{36}$/);
  const challengeId = new URL(responderPage.url()).searchParams.get('challenge')!;

  const competingClaim = await request.post(`/api/challenge-offers/${offerId}/claim`, { headers: auth(competitor) });
  expect(competingClaim.status()).toBe(409);

  await responderPage.goto(`/arena/?challenge=${challengeId}&qa=1`);
  await expect(responderPage.locator('canvas[data-engine^="three.js"]')).toBeVisible({ timeout: 30_000 });
  await responderPage.waitForFunction(() => {
    const diagnostics = (window as Window & {
      __THREE_GAME_DIAGNOSTICS__?: { phase?: string; online?: { battleMode?: string } };
    }).__THREE_GAME_DIAGNOSTICS__;
    return diagnostics?.phase === 'launch' && diagnostics.online?.battleMode === 'challenge';
  }, undefined, { timeout: 30_000 });
  const progressionBefore = await responderPage.evaluate(key => localStorage.getItem(key), progressionKey);
  let droppedResponse = false;
  await responderPage.route(`**/api/challenges/${challengeId}/results`, async route => {
    if (droppedResponse) return route.continue();
    droppedResponse = true;
    const response = await route.fetch({ url: `${apiBase}/api/challenges/${challengeId}/results` });
    expect(response.status()).toBe(200);
    await route.abort('failed');
  });
  await responderPage.evaluate(() => {
    const qa = (window as Window & {
      __RIPTOP_QA__: { quickLaunch(): void; forceResult(winner: 'player'): void };
    }).__RIPTOP_QA__;
    qa.quickLaunch();
    qa.forceResult('player');
  });
  await expect(responderPage.locator('.results')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => responderPage.evaluate(() => (
    Object.keys(localStorage).some(key => key.startsWith('nss.pendingChallengeResult.v1.'))
  ))).toBe(true);
  expect(await responderPage.evaluate(key => localStorage.getItem(key), progressionKey)).toBe(progressionBefore);

  await responderPage.unroute(`**/api/challenges/${challengeId}/results`);
  await responderPage.goto('/challenges/');
  await expect.poll(() => responderPage.evaluate(() => (
    Object.keys(localStorage).some(key => key.startsWith('nss.pendingChallengeResult.v1.'))
  )), { timeout: 30_000 }).toBe(false);

  const creatorHistory = await request.get('/api/challenges?group=history&limit=20', { headers: auth(creator) });
  const history = await creatorHistory.json();
  expect(history.items.filter((item: { id: string }) => item.id === challengeId)).toHaveLength(1);
  expect(history.items.find((item: { id: string }) => item.id === challengeId).status).toBe('completed');

  const rematchResponse = await request.post(`/api/challenges/${challengeId}/rematch`, { headers: auth(responder) });
  expect(rematchResponse.status()).toBe(201);
  const rematch = await rematchResponse.json();
  expect(rematch.parentChallengeId).toBe(challengeId);
  expect(rematch.targetPlayerId).toBe(creator.playerId);
  const rematchClaimResponse = await request.post(`/api/challenge-offers/${rematch.id}/claim`, { headers: auth(creator) });
  expect(rematchClaimResponse.status()).toBe(201);
  const rematchChallenge = await rematchClaimResponse.json();
  expect(rematchChallenge.parentChallengeId).toBe(challengeId);
  expect(rematchChallenge.input.seed).not.toBe(history.items.find((item: { id: string }) => item.id === challengeId).input.seed);
  expect(rematchChallenge.input.player.playerId).toBe(creator.playerId);
  expect(rematchChallenge.input.enemy.playerId).toBe(responder.playerId);

  await creatorContext.close();
  await responderContext.close();
  await request.dispose();
});
