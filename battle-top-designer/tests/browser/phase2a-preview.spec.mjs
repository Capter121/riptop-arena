import playwrightTest from '../../preview/node_modules/@playwright/test/index.js';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const models = ['blade_storm_fang', 'blade_iron_bastion', 'blade_orbit_halo', 'blade_dual_comet'];
const { test, expect } = playwrightTest;
const results = [];

test.afterAll(async () => {
  const result = results.length === models.length ? 'PASS' : 'FAIL';
  await writeFile(resolve('../reports/validation/browser-test.json'), `${JSON.stringify({ result, models: results }, null, 2)}\n`);
});

for (const model of models) {
  test(`${model} offline preview controls`, async ({ page }) => {
    const errors = { console: [], page: [], requests: [] };
    page.on('console', message => { if (message.type() === 'error') errors.console.push(message.text()); });
    page.on('pageerror', error => errors.page.push(error.message));
    page.on('requestfailed', request => errors.requests.push(request.url()));
    await page.goto('/preview/');
    await page.selectOption('#model-select', model);
    await page.waitForTimeout(1000);
    const state = await page.locator('#load-status').getAttribute('data-state');
    if (state !== 'ready') throw new Error(`Preview did not become ready: ${JSON.stringify(errors)}`);
    await expect(page.locator('#load-status')).toHaveAttribute('data-state', 'ready');
    await expect(page.locator('#model-id')).toHaveText(model);
    const before = await page.evaluate(() => window.__NSS_PREVIEW__.snapshot());
    expect(before.canvas.width).toBeGreaterThan(0); expect(before.canvas.height).toBeGreaterThan(0);
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5);
    await page.mouse.down(); await page.mouse.move(box.x + box.width * .7, box.y + box.height * .6); await page.mouse.up();
    const rotated = await page.evaluate(() => window.__NSS_PREVIEW__.snapshot());
    expect(rotated.camera).not.toEqual(before.camera);
    await canvas.hover(); await page.mouse.wheel(0, -500);
    const zoomed = await page.evaluate(() => window.__NSS_PREVIEW__.snapshot());
    expect(Math.abs(zoomed.distance - rotated.distance)).toBeGreaterThan(1e-5);
    await page.click('#reset-camera');
    const reset = await page.evaluate(() => window.__NSS_PREVIEW__.snapshot());
    const error = Math.hypot(reset.camera[0]-.09, reset.camera[1]+.09, reset.camera[2]-.075, ...reset.target);
    expect(error).toBeLessThan(1e-6);
    expect(errors).toEqual({ console: [], page: [], requests: [] });
    await page.screenshot({ path: resolve(`../reports/renders/preview_${model}.png`), fullPage: true });
    results.push({ model_id: model, canvas: reset.canvas, rotation_changed: true, zoom_changed: true, reset_error: error, errors });
  });
}
