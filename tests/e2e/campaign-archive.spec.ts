import { expect, test, type Page } from '@playwright/test';
import catalog from '../../shared/campaign/campaign-v1.json' with { type: 'json' };

const identity = {
  version: 1,
  playerId: '123e4567-e89b-42d3-a456-426614174000',
  displayName: 'Nova',
  deviceToken: 'A'.repeat(43),
};

async function mockCampaign(page: Page) {
  await page.addInitScript(value => {
    localStorage.setItem('nss.inviteIdentity.v1', JSON.stringify(value));
  }, identity);
  await page.route('**/models/parts/*.glb', route => route.continue({
    url: route.request().url().replace('/models/parts/', '/battle-top-designer/public/models/parts/'),
  }));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/me') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ player: { playerId: identity.playerId, displayName: identity.displayName } }),
      });
      return;
    }
    if (path === '/api/progression/sync') {
      const body = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          progression: { schemaVersion: 1, revision: 1, coins: body.initialCoins, snapshot: body.snapshot },
          acknowledgedEventIds: body.walletEvents.map((event: { eventId: string }) => event.eventId),
        }),
      });
      return;
    }
    if (path === '/api/campaign') {
      const opponents = catalog.opponents.map((opponent, index) => ({
        ...opponent,
        unlocked: index < 3,
        starsMask: index === 0 ? 7 : index === 1 ? 3 : 0,
        defeated: index < 2,
        attemptCount: index < 2 ? 2 : 0,
        bestOutcome: null,
      }));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          configVersion: 'campaign-v1',
          aiProfiles: catalog.aiProfiles,
          opponents,
          totalStars: 5,
          nextOpponentId: 'abyss-tide',
          championshipCount: 0,
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
}

test('opens the campaign archive with one responsive rival preview', async ({ page }) => {
  await mockCampaign(page);
  await page.goto('/');
  const portalEntry = page.locator('[data-mode-id="campaign"]');
  await expect(portalEntry).toHaveAttribute('href', '/campaign/');
  await expect(portalEntry).toContainText('5 / 24 星');

  await portalEntry.click();
  await expect(page.getByRole('heading', { name: '八人战役档案馆' })).toBeVisible();
  const rivals = page.locator('.campaign-rival');
  await expect(rivals).toHaveCount(8);
  await expect(rivals.filter({ has: page.getByText('击败上一位对手后解锁') })).toHaveCount(5);
  await expect(rivals.nth(2)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.campaign-preview canvas')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await rivals.nth(1).click();
  await expect(rivals.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.campaign-preview canvas')).toHaveCount(1);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'output/playwright/campaign-archive-mobile.png', fullPage: true });
});
