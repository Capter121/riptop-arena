async (page) => {
  await page.waitForFunction(() => document.body.innerText.includes('联机对战进行中'), null, { timeout: 60000 });
  await page.screenshot({ path: `online-${page.url().includes('combo=') ? 'nss' : 'legacy'}.png`, type: 'png' });
  const bodyText = await page.locator('body').innerText();
  return {
    url: page.url(),
    bodyHasOnlineBattle: bodyText.includes('联机对战进行中'),
    canvas: await page.locator('canvas').first().evaluate(element => ({ width: element.width, height: element.height })),
  };
}
