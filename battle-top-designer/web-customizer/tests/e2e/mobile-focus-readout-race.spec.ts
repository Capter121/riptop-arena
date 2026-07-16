import { expect, test } from '@playwright/test';

test('keeps mobile focus readouts consistent through rapid part changes', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors = { console: [] as string[], page: [] as string[], failed: [] as string[], external: [] as string[] };
  page.on('console', message => { if (message.type() === 'error') errors.console.push(message.text()); });
  page.on('pageerror', error => errors.page.push(error.message));
  page.on('requestfailed', request => errors.failed.push(request.url()));
  page.on('request', request => {
    const hostname = new URL(request.url()).hostname;
    if (!['127.0.0.1', 'localhost'].includes(hostname)) errors.external.push(request.url());
  });

  await page.goto('/');
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await page.evaluate(() => {
    const api = (window as any).__NSS_CUSTOMIZER__;
    api.clearFocusDiagnostics();
    api.setFocusDiagnostics(true);
  });

  try {
    await page.getByTestId('tab-assist').click();
    await page.getByTestId('part-assist_guard').click();
    await expect(page.getByTestId('assist-focus-readout')).toContainText('Guard Assist');
    let snapshot = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot());
    expect(snapshot).toMatchObject({ focus: 'assist', combination: { assist: 'assist_guard' } });

    await page.getByTestId('part-assist_air').click();
    await page.getByTestId('part-assist_heavy').click();
    await expect(page.getByTestId('assist-focus-readout')).toContainText('Heavy Assist');
    snapshot = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot());
    expect(snapshot).toMatchObject({ focus: 'assist', combination: { assist: 'assist_heavy' } });

    await page.getByTestId('tab-tip').click();
    await page.getByTestId('part-tip_needle_stamina').click();
    await expect(page.getByTestId('tip-contact-readout')).toContainText('Needle');
    snapshot = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot());
    expect(snapshot).toMatchObject({ focus: 'tip', combination: { tip: 'tip_needle_stamina' } });

    await page.getByTestId('tab-assist').click();
    await page.getByTestId('part-assist_guard').click();
    await page.getByTestId('tab-tip').click();
    await page.getByTestId('part-tip_taper_balance').click();
    await expect(page.getByTestId('tip-contact-readout')).toContainText('Taper');
    expect(await page.getByTestId('assist-focus-readout').count()).toBe(0);
    const permanentBeforeRestore = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot().permanentMatrices);

    await expect.poll(async () => (await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot())).focus).toBeNull();
    expect(await page.locator('[data-testid$="-readout"]').count()).toBe(0);
    expect((await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot())).permanentMatrices).toEqual(permanentBeforeRestore);
    expect(errors).toEqual({ console: [], page: [], failed: [], external: [] });
  } finally {
    const events = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.focusDiagnosticEvents());
    await testInfo.attach('focus-diagnostics', { body: JSON.stringify(events, null, 2), contentType: 'application/json' });
    await testInfo.attach('technical-errors', { body: JSON.stringify(errors, null, 2), contentType: 'application/json' });
  }
});
