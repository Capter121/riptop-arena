import { expect, test } from '@playwright/test';

test('keeps only the latest focus readout through rapid replacements', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await page.getByTestId('tab-assist').click();
  await page.getByTestId('part-assist_guard').click();
  await expect(page.getByTestId('assist-focus-readout')).toContainText('Guard');
  const firstSession = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot().focusSession);
  await page.getByTestId('part-assist_air').click();
  await expect(page.getByTestId('assist-focus-readout')).toContainText('Air');
  expect(await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot().focusSession)).toBeGreaterThan(firstSession);

  await page.getByTestId('tab-tip').click();
  await page.getByTestId('part-tip_needle_stamina').click();
  await expect(page.getByTestId('tip-contact-readout')).toContainText('Needle');
  await expect(page.getByTestId('assist-focus-readout')).toHaveCount(0);

  await page.getByTestId('tab-assist').click();
  await page.getByTestId('part-assist_guard').click();
  await expect(page.getByTestId('assist-focus-readout')).toContainText('Guard');
  await expect(page.getByTestId('tip-contact-readout')).toHaveCount(0);
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready');
  const permanentBeforeExit = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot().permanentMatrices);
  await expect.poll(async () => (await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot())).focusPhase).toBe('idle');
  await expect(page.getByTestId('assist-focus-readout')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot().permanentMatrices)).toEqual(permanentBeforeExit);
});

test('preserves focus consistency with reduced motion and low-performance mode', async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await page.getByTestId('low-performance').click();
  await page.getByTestId('tab-tip').click();
  await page.getByTestId('part-tip_taper_balance').click();
  await expect(page.getByTestId('tip-contact-readout')).toContainText('Taper');
  await expect.poll(async () => (await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot())).focusPhase).toBe('idle');
  await expect(page.getByTestId('tip-contact-readout')).toHaveCount(0);
});
