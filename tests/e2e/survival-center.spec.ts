import { expect, test, type Page } from '@playwright/test';
import catalog from '../../shared/campaign/campaign-v1.json' with { type: 'json' };

const identity = { version: 1, playerId: '123e4567-e89b-42d3-a456-426614174000', displayName: 'Nova', deviceToken: 'A'.repeat(43) };
const loadout = { schemaVersion: 2, interfaceId: 'NSS-V1', ...catalog.opponents[0].loadouts[0] };
const runId = (index: number) => `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const playerId = (index: number) => index === 1 ? identity.playerId : `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const best = (index: number) => ({
  runId: runId(index), score: 100000 - index * 100, highestCompletedWave: Math.max(0, 40 - index),
  bossesDefeated: 5, finalIntegrity: 100, riskLevel: 2, loadoutSummary: loadout,
  achievedAt: `2026-08-${String(Math.min(28, index + 1)).padStart(2, '0')}T10:00:00.000Z`,
});

async function mockCenter(page: Page) {
  await page.addInitScript(value => localStorage.setItem('nss.inviteIdentity.v1', JSON.stringify(value)), identity);
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/me') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ player: { playerId: identity.playerId, displayName: identity.displayName } }) });
    if (url.pathname === '/api/progression/sync') {
      const body = route.request().postDataJSON(); body.snapshot.latestNssLoadout = loadout;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ progression: { schemaVersion: 1, revision: 1, coins: 0, snapshot: body.snapshot }, acknowledgedEventIds: [] }) });
    }
    if (url.pathname === '/api/survival') {
      const entries = Array.from({ length: 20 }, (_, offset) => ({ rank: offset + 1, playerId: playerId(offset + 2), displayName: `长昵称朋友-${offset + 1}`, ...best(offset + 2) }));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configVersion: 'survival-v1', activeRun: null, personalBest: best(1), milestones: [{ wave: 5, coins: 100, earned: true }, { wave: 10, coins: 200, earned: false }, { wave: 15, coins: 350, earned: false }, { wave: 20, coins: 500, earned: false }], leaderboard: { entries, nextCursor: 'rank_page_2', currentRank: 27 } }) });
    }
    if (url.pathname === '/api/survival/history') {
      const start = url.searchParams.has('cursor') ? 21 : 1;
      const items = Array.from({ length: 20 }, (_, offset) => best(start + offset));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items, nextCursor: start === 1 ? 'history_page_2' : null }) });
    }
    if (url.pathname === '/api/survival/leaderboard') {
      const entries = Array.from({ length: 2 }, (_, offset) => ({ rank: 21 + offset, playerId: playerId(22 + offset), displayName: `追加朋友-${offset + 1}`, ...best(22 + offset) }));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries, nextCursor: null, currentRank: 27 }) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
}

test('renders personal best, friend ranking and paginated run history responsively', async ({ page }) => {
  await mockCenter(page);
  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => { errors.push(error.message); });
  await page.goto('/survival/');
  await expect(page.getByRole('heading', { name: '无尽生存中心' })).toBeVisible();
  await expect(page.getByText('我的排名 · 27')).toBeVisible();
  await expect(page.locator('.survival-center__rank')).toHaveCount(20);
  await expect(page.locator('.survival-center__history-row')).toHaveCount(20);

  await page.getByRole('button', { name: '加载更多排名' }).click();
  await expect(page.locator('.survival-center__rank')).toHaveCount(22);
  await page.getByRole('button', { name: '加载更多记录' }).click();
  await expect(page.locator('.survival-center__history-row')).toHaveCount(40);
  await page.screenshot({ path: 'output/playwright/survival-center-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const buttonHeights = await page.locator('.survival-center button:visible').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
  expect(Math.min(...buttonHeights)).toBeGreaterThanOrEqual(44);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'output/playwright/survival-center-mobile.png', fullPage: true });
});
