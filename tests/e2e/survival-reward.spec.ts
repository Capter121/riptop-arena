import { expect, test } from '@playwright/test';

test('keeps frozen survival reward cards in the pointer hit-test chain', async ({ page }) => {
  await page.goto('/arena/?qa=1');
  await page.waitForFunction(() => Boolean((window as typeof window & { __RIPTOP_QA__?: unknown }).__RIPTOP_QA__));
  const result = await page.evaluate(() => {
    (window as typeof window & {
      __RIPTOP_QA__: { previewSurvivalUi(kind: 'rewards'): void };
    }).__RIPTOP_QA__.previewSurvivalUi('rewards');
    const reward = document.querySelector<HTMLButtonElement>('.survival-reward__choice')!;
    const box = reward.getBoundingClientRect();
    return {
      label: reward.getAttribute('aria-label'),
      pointerEvents: getComputedStyle(reward).pointerEvents,
      hit: document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('.survival-reward__choice') === reward,
    };
  });

  expect(result).toEqual({
    label: '选择奖励：攻击校准 Lv.3',
    pointerEvents: 'auto',
    hit: true,
  });
});
