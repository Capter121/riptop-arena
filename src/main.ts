import './style.css';
import { Game } from './app/game';

const mount = document.querySelector<HTMLDivElement>('#app');

if (!mount) {
  throw new Error('App mount not found');
}

const game = new Game(mount);
game.start();
