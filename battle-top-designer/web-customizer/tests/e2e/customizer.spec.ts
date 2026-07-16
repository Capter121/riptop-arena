import { expect, test } from '@playwright/test';

test('complete offline customizer flow', async ({ page }, testInfo) => {
  test.setTimeout(240000);
  const errors = { console: [] as string[], page: [] as string[], failed: [] as string[], external: [] as string[] };
  const glbRequests = new Map<string, number>();
  page.on('console', message => { if (message.type() === 'error') errors.console.push(message.text()); });
  page.on('pageerror', error => errors.page.push(error.message));
  page.on('requestfailed', request => errors.failed.push(request.url()));
  page.on('request', request => {
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) errors.external.push(request.url());
    if (url.pathname.endsWith('.glb')) glbRequests.set(url.pathname, (glbRequests.get(url.pathname) ?? 0) + 1);
  });

  await page.goto('/');
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
  let snapshot = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot());
  expect(snapshot.combination).toEqual({
    core: 'core_solar_wolf', blade: 'blade_storm_fang', assist: 'assist_heavy', gear: 'gear_low', tip: 'tip_flat_attack',
  });
  expect(snapshot.activeRoots).toBe(5);
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const cameraBefore = snapshot.cameraPosition;
  await page.mouse.move(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.68, box!.y + box!.height * 0.58);
  await page.mouse.up();
  await page.waitForTimeout(100);
  snapshot = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot());
  expect(snapshot.cameraPosition).not.toEqual(cameraBefore);
  const distanceBefore = snapshot.cameraDistance;
  await canvas.hover();
  await page.mouse.wheel(0, -450);
  await page.waitForTimeout(100);
  snapshot = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot());
  expect(Math.abs(snapshot.cameraDistance - distanceBefore)).toBeGreaterThan(0.001);

  const ids = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.enumerateIds());
  expect(ids).toHaveLength(288);
  expect(new Set(ids).size).toBe(288);

  await page.getByTestId('tab-core').click();
  await page.getByTestId('part-core_void_falcon').click();
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready');
  await page.getByTestId('tab-blade').click();
  await page.getByTestId('part-blade_orbit_halo').click();
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready');

  await page.getByTestId('tab-assist').click();
  await page.getByTestId('part-assist_guard').click();
  await expect(page.getByTestId('assist-focus-readout')).toContainText('Guard Assist');
  snapshot = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot());
  expect(snapshot.focus).toBe('assist');
  expect(snapshot.cameraPreset).toBe('perspective');
  expect(snapshot.presentationTargets.assist).toBeGreaterThan(0);

  await page.getByTestId('tab-gear').click();
  await page.getByTestId('part-gear_high').click();
  await expect(page.getByTestId('gear-height-readout')).toContainText('6.0 mm');
  snapshot = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot());
  expect(snapshot.focus).toBe('gear');
  expect(snapshot.cameraPreset).toBe('side');

  await page.getByTestId('tab-tip').click();
  await page.getByTestId('part-tip_needle_stamina').click();
  await expect(page.getByTestId('tip-contact-readout')).toContainText('Needle');
  snapshot = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot());
  expect(snapshot.focus).toBe('tip');
  expect(snapshot.cameraPreset).toBe('bottom');
  await expect(page.getByTestId('attribute-disclaimer')).toHaveText('Concept attributes for prototype use only.');

  await expect.poll(async () => (await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot())).focus).toBeNull();

  const permanentBefore = (await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot())).permanentMatrices;
  await page.getByTestId('explode').click();
  snapshot = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot());
  expect(snapshot.exploded).toBe(true);
  expect(snapshot.presentationTargets.tip).toBeLessThan(snapshot.presentationTargets.gear);
  await page.getByTestId('explode').click();
  snapshot = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot());
  expect(snapshot.exploded).toBe(false);
  expect(Object.values(snapshot.presentationTargets)).toEqual([0, 0, 0, 0, 0]);
  expect(snapshot.permanentMatrices).toEqual(permanentBefore);

  await page.getByTestId('save').click();
  const savedId = await page.getByTestId('combination-id').textContent();
  await page.getByTestId('storm-reset').click();
  await page.getByTestId('restore-local').click();
  await expect(page.getByTestId('combination-id')).toHaveText(savedId!);

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export').click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  await page.getByTestId('storm-reset').click();
  await page.getByTestId('import-file').setInputFiles(path!);
  await expect(page.getByTestId('combination-id')).toHaveText(savedId!);

  if (testInfo.project.name === 'desktop') {
    const allParts = {
      core: ['core_solar_wolf', 'core_void_falcon'],
      blade: ['blade_dual_comet', 'blade_iron_bastion', 'blade_orbit_halo', 'blade_storm_fang'],
      assist: ['assist_air', 'assist_guard', 'assist_heavy'],
      gear: ['gear_high', 'gear_low', 'gear_medium'],
      tip: ['tip_ball_defense', 'tip_flat_attack', 'tip_needle_stamina', 'tip_taper_balance'],
    };
    for (const [family, parts] of Object.entries(allParts)) {
      await page.getByTestId(`tab-${family}`).click();
      for (const part of parts) {
        await page.getByTestId(`part-${part}`).click();
        await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready');
      }
    }
  }

  await page.getByTestId('debug-axis').click();
  expect((await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot())).debugAxis).toBe(true);
  await page.getByTestId('reset-view').click();
  expect((await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot())).cameraPreset).toBe('perspective');

  expect([...glbRequests.values()].every(count => count === 1)).toBe(true);
  expect(errors).toEqual({ console: [], page: [], failed: [], external: [] });
  await testInfo.attach('technical-errors', { body: JSON.stringify(errors, null, 2), contentType: 'application/json' });
});
