import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { observeFocusReadoutDuringSelection } from './helpers/focusReadout';

const sessionKey = 'nova-spin:phase3b:test-session:v1';
type FocusFamily = 'assist' | 'gear' | 'tip';
type ProductCombination = Record<'core' | 'blade' | FocusFamily, string>;
type ProductSnapshot = { combination: ProductCombination; combinationId: string };
const readoutText: Record<string, string> = {
  assist_heavy: 'Heavy Assist isolated · Blade transparency reduced',
  assist_guard: 'Guard Assist isolated · Blade transparency reduced',
  assist_air: 'Air Assist isolated · Blade transparency reduced',
  gear_low: 'Gear 4.0 mm · total height Δ 0.0 mm vs Low',
  gear_medium: 'Gear 5.0 mm · total height Δ 1.0 mm vs Low',
  gear_high: 'Gear 6.0 mm · total height Δ 2.0 mm vs Low',
  tip_flat_attack: 'Contact focus · Flat Attack Tip',
  tip_ball_defense: 'Contact focus · Ball Defense Tip',
  tip_needle_stamina: 'Contact focus · Needle Stamina Tip',
  tip_taper_balance: 'Contact focus · Taper Balance Tip',
};

function auditPage(page: Page) {
  const errors = { console: [] as string[], page: [] as string[], failed: [] as string[], external: [] as string[] };
  page.on('console', message => { if (message.type() === 'error') errors.console.push(message.text()); });
  page.on('pageerror', error => errors.page.push(error.message));
  page.on('requestfailed', request => errors.failed.push(request.url()));
  page.on('request', request => {
    const hostname = new URL(request.url()).hostname;
    if (!['127.0.0.1', 'localhost'].includes(hostname)) errors.external.push(request.url());
  });
  return errors;
}

async function waitReady(page: Page) {
  await expect(page.getByTestId('load-status')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
}

async function selectFocusedPart(page: Page, family: FocusFamily, partId: string, count: number, total: number) {
  await page.getByTestId(`tab-${family}`).click();
  const current = await page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot()) as ProductSnapshot;
  const expectedCombination = { ...current.combination, [family]: partId };
  await observeFocusReadoutDuringSelection({
    page,
    option: page.getByTestId(`part-${partId}`),
    readoutTestId: `${family === 'gear' ? 'gear-height' : family === 'tip' ? 'tip-contact' : 'assist-focus'}-readout`,
    expectedText: readoutText[partId],
    readyPredicate: () => waitReady(page),
    taskProgress: page.getByTestId('test-viewed-progress'),
    expectedTaskProgress: `${count}/${total}`,
    combinationId: page.getByTestId('combination-id'),
    expectedCombination,
    productSnapshot: () => page.evaluate(() => (window as any).__NSS_CUSTOMIZER__.snapshot()),
  });
}

test('normal mode remains isolated and does not load the test panel chunk', async ({ page }) => {
  const errors = auditPage(page);
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/');
  await waitReady(page);
  await expect(page.getByTestId('test-mode-panel')).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), sessionKey)).toBeNull();
  expect(requests.some(url => url.includes('/src/usability/TestModePanel'))).toBe(false);
  expect(errors).toEqual({ console: [], page: [], failed: [], external: [] });
});

test('combo and test parameters coexist without leaking test mode into the share URL', async ({ page }) => {
  const errors = auditPage(page);
  await page.goto('/?combo=nss-p2c-0001&test=1');
  await waitReady(page);
  await expect(page.getByTestId('test-mode-panel')).toBeVisible();
  await expect(page.getByTestId('combination-id')).toHaveText('nss-p2c-0001');
  await page.getByTestId('share').click();
  await expect(page.getByTestId('share-link')).toHaveValue(/\?combo=nss-p2c-0001$/);
  await expect(page.getByTestId('share-link')).not.toHaveValue(/test=1/);
  expect(errors).toEqual({ console: [], page: [], failed: [], external: [] });
});

