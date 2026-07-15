import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

test('exports a local 1200x630 PNG card without changing assembly state', async ({ page }) => {
  const errors = { console: [] as string[], page: [] as string[], failed: [] as string[], external: [] as string[] };
  page.on('console', message => { if (message.type() === 'error') errors.console.push(message.text()); });
  page.on('pageerror', error => errors.page.push(error.message));
  page.on('requestfailed', request => errors.failed.push(request.url()));
  page.on('request', request => {
    const hostname = new URL(request.url()).hostname;
    if (!['127.0.0.1', 'localhost'].includes(hostname)) errors.external.push(request.url());
  });

  await page.goto('/?combo=nss-p2c-0138');
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
  const before = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot());
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-card').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('nss-p2c-0138.png');
  const path = await download.path();
  expect(path).toBeTruthy();
  const bytes = await readFile(path!);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = PNG.sync.read(bytes);
  expect({ width: png.width, height: png.height }).toEqual({ width: 1200, height: 630 });
  expect(new Set(png.data).size).toBeGreaterThan(32);
  expect(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data).toMatch(/\?combo=nss-p2c-0138$/);
  const after = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot());
  expect(after.permanentMatrices).toEqual(before.permanentMatrices);
  expect(after.cameraPreset).toBe(before.cameraPreset);
  expect(errors).toEqual({ console: [], page: [], failed: [], external: [] });
});
