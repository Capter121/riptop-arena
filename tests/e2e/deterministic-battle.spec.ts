import { expect, test, type Browser } from '@playwright/test';
import type { BattleInputLogV1 } from '../../src/sim/battleRecord';
import type { TurnAction } from '../../src/types/battle';

type QaApi = {
  startBattleWithSeed(seed: string): void;
  setVoiceSample(value: number | null): void;
  getBattleInputLog(): BattleInputLogV1 | null;
  startBattleReplay(log: BattleInputLogV1): void;
  getBattleOutcomeSummary(): string | null;
  quickLaunch(): void;
  submitTurnAction(action: TurnAction): void;
  forceResult(winner: 'player' | 'enemy'): void;
};

const SEED = '0123456789abcdef0123456789abcdef';
const OTHER_SEED = 'fedcba9876543210fedcba9876543210';

async function openScheduledPage(browser: Browser, frameMs?: number) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  if (frameMs !== undefined) {
    await context.addInitScript((scheduledFrameMs) => {
      let virtualNow = 0;
      window.requestAnimationFrame = (callback: FrameRequestCallback) => window.setTimeout(() => {
        if (virtualNow === 0) virtualNow = performance.now();
        virtualNow += scheduledFrameMs;
        callback(virtualNow);
      }, scheduledFrameMs);
      window.cancelAnimationFrame = (handle: number) => window.clearTimeout(handle);
    }, frameMs);
  }
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/arena/?qa=1');
  await expect(page.locator('canvas[data-engine^="three.js"]')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => Boolean((window as Window & { __RIPTOP_QA__?: unknown }).__RIPTOP_QA__));
  return { context, page, pageErrors };
}

test('replays an exact battle outcome across 30Hz and 144Hz render schedules', async ({ browser }) => {
  test.setTimeout(150_000);
  const recording = await openScheduledPage(browser, 1000 / 30);

  await recording.page.evaluate((seed) => {
    const api = (window as Window & { __RIPTOP_QA__: QaApi }).__RIPTOP_QA__;
    api.setVoiceSample(96);
    api.startBattleWithSeed(seed);
    api.quickLaunch();
    api.submitTurnAction({ kind: 'charge' });
    api.forceResult('player');
  }, SEED);
  await recording.page.waitForFunction(() => (
    (window as Window & { __RIPTOP_QA__: QaApi }).__RIPTOP_QA__.getBattleOutcomeSummary() !== null
  ), undefined, { timeout: 30_000 });
  const golden = await recording.page.evaluate(() => {
    const api = (window as Window & { __RIPTOP_QA__: QaApi }).__RIPTOP_QA__;
    return { log: api.getBattleInputLog(), summary: api.getBattleOutcomeSummary() };
  });
  expect(golden.log).not.toBeNull();
  expect(golden.log?.turns).toHaveLength(1);
  expect(recording.pageErrors).toEqual([]);
  await recording.context.close();

  const replay = await openScheduledPage(browser, 1000 / 144);
  await replay.page.evaluate((log) => {
    const api = (window as Window & { __RIPTOP_QA__: QaApi }).__RIPTOP_QA__;
    api.startBattleReplay(log);
    api.forceResult('player');
  }, golden.log!);
  await replay.page.waitForFunction(() => (
    (window as Window & { __RIPTOP_QA__: QaApi }).__RIPTOP_QA__.getBattleOutcomeSummary() !== null
  ), undefined, { timeout: 30_000 });
  const replayedSummary = await replay.page.evaluate(() => (
    (window as Window & { __RIPTOP_QA__: QaApi }).__RIPTOP_QA__.getBattleOutcomeSummary()
  ));

  expect(replayedSummary).toBe(golden.summary);
  expect(replay.pageErrors).toEqual([]);

  await replay.context.close();
});

test('changes the outcome record when the seed changes', async ({ browser }) => {
  test.setTimeout(90_000);
  const first = await openScheduledPage(browser);
  const second = await openScheduledPage(browser);

  const summaries = await Promise.all([
    { page: first.page, seed: SEED },
    { page: second.page, seed: OTHER_SEED },
  ].map(({ page, seed }) => page.evaluate((battleSeed) => {
    const api = (window as Window & { __RIPTOP_QA__: QaApi }).__RIPTOP_QA__;
    api.startBattleWithSeed(battleSeed);
    api.quickLaunch();
    api.forceResult('player');
    return api.getBattleOutcomeSummary();
  }, seed)));

  expect(summaries[0]).not.toBe(summaries[1]);
  expect(JSON.parse(summaries[0]!).seed).toBe(SEED);
  expect(JSON.parse(summaries[1]!).seed).toBe(OTHER_SEED);
  expect(first.pageErrors).toEqual([]);
  expect(second.pageErrors).toEqual([]);

  await first.context.close();
  await second.context.close();
});
