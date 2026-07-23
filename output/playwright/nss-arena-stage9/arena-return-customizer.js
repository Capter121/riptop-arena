async (page) => {
  const returnGarage = page.getByRole('button', { name: '返回改装库' });
  await returnGarage.waitFor({ state: 'visible', timeout: 70000 });
  await returnGarage.click();
  const returnCustomizer = page.getByRole('link', { name: 'Return to Customizer' });
  await returnCustomizer.waitFor({ state: 'visible', timeout: 30000 });
  const garageText = await page.locator('.garage-nss').innerText();
  const href = await returnCustomizer.getAttribute('href');
  await page.screenshot({ path: 'arena-garage-mobile.png', type: 'png' });
  await returnCustomizer.click();
  await page.waitForURL(/\/customizer\//);
  return { garageText, href, finalUrl: page.url() };
}
