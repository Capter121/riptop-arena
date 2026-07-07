import { el } from '../dom.js';
import { audio } from '../../audio/AudioManager.js';

// Shown when arriving via a friend-battle link: a short "VS <inviter>" hype
// cut-in, then a prompt to build your own top before the duel.
export function mount(root, ctx) {
  const name = ctx.game.friendBattle?.inviterName || '你的好友';

  audio.challenge();
  setTimeout(() => audio.cheer(), 150);

  const prompt = el('div', { class: 'challenge-prompt' }, [
    el('p', { class: 'challenge-prompt-text', html: `組建你的陀螺，迎戰 <b>${name}</b>！` }),
    el('button', { class: 'btn btn-primary btn-lg', text: '前往組裝 ⚙', on: { click: () => ctx.go('garage') } }),
  ]);

  const overlay = el('div', { class: 'screen challenge-screen' }, [
    el('div', { class: 'challenge-cut' }, [
      el('div', { class: 'challenge-eyebrow', text: '⚔ 好友對戰 · 收到挑戰' }),
      el('div', { class: 'challenge-vs', text: 'VS' }),
      el('div', { class: 'challenge-name', text: name }),
      el('div', { class: 'challenge-sub', text: '向你發起決鬥！' }),
    ]),
    prompt,
  ]);
  root.appendChild(overlay);

  const t = setTimeout(() => prompt.classList.add('show'), 1900);
  return {
    unmount() {
      clearTimeout(t);
    },
  };
}
