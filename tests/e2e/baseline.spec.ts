import { expect, test } from '@playwright/test';

test('starts the arena canvas without fatal errors', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/arena/');
  const canvas = page.locator('canvas[data-engine^="three.js"]');
  await expect(canvas).toBeVisible({ timeout: 30000 });
  const size = await canvas.boundingBox();
  expect(size?.width).toBeGreaterThan(0);
  expect(size?.height).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
});
