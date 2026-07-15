import playwrightTest from '../../preview/node_modules/@playwright/test/index.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const fixtures = ['heavy', 'guard', 'air'];
const { test, expect } = playwrightTest;
const records = [];

test.afterAll(async () => {
  const passed = records.length === fixtures.length && records.every(record => record.result === 'PASS');
  await writeFile(resolve('../reports/validation/phase2b-r1-browser-test.json'), `${JSON.stringify({
    result: passed ? 'PASS' : 'FAIL',
    three_version: '0.185.1',
    fixtures: records,
  }, null, 2)}\n`);
});

for (const assist of fixtures) {
  test(`${assist} Assist focus and restore`, async ({ page }) => {
    const errors = { console: [], page: [], requests: [], external: [] };
    page.on('console', message => { if (message.type() === 'error') errors.console.push(message.text()); });
    page.on('pageerror', error => errors.page.push(error.message));
    page.on('requestfailed', request => errors.requests.push(request.url()));
    page.on('request', request => {
      const url = new URL(request.url());
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) errors.external.push(request.url());
    });
    await page.setViewportSize({ width: 720, height: 720 });
    await page.goto('/preview/');
    await page.waitForFunction(() => document.querySelector('#load-status')?.dataset.state === 'ready');
    const modelId = `assembly_phase2b_r1_assist_${assist}`;
    await page.selectOption('#model-select', modelId);
    await page.waitForFunction(expected => document.querySelector('#model-id')?.textContent === expected
      && document.querySelector('#load-status')?.dataset.state === 'ready', modelId);
    const automatic = await page.evaluate(() => window.__NSS_PREVIEW__.snapshot());
    expect(automatic.modelId).toBe(modelId);
    expect(automatic.focus.state).toBe('focused');
    const focused = await page.evaluate(() => {
      window.__NSS_PREVIEW__.focusAssist();
      return window.__NSS_PREVIEW__.snapshot();
    });
    expect(focused.canvas.width).toBeGreaterThan(0);
    expect(focused.canvas.height).toBeGreaterThan(0);
    expect(focused.axesHelperCount).toBe(0);
    expect(focused.focus.state).toBe('focused');
    expect(focused.focus.highlightActive).toBe(true);
    focused.focus.assistOffsetMm.forEach(offset => expect(Math.abs(offset - 6)).toBeLessThan(1e-6));
    focused.focus.bladeOpacity.forEach(opacity => expect(Math.abs(opacity - 0.22)).toBeLessThan(1e-9));
    focused.focus.bladeDepthWrite.forEach(depthWrite => expect(depthWrite).toBe(false));
    expect(Math.hypot(focused.camera[0] - 0.085, focused.camera[1] - 0.085, focused.camera[2] - 0.07, ...focused.target)).toBeLessThan(1e-6);
    const folder = resolve('../reports/renders/phase2b-r1/assist-focus');
    await mkdir(folder, { recursive: true });
    await page.locator('canvas').screenshot({ path: resolve(folder, `${assist}_browser_highlight.png`) });
    await page.waitForTimeout(850);
    const settled = await page.evaluate(() => window.__NSS_PREVIEW__.snapshot());
    expect(settled.focus.highlightActive).toBe(false);
    await page.locator('canvas').screenshot({ path: resolve(folder, `${assist}_browser.png`) });
    await page.click('#restore-assembly');
    const restored = await page.evaluate(() => window.__NSS_PREVIEW__.snapshot());
    expect(restored.focus.state).toBe('assembled');
    expect(restored.focus.lastRestoreError).toBeLessThan(1e-9);
    restored.focus.assistOffsetMm.forEach(offset => expect(Math.abs(offset)).toBeLessThan(1e-9));
    expect(errors).toEqual({ console: [], page: [], requests: [], external: [] });
    records.push({ model_id: modelId, result: 'PASS', focused: focused.focus, restored: restored.focus, canvas: restored.canvas, errors });
  });
}
