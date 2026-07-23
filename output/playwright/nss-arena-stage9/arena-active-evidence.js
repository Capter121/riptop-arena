async (page) => {
  const retry = page.getByRole('button', { name: '再次挑战' });
  if (await retry.isVisible()) await retry.click();
  const panel = page.locator('.turn-panel');
  const defense = page.getByRole('button', { name: /^防守/ });
  await defense.waitFor({ state: 'visible', timeout: 30000 });
  await page.screenshot({ path: 'arena-active.png', type: 'png' });
  await defense.click();
  await page.waitForFunction(() => document.querySelector('.turn-panel')?.dataset.resolving === 'true');
  await page.screenshot({ path: 'arena-resolving.png', type: 'png' });
  const canvas = page.locator('canvas').first();
  return {
    canvasBox: await canvas.boundingBox(),
    drawingBuffer: await canvas.evaluate(element => ({ width: element.width, height: element.height })),
    state: await panel.locator('.turn-panel__state').textContent(),
  };
}
