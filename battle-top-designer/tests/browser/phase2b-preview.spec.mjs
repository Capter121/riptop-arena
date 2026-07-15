import playwrightTest from '../../preview/node_modules/@playwright/test/index.js';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const models = ['core_void_falcon', 'assist_guard', 'assist_air', 'gear_medium', 'gear_high'];
const { test, expect } = playwrightTest;
const results = [];

test.afterAll(async () => {
  const result = results.length === models.length ? 'PASS' : 'FAIL';
  await writeFile(resolve('../reports/validation/browser-test-phase2b.json'), `${JSON.stringify({ result, models: results }, null, 2)}\n`);
});

for (const model of models) {
  test(`${model} offline preview controls`, async ({ page }) => {
    const errors = { console: [], page: [], requests: [] };
    page.on('console', message => { if (message.type() === 'error') errors.console.push(message.text()); });
    page.on('pageerror', error => errors.page.push(error.message));
    page.on('requestfailed', request => errors.requests.push(request.url()));
    await page.goto('/preview/');
    await page.selectOption('#model-select', model);
    await page.waitForFunction(() => document.querySelector('#load-status')?.dataset.state === 'ready');
    await expect(page.locator('#model-id')).toHaveText(model);
    const before = await page.evaluate(() => window.__NSS_PREVIEW__.snapshot());
    expect(before.canvas.width).toBeGreaterThan(0);
    expect(before.canvas.height).toBeGreaterThan(0);
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6);
    await page.mouse.up();
    const rotated = await page.evaluate(() => window.__NSS_PREVIEW__.snapshot());
    expect(rotated.camera).not.toEqual(before.camera);
    await canvas.hover();
    await page.mouse.wheel(0, -500);
    const zoomed = await page.evaluate(() => window.__NSS_PREVIEW__.snapshot());
    expect(Math.abs(zoomed.distance - rotated.distance)).toBeGreaterThan(1e-5);
    await page.click('#reset-camera');
    const reset = await page.evaluate(() => window.__NSS_PREVIEW__.snapshot());
    const resetError = Math.hypot(reset.camera[0] - 0.09, reset.camera[1] + 0.09, reset.camera[2] - 0.075, ...reset.target);
    expect(resetError).toBeLessThan(1e-6);
    expect(errors).toEqual({ console: [], page: [], requests: [] });
    await page.screenshot({ path: resolve(`../reports/renders/preview_${model}.png`), fullPage: true });
    results.push({ model_id: model, canvas: reset.canvas, rotation_changed: true, zoom_changed: true, reset_error: resetError, errors });
  });
}
