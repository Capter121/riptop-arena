async (page) => {
  await page.waitForTimeout(3000);
  return page.evaluate(() => ({
    phase: window.__THREE_GAME_DIAGNOSTICS__?.phase,
    renderer: window.__THREE_GAME_DIAGNOSTICS__?.renderer,
    player: window.__THREE_GAME_DIAGNOSTICS__?.player,
    enemy: window.__THREE_GAME_DIAGNOSTICS__?.enemyState,
  }));
}