test('completes all six tasks from real product actions and exports a whitelisted result', async ({ page }) => {
  test.setTimeout(240000);
  const errors = auditPage(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => { (window as any).__COPIED_SHARE_LINK__ = text; } },
    });
  });
  await page.goto('/?test=1');
  await waitReady(page);

  await page.getByTestId('tab-blade').click();
  await page.getByTestId('part-blade_dual_comet').click();
  await waitReady(page);
  await expect(page.getByTestId('test-complete-task')).toBeEnabled();
  await page.getByTestId('test-complete-task').click();

  for (const [part, count] of [['assist_heavy', 1], ['assist_guard', 2], ['assist_air', 3]] as const) {
    await selectFocusedPart(page, 'assist', part, count, 3);
  }
  await page.locator('input[name="assist-feedback"][value="ALL_EASY"]').check();
  await expect(page.getByTestId('test-complete-task')).toBeEnabled();
  await page.getByTestId('test-complete-task').click();

  for (const [part, count] of [['gear_low', 1], ['gear_medium', 2], ['gear_high', 3]] as const) {
    await selectFocusedPart(page, 'gear', part, count, 3);
  }
  await expect(page.getByTestId('test-complete-task')).toBeEnabled();
  await page.getByTestId('test-complete-task').click();

  for (const [part, count] of [['tip_flat_attack', 1], ['tip_ball_defense', 2], ['tip_needle_stamina', 3], ['tip_taper_balance', 4]] as const) {
    await selectFocusedPart(page, 'tip', part, count, 4);
  }
  await expect(page.getByTestId('test-complete-task')).toBeEnabled();
  await page.getByTestId('test-complete-task').click();

  const favoriteId = (await page.getByTestId('combination-id').textContent())!;
  await page.getByTestId('library').click();
  await page.getByTestId('nickname-input').fill('Local test favorite');
  await page.getByTestId('save-nickname').click();
  await page.getByTestId('favorite-current').click();
  await page.getByTestId('tab-core').click();
  await page.getByTestId('part-core_void_falcon').click();
  await waitReady(page);
  await page.getByTestId(`favorite-${favoriteId}`).click();
  await waitReady(page);
  await expect(page.getByTestId('combination-id')).toHaveText(favoriteId);
  await expect(page.getByTestId('test-complete-task')).toBeEnabled();
  await page.getByTestId('test-complete-task').click();

  await page.getByTestId('share').click();
  await expect(page.getByRole('img', { name: 'QR code for the current combination link' })).toBeVisible();
  await page.getByTestId('copy-share-link').click();
  expect(await page.evaluate(() => (window as any).__COPIED_SHARE_LINK__)).toMatch(/\?combo=nss-p2c-/);
  const cardDownload = page.waitForEvent('download');
  await page.getByTestId('export-card').click();
  expect(await (await cardDownload).path()).toBeTruthy();
  await expect(page.getByTestId('test-complete-task')).toBeEnabled();
  await page.getByTestId('test-complete-task').click();
  await expect(page.getByTestId('test-session-status')).toContainText('COMPLETED');

  await page.getByTestId('test-export-preview-toggle').click();
  const preview = await page.getByTestId('test-export-preview').textContent();
  expect(preview).toContain('NSS-USABILITY-TEST-V1');
  expect(preview).toContain('Human visual review remains pending.');
  expect(preview).not.toMatch(/"(?:nickname|name|email|phone|address|ip|userAgent|geolocation|stack|notes)"\s*:/i);
  const resultDownload = page.waitForEvent('download');
  await page.getByTestId('test-export-download').click();
  const resultPath = await (await resultDownload).path();
  const exported = JSON.parse(await readFile(resultPath!, 'utf8'));
  expect(exported.status).toBe('COMPLETED');
  expect(exported.tasks).toHaveLength(6);
  expect(exported.governance.humanVisualReview).toBe('PENDING');
  expect(Object.keys(exported).sort()).toEqual(['completedAt', 'errors', 'finalCombinationId', 'governance', 'schemaVersion', 'selectedPartIds', 'sessionId', 'startedAt', 'status', 'tasks']);
  expect(errors).toEqual({ console: [], page: [], failed: [], external: [] });
});

test('persists an unfinished session, supports skip, collapse, clear, and explicit restart', async ({ page }) => {
  const errors = auditPage(page);
  await page.goto('/?test=1');
  await waitReady(page);
  await page.getByTestId('test-skip-task').click();
  await expect(page.getByTestId('test-task-assist-comparison')).toBeVisible();
  const beforeRefresh = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), sessionKey);
  await page.reload();
  await waitReady(page);
  await expect(page.getByTestId('test-task-assist-comparison')).toBeVisible();
  const afterRefresh = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), sessionKey);
  expect(afterRefresh.sessionId).toBe(beforeRefresh.sessionId);
  await page.getByTestId('test-panel-toggle').click();
  await expect(page.getByTestId('test-panel-toggle')).toHaveAttribute('aria-expanded', 'false');
  await page.getByTestId('test-panel-toggle').click();
  await page.getByTestId('test-clear-session').click();
  expect(await page.evaluate(key => localStorage.getItem(key), sessionKey)).toBeNull();
  await page.getByTestId('test-restart').click();
  await expect(page.getByTestId('test-task-attack-combination')).toBeVisible();
  expect(errors).toEqual({ console: [], page: [], failed: [], external: [] });
});
