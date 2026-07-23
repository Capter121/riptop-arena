async (page) => {
  await page.getByTestId('part-blade_iron_bastion').click();
  await page.getByTestId('enter-arena').click();
  await page.waitForURL(/\/arena\//);
  const url = page.url();
  await page.getByRole('button', { name: '真人联机' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('等待第二位玩家'));
  return { url, onlineButton: await page.getByRole('button', { name: /匹配中/ }).textContent() };
}
