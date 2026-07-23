async (page) => {
  await page.getByRole('link', { name: /定制陀螺/ }).click();
  await page.locator('canvas').waitFor({ state: 'visible' });
  const customizerCombo = await page.locator('code').filter({ hasText: 'nss-p2c-' }).textContent();
  await page.getByTestId('enter-arena').click();
  await page.waitForURL(/\/arena\//);
  await page.getByRole('heading', { name: '战斗陀螺 竞技场' }).waitFor({ state: 'visible' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'final-production-arena.png', type: 'png' });
  return { customizerCombo, arenaUrl: page.url(), canvasCount: await page.locator('canvas').count() };
}
