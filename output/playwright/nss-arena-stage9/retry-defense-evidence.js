async (page) => {
  await page.getByRole('button', { name: '再次挑战' }).click();
  const panel = page.locator('.turn-panel');
  const defense = page.getByRole('button', { name: /^防守/ });
  await defense.waitFor({ state: 'visible', timeout: 30000 });
  const before = await panel.locator('.turn-panel__state').textContent();
  await defense.click();
  await page.waitForFunction(() => document.querySelector('.turn-panel')?.dataset.resolving === 'true');
  return {
    before,
    after: await panel.locator('.turn-panel__state').textContent(),
    resolving: await panel.getAttribute('data-resolving'),
  };
}
