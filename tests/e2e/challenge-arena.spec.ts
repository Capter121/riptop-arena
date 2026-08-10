import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const versions = { challengeSchemaVersion: 1, catalogVersion: 1, affinityRulesVersion: 1, battleRulesVersion: 2, simulationVersion: 1 } as const;
const NSS_BATTLE_CATALOG_SHA256 = '180ab25494b1f4249644159379202ea8f8a631608d3c804d8c47a2ecac918b1d';

const playerId = '11111111-1111-4111-8111-111111111111';
const enemyId = '22222222-2222-4222-8222-222222222222';
const challengeId = '33333333-3333-4333-8333-333333333333';
const offerId = '44444444-4444-4444-8444-444444444444';
const loadout = {
  schemaVersion: 2, interfaceId: 'NSS-V1',
  combination: { assist: 'assist_air', blade: 'blade_storm_fang', core: 'core_solar_wolf', gear: 'gear_medium', tip: 'tip_ball_defense' },
  affinities: { assist: 'FIRE', blade: 'WIND', core: 'LIGHT', gear: 'WATER', tip: 'EARTH' },
};
const zeroUpgrades = { upgrades: { attack: 0, defense: 0, stamina: 0 }, partUpgrades: { balanced: 0, bulwark: 0, drift: 0, grip: 0, heavy: 0, light: 0, round: 0, rush: 0, slash: 0 } };
const input = {
  challengeSchemaVersion: versions.challengeSchemaVersion, catalogVersion: versions.catalogVersion,
  catalogSha256: NSS_BATTLE_CATALOG_SHA256, affinityRulesVersion: versions.affinityRulesVersion,
  battleRulesVersion: versions.battleRulesVersion, simulationVersion: versions.simulationVersion,
  offerId, parentChallengeId: null, seed: '00112233445566778899aabbccddeeff', mode: 'fair', arena: 'classic_grid', aiConfig: 'deterministic-v1',
  player: { playerId, displayName: 'Responder', loadout, upgrades: zeroUpgrades },
  enemy: { playerId: enemyId, displayName: 'Creator', loadout: { ...loadout, combination: { ...loadout.combination, tip: 'tip_flat_attack' } }, upgrades: zeroUpgrades },
};

function challenge(status: 'pending' | 'completed', result: unknown = null) {
  return { id: challengeId, status, creatorPlayerId: enemyId, recipientPlayerId: playerId, offerId, parentChallengeId: null,
    createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z', completedAt: status === 'completed' ? '2026-08-10T00:01:00.000Z' : null,
    input, result, actions: { canBattle: status === 'pending', canRematch: status === 'completed' } };
}

test('boots frozen ghost tops and safely submits one result without progression writes', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(({ id }) => localStorage.setItem('nss.inviteIdentity.v1', JSON.stringify({
    version: 1, playerId: id, displayName: 'Responder', deviceToken: 'a'.repeat(43),
  })), { id: playerId });
  let submission: Record<string, unknown> | null = null;
  await page.route('**/models/parts/*.glb', async route => {
    const fileName = new URL(route.request().url()).pathname.split('/').pop();
    const body = await readFile(new URL(`../../battle-top-designer/public/models/parts/${fileName}`, import.meta.url));
    await route.fulfill({ status: 200, contentType: 'model/gltf-binary', body });
  });
  await page.route(`**/api/challenges/${challengeId}**`, async route => {
    if (route.request().method() === 'POST') {
      submission = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(challenge('completed', submission)) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(challenge('pending')) });
    }
  });
  await page.goto(`/arena/?challenge=${challengeId}`);
  await expect(page.locator('canvas[data-engine^="three.js"]')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => {
    const diagnostics = (window as Window & { __THREE_GAME_DIAGNOSTICS__?: { phase?: string; online?: { battleMode?: string } } }).__THREE_GAME_DIAGNOSTICS__;
    return diagnostics?.phase === 'launch' && diagnostics.online?.battleMode === 'challenge';
  }, undefined, { timeout: 30_000 });
  await page.evaluate(() => {
    const api = (window as Window & { __RIPTOP_QA__: { quickLaunch(): void; forceResult(winner: 'player'): void } }).__RIPTOP_QA__;
    api.quickLaunch(); api.forceResult('player');
  });
  await expect(page.locator('.results__challenge-details')).toContainText('结果已确认', { timeout: 30_000 });
  await expect(page.locator('.results__challenge-details')).toContainText(/Responder · nss-p2c-\d{4}/);
  await expect(page.locator('.results__challenge-details')).toContainText('Creator');
  expect(submission?.submissionId).toMatch(/^[0-9a-f-]{36}$/);
  expect(await page.evaluate(() => localStorage.getItem('riptop-progression-v1'))).toBeNull();
  await page.screenshot({ path: 'output/playwright/challenge-arena-result.png', fullPage: true });
  const returnButton = page.getByRole('button', { name: '返回挑战中心' });
  const rematchButton = page.getByRole('button', { name: '发起回挑战' });
  await returnButton.scrollIntoViewIfNeeded();
  await expect(returnButton).toBeVisible();
  await expect(rematchButton).toBeVisible();
  await page.screenshot({ path: 'output/playwright/challenge-arena-result-actions.png', fullPage: true });
});
