async (page) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('http://127.0.0.1:4188/customizer/');
  await page.getByTestId('part-blade_iron_bastion').click();
  const customizerCombo = await page.locator('code').filter({ hasText: 'nss-p2c-' }).textContent();
  await page.getByTestId('enter-arena').click();
  await page.waitForURL(/\/arena\//);
  const handoffUrl = page.url();
  await page.getByRole('button', { name: '神级改装库' }).click();
  const garage = page.locator('.garage-nss');
  await garage.waitFor({ state: 'visible' });
  const garageText = await garage.innerText();
  await page.waitForTimeout(2200);
  await page.screenshot({ path: 'arena-garage-iron-bastion.png', type: 'png' });
  const returnCustomizer = page.getByRole('link', { name: 'Return to Customizer' });
  const returnHref = await returnCustomizer.getAttribute('href');
  await returnCustomizer.click();
  await page.waitForURL(/\/customizer\//);
  return { customizerCombo, handoffUrl, garageText, returnHref, finalUrl: page.url() };
}
