import './style.css';

const mount = document.querySelector<HTMLDivElement>('#app');

if (!mount) {
  throw new Error('App mount not found');
}

const configuredMode = import.meta.env.VITE_APP_MODE;
const arenaMode = configuredMode === 'arena'
  || (!configuredMode && (window.location.pathname === '/arena' || window.location.pathname.startsWith('/arena/')));
document.documentElement.dataset.appMode = arenaMode ? 'arena' : 'portal';

if (arenaMode) {
  const challengeRequested = new URLSearchParams(window.location.search).has('challenge');
  if (challengeRequested) {
    const { bootstrapChallenge } = await import('./challenges/challengeBootstrap');
    const result = await bootstrapChallenge(window.location.search);
    if (result.kind === 'ready') {
      const { Game } = await import('./app/game');
      const game = new Game(mount, result.options);
      game.start();
    } else {
      const messages = {
        invalid_link: ['挑战链接无效', '请从挑战中心重新打开这场挑战。'],
        missing_identity: ['需要先验证身份', '返回私人竞技据点，用邀请链接进入后再应战。'],
        forbidden: ['无法进入这场挑战', '这场挑战不属于当前浏览器身份，或你没有应战权限。'],
        completed: ['这场挑战已经完成', '每条挑战只记录一个最终结果，可前往挑战中心查看。'],
        unsupported: ['挑战版本不兼容', '请刷新到最新版本后重新打开挑战。'],
        offline: ['暂时无法读取挑战', '网络恢复后可使用同一链接重试。'],
      } as const;
      const [title, detail] = messages[result.kind];
      const state = document.createElement('main');
      state.className = 'portal-state challenge-arena-state';
      const eyebrow = document.createElement('p'); eyebrow.className = 'portal-eyebrow'; eyebrow.textContent = 'GHOST ARENA';
      const heading = document.createElement('h1'); heading.textContent = title;
      const body = document.createElement('p'); body.textContent = detail;
      const back = document.createElement('a'); back.className = 'challenge-primary'; back.href = result.kind === 'missing_identity' ? '/' : '/challenges/'; back.textContent = '返回挑战中心';
      state.append(eyebrow, heading, body, back); mount.replaceChildren(state);
    }
  } else {
    const { Game } = await import('./app/game');
    const game = new Game(mount);
    game.start();
  }
} else {
  const { startPortal } = await import('./ui/portal');
  await startPortal(mount);
}
