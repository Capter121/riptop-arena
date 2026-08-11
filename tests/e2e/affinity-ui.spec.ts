import { expect, test } from '@playwright/test';

const viewports = [
  { name: 'desktop', width: 1280, height: 800, isMobile: false, hasTouch: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true },
] as const;

for (const viewport of viewports) {
  test(`keeps affinity battle UI readable on ${viewport.name}`, async ({ browser }) => {
    test.setTimeout(150_000);
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.isMobile,
      hasTouch: viewport.hasTouch,
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto('/arena/?qa=1');
    await expect(page.locator('canvas[data-engine^="three.js"]')).toBeVisible({ timeout: 30_000 });
    await page.waitForFunction(() => typeof (window as Window & {
      __RIPTOP_QA__?: { startBattle?: () => void };
    }).__RIPTOP_QA__?.startBattle === 'function');
    await page.evaluate(() => {
      const qa = (window as Window & { __RIPTOP_QA__?: { startBattle?: () => void } }).__RIPTOP_QA__;
      qa?.startBattle?.();
    });
    await page.waitForFunction(() => (window as Window & {
      __THREE_GAME_DIAGNOSTICS__?: { phase?: string };
    }).__THREE_GAME_DIAGNOSTICS__?.phase === 'launch');
    const versus = page.locator('.affinity-versus');
    await expect(versus.locator('.affinity-badge')).toHaveCount(2);
    await expect(versus.locator('.affinity-versus__relation')).not.toBeEmpty();
    await versus.evaluate(element => {
      element.classList.remove('affinity-versus--hidden', 'affinity-versus--active');
      void (element as HTMLElement).offsetWidth;
      element.classList.add('affinity-versus--active');
      element.style.opacity = '1';
      element.style.visibility = 'visible';
    });
    await expect(versus).toBeVisible();
    expect(await versus.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
    })).toBe(true);
    await page.screenshot({ path: `output/playwright/affinity-stage5-${viewport.name}-versus.png` });
    await versus.evaluate(element => {
      element.classList.add('affinity-versus--hidden');
      element.classList.remove('affinity-versus--active');
      element.style.removeProperty('opacity');
      element.style.removeProperty('visibility');
    });

    await expect(versus).toBeHidden({ timeout: 5_000 });
    await expect(page.locator('.status__attributes .affinity-badge')).toHaveCount(2);
    await page.evaluate(() => {
      const qa = (window as Window & { __RIPTOP_QA__?: { forceResult?: (winner: 'player' | 'enemy') => void } }).__RIPTOP_QA__;
      qa?.forceResult?.('player');
    });

    const summary = page.locator('.results__affinity-summary');
    await expect(summary).toBeVisible();
    await expect(summary.locator('.results__affinity-item')).toHaveCount(4);
    expect(await summary.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.locator('.results').screenshot({ path: `output/playwright/affinity-stage5-${viewport.name}-result.png` });
    expect(await page.locator('.results').evaluate(element => {
      element.scrollTop = element.scrollHeight;
      const retry = element.querySelector('button');
      if (!retry) return false;
      const buttonRect = retry.getBoundingClientRect();
      const panelRect = element.getBoundingClientRect();
      return buttonRect.top >= panelRect.top && buttonRect.bottom <= panelRect.bottom;
    })).toBe(true);
    expect(pageErrors).toEqual([]);
    await context.close();
  });
}
