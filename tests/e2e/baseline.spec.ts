import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('keeps the portal entries and starts the arena canvas without fatal errors', async ({ page }) => {
  const portal = await readFile(new URL('../../site/index.html', import.meta.url), 'utf8');
  expect(portal).toContain('href="./customizer/"');
  expect(portal).toContain('href="./arena/"');

  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/');
  const canvas = page.locator('canvas[data-engine^="three.js"]');
  await expect(canvas).toBeVisible({ timeout: 30000 });
  const size = await canvas.boundingBox();
  expect(size?.width).toBeGreaterThan(0);
  expect(size?.height).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
});
