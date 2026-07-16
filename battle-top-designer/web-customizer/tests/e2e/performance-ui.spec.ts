import { expect, test } from '@playwright/test';

test('loads runtime and optional tools lazily with persistent low-performance mode', async ({ page }) => {
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
  const marks = await page.evaluate(() => Object.fromEntries(['phase3b:shell-ready', 'phase3b:scene-runtime-loaded', 'phase3b:first-model-ready', 'phase3b:interaction-ready'].map(name => [name, performance.getEntriesByName(name)[0]?.startTime])));
  expect(marks['phase3b:shell-ready']).toBeLessThan(marks['phase3b:scene-runtime-loaded']);
  expect(marks['phase3b:scene-runtime-loaded']).toBeLessThan(marks['phase3b:first-model-ready']);
  expect((await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name))).some(name => /QrCodeView|cardRenderer/.test(name))).toBe(false);
  await page.getByTestId('share').click();
  await expect(page.getByRole('img', { name: 'QR code for the current combination link' })).toBeVisible();
  expect((await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name))).some(name => /QrCodeView/.test(name))).toBe(true);
  await page.getByTestId('low-performance').click();
  await expect(page.getByTestId('low-performance')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
  await expect(page.getByTestId('low-performance')).toHaveAttribute('aria-pressed', 'true');
  const snapshot = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot());
  expect(snapshot).toMatchObject({ lowPerformance: true, loadProgress: 100, activeRoots: 5 });
  expect(snapshot.webglResources.geometries).toBeGreaterThan(0);
  expect(errors).toEqual({ console: [], page: [], failed: [], external: [] });
});
