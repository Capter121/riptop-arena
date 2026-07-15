import { expect, test } from '@playwright/test';

test('undoes and redoes only successfully loaded combinations', async ({ page }) => {
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
  const defaultId = await page.getByTestId('combination-id').textContent();
  await expect(page.getByTestId('undo')).toBeDisabled();
  await page.getByTestId('part-blade_orbit_halo').click();
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready');
  const changedId = await page.getByTestId('combination-id').textContent();
  await expect(page.getByTestId('undo')).toBeEnabled();
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready');
  await expect(page.getByTestId('combination-id')).toHaveText(defaultId!);
  await expect(page.getByTestId('redo')).toBeEnabled();
  await page.keyboard.press('Control+Shift+Z');
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready');
  await expect(page.getByTestId('combination-id')).toHaveText(changedId!);
  await page.keyboard.press('Control+Z');
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready');
  await page.getByTestId('part-blade_iron_bastion').click();
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready');
  await expect(page.getByTestId('redo')).toBeDisabled();
  expect(errors).toEqual({ console: [], page: [], failed: [], external: [] });
});
