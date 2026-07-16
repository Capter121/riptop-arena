import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { summarizeCachedSwitches, type CachedSwitchSample } from '../../src/performance/cachedSwitchDiagnostics';

const SESSION_COUNT = 5;
const WARMUP_SWITCHES = 5;
const MEASURED_SWITCHES = 50;
const EXPECTED_SAMPLES = SESSION_COUNT * MEASURED_SWITCHES;
const output = resolve(process.cwd(), '../reports/validation', process.env.PHASE3B_CACHED_DIAGNOSTIC_REPORT ?? 'phase3b-cached-switch-diagnostics-before.json');

async function switchAndWait(page: Page, partId: string, diagnostic: boolean) {
  return page.evaluate(async ({ partId, diagnostic }) => {
    const api = (window as any).__NSS_CUSTOMIZER__;
    const before = diagnostic ? api.cachedSwitchSamples().length : performance.getEntriesByName('phase3b:part-switch-duration').length;
    api.selectBladeForDiagnostics(partId);
    await new Promise<void>((resolvePromise, reject) => {
      const started = performance.now();
      const check = () => {
        const count = diagnostic ? api.cachedSwitchSamples().length : performance.getEntriesByName('phase3b:part-switch-duration').length;
        if (count > before) resolvePromise();
        else if (performance.now() - started > 5_000) reject(new Error(`Cached switch to ${partId} timed out.`));
        else requestAnimationFrame(check);
      };
      check();
    });
  }, { partId, diagnostic });
}

test('capture fixed 5x50 desktop cached-switch diagnostics', async ({ browser }, testInfo) => {
  test.setTimeout(600_000);
  const samples: Array<CachedSwitchSample & { browserSession: number; sampleInSession: number }> = [];
  const errors = { console: [] as string[], pageerror: [] as string[], failedRequest: [] as string[], externalRequest: [] as string[] };

  for (let browserSession = 1; browserSession <= SESSION_COUNT; browserSession += 1) {
    const context = await browser.newContext(testInfo.project.use);
    const page = await context.newPage();
    page.on('console', message => { if (message.type() === 'error') errors.console.push(message.text()); });
    page.on('pageerror', error => errors.pageerror.push(error.message));
    page.on('requestfailed', request => errors.failedRequest.push(request.url()));
    page.on('request', request => {
      const hostname = new URL(request.url()).hostname;
      if (hostname !== '127.0.0.1' && hostname !== 'localhost') errors.externalRequest.push(request.url());
    });
    await page.goto('/');
    await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });

    for (let warmup = 0; warmup < WARMUP_SWITCHES; warmup += 1) {
      await switchAndWait(page, warmup % 2 === 0 ? 'blade_iron_bastion' : 'blade_storm_fang', false);
    }
    await page.evaluate(() => {
      const api = (window as any).__NSS_CUSTOMIZER__;
      api.clearCachedSwitchDiagnostics();
      api.setCachedSwitchDiagnostics(true);
      if (typeof (window as any).gc === 'function') (window as any).gc();
    });

    for (let index = 0; index < MEASURED_SWITCHES; index += 1) {
      await switchAndWait(page, index % 2 === 0 ? 'blade_storm_fang' : 'blade_iron_bastion', true);
    }
    const sessionSamples = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.cachedSwitchSamples()) as CachedSwitchSample[];
    expect(sessionSamples).toHaveLength(MEASURED_SWITCHES);
    expect(sessionSamples.every(sample => sample.cacheHit)).toBe(true);
    samples.push(...sessionSamples.map((sample, index) => ({ ...sample, browserSession, sampleInSession: index + 1 })));
    await context.close();
  }

  expect(samples).toHaveLength(EXPECTED_SAMPLES);
  expect(errors).toEqual({ console: [], pageerror: [], failedRequest: [], externalRequest: [] });
  const report = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    browser: { name: browser.browserType().name(), version: browser.version() },
    protocol: { browserSessions: SESSION_COUNT, warmupSwitchesPerSession: WARMUP_SWITCHES, measuredSwitchesPerSession: MEASURED_SWITCHES, totalMeasuredSamples: EXPECTED_SAMPLES, removedSamples: 0 },
    measurementBoundary: { start: 'legal part-switch intent before Zustand write', end: 'first completed renderer frame with matching combination_id' },
    summary: summarizeCachedSwitches(samples),
    errors,
    samples,
    notices: [
      'Human visual review remains pending.',
      'Development continued under a documented provisional internal-prototype decision.',
    ],
  };
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
});
