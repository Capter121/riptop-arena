import { expect, test } from '@playwright/test';

test('production build exposes the default five-part assembly', async ({ page }, testInfo) => {
  const errors = { console: [] as string[], page: [] as string[], failed: [] as string[], external: [] as string[] };
  page.on('console', message => { if (message.type() === 'error') errors.console.push(message.text()); });
  page.on('pageerror', error => errors.page.push(error.message));
  page.on('requestfailed', request => errors.failed.push(request.url()));
  page.on('request', request => {
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) errors.external.push(request.url());
  });

  await page.goto('/');
  await expect(page.locator('#root')).toBeVisible();
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
  await expect(page.getByTestId('combination-id')).toHaveText('nss-p2c-0138');
  await expect(page.locator('canvas')).toBeVisible();
  const snapshot = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot());
  expect(snapshot.combination).toEqual({
    core: 'core_solar_wolf',
    blade: 'blade_storm_fang',
    assist: 'assist_heavy',
    gear: 'gear_low',
    tip: 'tip_flat_attack',
  });
  expect(snapshot.activeRoots).toBe(5);
  expect(snapshot.loadState).toBe('ready');
  await expect(page.getByTestId('attribute-disclaimer')).toHaveText('Concept attributes for prototype use only.');
  expect(errors).toEqual({ console: [], page: [], failed: [], external: [] });
  await testInfo.attach('runtime-smoke-errors', { body: JSON.stringify(errors, null, 2), contentType: 'application/json' });
});
