async (page) => {
  await page.getByRole('button', { name: '真人联机' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('对手已找到') || document.body.innerText.includes('联机对战进行中'), null, { timeout: 60000 });
  return { url: page.url(), body: await page.locator('body').innerText() };
}
