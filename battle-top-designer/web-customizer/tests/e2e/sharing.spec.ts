import { expect, test } from '@playwright/test';

test('restores, shares, and safely clears combination URLs offline', async ({ page }) => {
  test.setTimeout(120000);
  const errors = { console: [] as string[], page: [] as string[], failed: [] as string[], external: [] as string[] };
  page.on('console', message => { if (message.type() === 'error') errors.console.push(message.text()); });
  page.on('pageerror', error => errors.page.push(error.message));
  page.on('requestfailed', request => errors.failed.push(request.url()));
  page.on('request', request => {
    const hostname = new URL(request.url()).hostname;
    if (!['127.0.0.1', 'localhost'].includes(hostname)) errors.external.push(request.url());
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => { (window as any).__COPIED_SHARE_LINK__ = text; } },
    });
  });

  await page.goto('/?combo=nss-p2c-0001&test=1');
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
  await expect(page.getByTestId('combination-id')).toHaveText('nss-p2c-0001');
  expect(await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot().testMode)).toBe(true);
  await expect(page.locator('p.notice')).toContainText('旧版分享链接已按默认属性载入');
  await expect(page.getByTestId('clear-invalid-url')).toHaveCount(0);
  await page.getByTestId('affinity-option-FIRE').click();
  await page.getByTestId('share').click();
  await expect(page.getByTestId('share-link')).toHaveValue(/\?sv=2&cv=1&rv=1&combo=nss-p2c-0001&a=LIGHT%2CFIRE%2CFIRE%2CWATER%2CEARTH$/);
  await expect(page.getByTestId('share-device-warning')).toBeVisible();
  await expect(page.getByRole('img', { name: 'QR code for the current combination link' })).toBeVisible();
  await page.getByTestId('copy-share-link').click();
  const copied = await page.evaluate(() => (window as any).__COPIED_SHARE_LINK__ as string);
  expect(copied).toMatch(/\?sv=2&cv=1&rv=1&combo=nss-p2c-0001&a=LIGHT%2CFIRE%2CFIRE%2CWATER%2CEARTH$/);
  await page.goto(`${copied}&emblem=emblem_solar-wolf`);
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
  expect(await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot().affinities)).toEqual({
    core: 'LIGHT', blade: 'FIRE', assist: 'FIRE', gear: 'WATER', tip: 'EARTH',
  });
  await page.getByTestId('affinity-option-WATER').click();
  await page.getByTestId('share').click();
  await expect(page.getByTestId('share-link')).toHaveValue(/a=LIGHT%2CWATER%2CFIRE%2CWATER%2CEARTH&emblem=emblem_solar-wolf$/);

  await page.goto('/?combo=INVALID&redirect=https://example.com');
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
  await expect(page.getByTestId('combination-id')).toHaveText('nss-p2c-0138');
  await expect(page.locator('p.notice')).toContainText('Invalid share link');
  await page.getByTestId('clear-invalid-url').click();
  expect(new URL(page.url()).search).toBe('');
  expect(errors).toEqual({ console: [], page: [], failed: [], external: [] });
});
