async (page) => {
  await page.getByRole('button', { name: '再次挑战' }).click();
  const defense = page.getByRole('button', { name: /^防守/ });
  await defense.waitFor({ state: 'visible', timeout: 30000 });
  await defense.click();
}
