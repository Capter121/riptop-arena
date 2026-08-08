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
  const { Game } = await import('./app/game');
  const game = new Game(mount);
  game.start();
} else {
  const { startPortal } = await import('./ui/portal');
  await startPortal(mount);
}
