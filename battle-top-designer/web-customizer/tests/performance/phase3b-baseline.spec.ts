import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve(process.cwd(), '../reports/validation/phase3b-performance-baseline.json');
const notices = [
  'Human visual review remains pending.',
  'Development continued under a documented provisional internal-prototype decision.',
];

type Sample = {
  shellReadyMs: number;
  sceneRuntimeLoadedMs: number;
  firstModelReadyMs: number;
  interactionReadyMs: number;
};

function summarize(values: number[]) {
  const samples = [...values].sort((left, right) => left - right);
  const middle = Math.floor(samples.length / 2);
  return {
    median: samples.length % 2 ? samples[middle] : (samples[middle - 1] + samples[middle]) / 2,
    p95: samples[Math.ceil(samples.length * 0.95) - 1],
    samples,
  };
}

async function attachGuards(page: Page) {
  const errors = { console: [] as string[], pageerror: [] as string[], failedRequest: [] as string[], externalRequest: [] as string[] };
  page.on('console', message => { if (message.type() === 'error') errors.console.push(message.text()); });
  page.on('pageerror', error => errors.pageerror.push(error.message));
  page.on('requestfailed', request => errors.failedRequest.push(request.url()));
  page.on('request', request => {
    const host = new URL(request.url()).hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') errors.externalRequest.push(request.url());
  });
  return errors;
}

async function ready(page: Page): Promise<Sample> {
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName('phase3b:interaction-ready').length)).toBe(1);
  return page.evaluate(() => {
    const at = (name: string) => performance.getEntriesByName(name)[0]?.startTime ?? -1;
    return {
      shellReadyMs: at('phase3b:shell-ready'),
      sceneRuntimeLoadedMs: at('phase3b:scene-runtime-loaded'),
      firstModelReadyMs: at('phase3b:first-model-ready'),
      interactionReadyMs: at('phase3b:interaction-ready'),
    };
  });
}

async function switchBlade(page: Page, id: string) {
  const before = await page.evaluate(() => performance.getEntriesByName('phase3b:part-switch-duration').length);
  await page.getByTestId('tab-blade').click();
  await page.getByTestId(`part-${id}`).click();
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName('phase3b:part-switch-duration').length)).toBeGreaterThan(before);
  return page.evaluate(() => performance.getEntriesByName('phase3b:part-switch-duration').at(-1)!.duration);
}

async function newMeasuredPage(context: BrowserContext) {
  const page = await context.newPage();
  const errors = await attachGuards(page);
  await page.goto('/');
  return { page, errors, sample: await ready(page) };
}

