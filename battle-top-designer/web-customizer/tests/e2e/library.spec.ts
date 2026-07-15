import { expect, test } from '@playwright/test';

test('persists recent combinations, favorites, and local nicknames', async ({ page }) => {
  test.setTimeout(120000);
  const errors = { console: [] as string[], page: [] as string[], failed: [] as string[], external: [] as string[] };
  page.on('console', message => { if (message.type() === 'error') errors.console.push(message.text()); });
  page.on('pageerror', error => errors.page.push(error.message));
  page.on('requestfailed', request => errors.failed.push(request.url()));
  page.on('request', request => {
    const hostname = new URL(request.url()).hostname;
    if (!['127.0.0.1', 'localhost'].includes(hostname)) errors.external.push(request.url());
  });

  await page.goto('/');
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
  await page.getByTestId('tab-blade').click();
  await page.getByTestId('part-blade_orbit_halo').click();
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready');
  const savedId = await page.getByTestId('combination-id').textContent();
  await page.getByTestId('library').click();
  await expect(page.getByTestId(`recent-${savedId}`)).toBeVisible();
  await page.getByTestId('favorite-current').click();
  await page.getByTestId('nickname-input').fill('  Orbit Trial  ');
  await page.getByTestId('save-nickname').click();
  await expect(page.locator('.identity-row h2')).toHaveText('Orbit Trial');

  await page.reload();
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
  await page.getByTestId('library').click();
  await expect(page.getByTestId(`favorite-${savedId}`)).toContainText('Orbit Trial');
  await page.getByTestId('storm-reset').click();
  await page.getByTestId(`favorite-${savedId}`).click();
  await expect(page.getByTestId('combination-id')).toHaveText(savedId!);
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready');
  await page.getByTestId(`remove-favorite-${savedId}`).click();
  await expect(page.getByTestId(`favorite-${savedId}`)).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('nova-spin:phase3b:library:v1')!));
  expect(Object.keys(stored).sort()).toEqual(['favorites', 'recent', 'schemaVersion']);
  expect(errors).toEqual({ console: [], page: [], failed: [], external: [] });
});
