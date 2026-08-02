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

  await expect(page.getByTestId('affinity-panel')).toBeVisible();
  await expect(page.getByTestId('affinity-option-WIND')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.part-strip button [data-affinity="WIND"]')).toHaveCount(4);
  await expect(page.getByTestId('build-profile-panel')).toHaveAttribute('data-profile', 'ASSAULT');
  await expect(page.getByTestId('build-profile-primary')).toHaveText('强袭');
  await expect(page.getByTestId('build-profile-panel')).toContainText('不提供额外加成');
  await expect(page.getByTestId('build-profile-panel').locator('button')).toHaveCount(0);

  await page.getByTestId('part-blade_orbit_halo').click();
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready');
  await expect(page.getByTestId('build-profile-panel')).toHaveAttribute('data-profile', 'BALANCED');
  await expect(page.getByTestId('build-profile-reasons')).toContainText('四项最大差值 8');
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready');
  await expect(page.getByTestId('build-profile-panel')).toHaveAttribute('data-profile', 'ASSAULT');

  const previewSnapshot = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot());
  if (testInfo.project.name === 'desktop') {
    await page.getByTestId('part-blade_orbit_halo').hover();
    await expect(page.getByTestId('part-comparison')).toContainText('Storm Fang → Orbit Halo');
    await expect(page.getByTestId('part-comparison')).toContainText('−11');
    let currentPreviewSnapshot = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot());
    expect(currentPreviewSnapshot.combination).toEqual(previewSnapshot.combination);
    expect(currentPreviewSnapshot.affinities).toEqual(previewSnapshot.affinities);
    expect(currentPreviewSnapshot.historyDepth).toBe(previewSnapshot.historyDepth);
    await page.getByTestId('part-blade_storm_fang').hover();
    await expect(page.getByTestId('part-comparison')).toHaveCount(0);

    await page.getByTestId('affinity-option-FIRE').hover();
    await expect(page.getByTestId('affinity-comparison')).toContainText('风 → 火');
    currentPreviewSnapshot = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot());
    expect(currentPreviewSnapshot.combination).toEqual(previewSnapshot.combination);
    expect(currentPreviewSnapshot.affinities).toEqual(previewSnapshot.affinities);
    expect(currentPreviewSnapshot.historyDepth).toBe(previewSnapshot.historyDepth);
    await page.getByTestId('affinity-option-WIND').hover();
    await expect(page.getByTestId('affinity-comparison')).toHaveCount(0);
  } else {
    const candidate = page.getByTestId('affinity-option-FIRE');
    const candidateBox = await candidate.boundingBox();
    expect(candidateBox).not.toBeNull();
    const touch = { pointerId: 41, pointerType: 'touch', clientX: candidateBox!.x + 10, clientY: candidateBox!.y + 10 };
    await candidate.dispatchEvent('pointerdown', touch);
    await page.waitForTimeout(360);
    await expect(page.getByTestId('affinity-comparison')).toBeVisible();
    const currentPreviewSnapshot = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot());
    expect(currentPreviewSnapshot.combination).toEqual(previewSnapshot.combination);
    expect(currentPreviewSnapshot.affinities).toEqual(previewSnapshot.affinities);
    expect(currentPreviewSnapshot.historyDepth).toBe(previewSnapshot.historyDepth);
    await candidate.dispatchEvent('pointerup', touch);
    await expect(page.getByTestId('affinity-comparison')).toHaveCount(0);
    await expect(candidate).toHaveAttribute('aria-pressed', 'false');

    await candidate.dispatchEvent('pointerdown', { ...touch, pointerId: 42 });
    await candidate.dispatchEvent('pointermove', { ...touch, pointerId: 42, clientX: touch.clientX + 9 });
    await page.waitForTimeout(360);
    await expect(page.getByTestId('affinity-comparison')).toHaveCount(0);
    await candidate.dispatchEvent('pointerup', { ...touch, pointerId: 42, clientX: touch.clientX + 9 });
  }
  await page.evaluate(() => {
    const status = document.querySelector('[data-testid="load-status"]')!;
    (window as any).__AFFINITY_LOAD_STATES__ = [];
    (window as any).__AFFINITY_LOAD_OBSERVER__ = new MutationObserver(() => {
      (window as any).__AFFINITY_LOAD_STATES__.push(status.getAttribute('data-state'));
    });
    (window as any).__AFFINITY_LOAD_OBSERVER__.observe(status, { attributes: true, attributeFilter: ['data-state'] });
  });
  await page.getByTestId('affinity-option-FIRE').click();
  await expect(page.getByTestId('affinity-option-FIRE')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.part-strip button [data-affinity="FIRE"]')).toHaveCount(4);
  await expect(page.getByTestId('affinity-count-FIRE')).toContainText('2');
  await expect(page.getByTestId('affinity-resonance')).toContainText('协调共鸣');
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready');
  expect(await page.evaluate(() => (window as any).__AFFINITY_LOAD_STATES__)).toEqual([]);
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('affinity-option-WIND')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('redo').click();
  await expect(page.getByTestId('affinity-option-FIRE')).toHaveAttribute('aria-pressed', 'true');

  if (testInfo.project.name === 'mobile') {
    const affinityButtonBox = await page.getByTestId('affinity-option-FIRE').boundingBox();
    expect(affinityButtonBox).not.toBeNull();
    expect(affinityButtonBox!.width).toBeGreaterThanOrEqual(44);
    expect(affinityButtonBox!.height).toBeGreaterThanOrEqual(44);
    expect(await page.locator('.affinity-options').evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
    const partStripBox = await page.locator('.part-strip').boundingBox();
    const affinityPanelBox = await page.getByTestId('affinity-panel').boundingBox();
    expect(partStripBox).not.toBeNull();
    expect(affinityPanelBox).not.toBeNull();
    expect(affinityPanelBox!.y).toBeGreaterThanOrEqual(partStripBox!.y + partStripBox!.height - 1);
  }

  const beforeBurst = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot());
  for (const family of ['core', 'gear', 'tip']) {
    await page.getByTestId(`tab-${family}`).click();
    await page.getByTestId('affinity-option-FIRE').click();
  }
  await expect(page.getByTestId('build-profile-panel')).toHaveAttribute('data-profile', 'BURST');
  await expect(page.getByTestId('build-profile-primary')).toHaveText('爆裂');
  await expect(page.getByTestId('build-profile-reasons')).toContainText('5 件火属性');
  await expect(page.getByTestId('build-profile-reasons')).toContainText('元素进攻共鸣 +15%');
  const burstSnapshot = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot());
  expect(burstSnapshot.combination).toEqual(beforeBurst.combination);
  expect(burstSnapshot.historyDepth).toBe(beforeBurst.historyDepth + 3);
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready');

  for (const [family, affinity] of [['core', 'LIGHT'], ['gear', 'WATER'], ['tip', 'EARTH']] as const) {
    await page.getByTestId(`tab-${family}`).click();
    await page.getByTestId(`affinity-option-${affinity}`).click();
  }
  await expect(page.getByTestId('build-profile-panel')).toHaveAttribute('data-profile', 'ASSAULT');

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
  await expect(page.getByTestId('attribute-disclaimer')).toHaveText('概念属性仅供原型使用。');

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