async function collectProfile(browser: Browser, projectName: string, contextOptions: object) {
  const coldCache: Sample[] = [];
  const hotCache: Sample[] = [];
  const coldSwitch: number[] = [];
  const cachedSwitch: number[] = [];
  const allErrors = [];
  let memory: Record<string, unknown> = { status: 'NOT_MEASURABLE', reason: 'Reliable GC and heap data were not available.' };

  for (let index = 0; index < 3; index += 1) {
    const context = await browser.newContext(contextOptions);
    const first = await newMeasuredPage(context);
    coldCache.push(first.sample);
    allErrors.push(first.errors);
    coldSwitch.push(await switchBlade(first.page, 'blade_iron_bastion'));
    await switchBlade(first.page, 'blade_storm_fang');
    cachedSwitch.push(await switchBlade(first.page, 'blade_iron_bastion'));

    if (index === 0) {
      const measurable = await first.page.evaluate(() => typeof (window as any).gc === 'function' && Boolean((performance as any).memory));
      if (measurable) {
        await first.page.evaluate(() => (window as any).gc());
        const before = await first.page.evaluate(() => (performance as any).memory.usedJSHeapSize as number);
        await first.page.evaluate(async () => {
          for (let turn = 0; turn < 100; turn += 1) {
            const beforeCount = performance.getEntriesByName('phase3b:part-switch-duration').length;
            (window as any).__NSS_CUSTOMIZER__.selectBladeForDiagnostics(turn % 2 ? 'blade_iron_bastion' : 'blade_storm_fang');
            await new Promise<void>((resolve, reject) => {
              const started = performance.now();
              const check = () => {
                if (performance.getEntriesByName('phase3b:part-switch-duration').length > beforeCount) resolve();
                else if (performance.now() - started > 5000) reject(new Error(`Diagnostic switch ${turn + 1} timed out.`));
                else requestAnimationFrame(check);
              };
              check();
            });
          }
        });
        await first.page.evaluate(() => (window as any).gc());
        const after = await first.page.evaluate(() => (performance as any).memory.usedJSHeapSize as number);
        memory = { status: 'MEASURED', beforeBytes: before, afterBytes: after, deltaBytes: after - before, switchCount: 100 };
      }
    }
    await first.page.close();
    const hot = await context.newPage();
    allErrors.push(await attachGuards(hot));
    await hot.goto('/');
    hotCache.push(await ready(hot));
    await context.close();
  }

  const metric = (key: keyof Sample, samples: Sample[]) => summarize(samples.map(sample => sample[key]));
  const errors = allErrors.reduce((total, current) => ({
    console: total.console + current.console.length,
    pageerror: total.pageerror + current.pageerror.length,
    failedRequest: total.failedRequest + current.failedRequest.length,
    externalRequest: total.externalRequest + current.externalRequest.length,
  }), { console: 0, pageerror: 0, failedRequest: 0, externalRequest: 0 });
  return {
    project: projectName,
    samplesPerCondition: 3,
    coldCache: {
      shellReadyMs: metric('shellReadyMs', coldCache),
      sceneRuntimeLoadedMs: metric('sceneRuntimeLoadedMs', coldCache),
      firstModelReadyMs: metric('firstModelReadyMs', coldCache),
      interactionReadyMs: metric('interactionReadyMs', coldCache),
    },
    hotCache: {
      shellReadyMs: metric('shellReadyMs', hotCache),
      sceneRuntimeLoadedMs: metric('sceneRuntimeLoadedMs', hotCache),
      firstModelReadyMs: metric('firstModelReadyMs', hotCache),
      interactionReadyMs: metric('interactionReadyMs', hotCache),
    },
    coldSwitchMs: summarize(coldSwitch),
    cachedSwitchMs: summarize(cachedSwitch),
    memory,
    errors,
  };
}

async function bundleStats() {
  const directory = resolve(process.cwd(), 'dist/assets');
  const files = (await readdir(directory)).filter(file => file.endsWith('.js')).sort();
  const chunks = await Promise.all(files.map(async file => {
    const bytes = await readFile(resolve(directory, file));
    return { file: `assets/${file}`, rawBytes: bytes.length, gzipBytes: gzipSync(bytes).length };
  }));
  return {
    chunks,
    totalRawBytes: chunks.reduce((total, chunk) => total + chunk.rawBytes, 0),
    totalGzipBytes: chunks.reduce((total, chunk) => total + chunk.gzipBytes, 0),
  };
}

test('capture reproducible Phase 3B performance baseline', async ({ browser }, testInfo) => {
  test.setTimeout(360000);
  const profile = await collectProfile(browser, testInfo.project.name, testInfo.project.use);
  expect(profile.errors).toEqual({ console: 0, pageerror: 0, failedRequest: 0, externalRequest: 0 });
  const previous = await readFile(output, 'utf8').then(JSON.parse).catch(() => ({ profiles: {} }));
  const report = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    browser: { name: browser.browserType().name(), version: browser.version() },
    sampling: { runs: 3, cpuThrottling: 'none', networkThrottling: 'none', server: 'local Vite preview' },
    marks: ['phase3b:shell-ready', 'phase3b:scene-runtime-loaded', 'phase3b:first-model-ready', 'phase3b:interaction-ready', 'phase3b:part-switch-start', 'phase3b:part-switch-end'],
    bundle: await bundleStats(),
    profiles: { ...previous.profiles, [testInfo.project.name]: profile },
    notices,
  };
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
});
