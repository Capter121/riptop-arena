import './style.css';
import { ThreeStage } from './render/ThreeStage.js';
import { game } from './ui/GameState.js';
import { audio } from './audio/AudioManager.js';
import { el } from './ui/dom.js';
import * as Menu from './ui/screens/Menu.js';
import * as Garage from './ui/screens/Garage.js';
import * as ArenaSelect from './ui/screens/ArenaSelect.js';
import * as Launch from './ui/screens/Launch.js';
import * as Intro2D from './ui/screens/Intro2D.js';
import * as Battle from './ui/screens/Battle.js';
import * as Result from './ui/screens/Result.js';
import * as ChallengeIntro from './ui/screens/ChallengeIntro.js';
import { decodeChallenge } from './ui/friendlink.js';

const sceneContainer = document.getElementById('scene-container');
const uiRoot = document.getElementById('ui-root');

const stage = new ThreeStage(sceneContainer);
stage.start();

const SCREENS = {
  menu: Menu,
  challenge: ChallengeIntro,
  garage: Garage,
  arena: ArenaSelect,
  launch: Launch,
  intro: Intro2D,
  battle: Battle,
  result: Result,
};

let current = null;
const ctx = { game, stage, battle: null, go };

// Per-screen BGM mood: tense pre-battle theme in the garage/arena, full combat
// from launch onward, anthem on menu/result.
const BGM_BY_SCREEN = {
  menu: 'menu',
  challenge: 'battle',
  garage: 'prebattle',
  arena: 'prebattle',
  launch: 'battle',
  intro: 'battle',
  battle: 'battle',
  result: 'menu',
};

function go(name) {
  if (!SCREENS[name]) {
    console.error('unknown screen', name);
    return;
  }
  if (current && current.unmount) current.unmount();
  uiRoot.innerHTML = '';
  current = SCREENS[name].mount(uiRoot, ctx);
  uiRoot.dataset.screen = name;
  audio.playBgm(BGM_BY_SCREEN[name] || 'menu');
}

// One-time hint: browsers block audio until a user gesture, so tell the player.
const audioHint = el('div', { class: 'audio-hint', text: '🔊 點擊畫面開啟音樂與音效' });
document.body.appendChild(audioHint);

// Resume audio on first gesture (autoplay policy) + click sounds on UI controls.
const UI_SEL = '.btn, .chip, .arena-card, .tech-card';
window.addEventListener(
  'pointerdown',
  (e) => {
    audio.resume();
    audioHint.remove();
    const t = e.target;
    if (t && t.closest && t.closest(UI_SEL)) audio.ui('click');
  },
  { capture: true }
);

// Persistent sound toggle (top-right).
const muteBtn = el('button', {
  class: 'sound-toggle',
  text: '🔊',
  attrs: { title: '音效開關' },
  on: {
    click: () => {
      const m = audio.toggleMute();
      muteBtn.textContent = m ? '🔇' : '🔊';
    },
  },
});
document.body.appendChild(muteBtn);

// If opened via a friend-battle link (?mode=battle), enter the challenge flow.
const challenge = decodeChallenge(location.search);
if (challenge) {
  game.friendBattle = challenge;
  history.replaceState({}, '', location.origin + location.pathname); // clean URL
  go('challenge');
} else {
  go('menu');
}

// expose for quick debugging in the console
window.__spinclash = { game, stage, go, ctx, audio };
