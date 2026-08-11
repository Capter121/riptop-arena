import { expect, test } from '@playwright/test';

const start = '/?return=campaign&opponent=sky-gale&sv=2&cv=1&rv=1&combo=nss-p2c-0138&a=LIGHT%2CFIRE%2CFIRE%2CWATER%2CEARTH';

test('returns the current build or cancels to the original campaign rival', async ({ page }) => {
  await page.goto(start);
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(page.getByTestId('return-campaign')).toBeVisible();
  await expect(page.getByTestId('cancel-campaign')).toBeVisible();
  await page.getByTestId('return-campaign').click();
  await expect(page).toHaveURL(/\/campaign\/\?return=campaign&opponent=sky-gale&sv=2&cv=1&rv=1&combo=nss-p2c-0138/);

  await page.goto(start);
  await page.getByTestId('cancel-campaign').click();
  await expect(page).toHaveURL(/\/campaign\/\?opponent=sky-gale$/);

  await page.goto('/?return=https%3A%2F%2Fevil.test&opponent=sky-gale');
  await expect(page.getByTestId('return-campaign')).toHaveCount(0);
  await expect(page.getByTestId('cancel-campaign')).toHaveCount(0);
});
