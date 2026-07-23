async (page) => {
  await page.goto('http://127.0.0.1:4188/arena/?qa=1&combo=nss-p2c-0066&loadoutVersion=1');
  await page.waitForTimeout(2000);
  return {
    url: page.url(),
    canvasCount: await page.locator('canvas').count(),
    bodyText: (await page.locator('body').innerText()).slice(0, 1000),
    diagnostics: await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__ ?? null),
  };
}
