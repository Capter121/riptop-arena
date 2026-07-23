async (page) => {
  const retry = page.getByRole('button', { name: '再次挑战' });
  if (await retry.isVisible()) await retry.click();
  const defense = page.getByRole('button', { name: /^防守/ });
  await defense.waitFor({ state: 'visible', timeout: 30000 });
  await page.screenshot({ path: 'arena-mobile-active.png', type: 'png' });
  return page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    document: {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    },
    canvas: (() => {
      const element = document.querySelector('canvas');
      const box = element?.getBoundingClientRect();
      return element && box
        ? { displayWidth: box.width, displayHeight: box.height, width: element.width, height: element.height }
        : null;
    })(),
  }));
}
