import { el } from '../dom.js';
import { GaragePreview } from '../../render/GaragePreview.js';

export function mount(root, ctx) {
  const preview = new GaragePreview(ctx.stage);
  preview.setBuild(ctx.game.playerBuild);

  let help = null;
  const toggleHelp = () => {
    if (help) {
      help.remove();
      help = null;
      return;
    }
    help = el('div', { class: 'help-overlay', on: { click: (e) => { if (e.target === help) toggleHelp(); } } }, [
      el('div', { class: 'help-card panel' }, [
        el('h2', { text: '玩法說明' }),
        el('ol', { class: 'help-list' }, [
          el('li', { html: '<b>組裝</b>：四個槽位各選一件零件，即時看六圍雷達圖與套裝效果變化。' }),
          el('li', { html: '<b>選賽場</b>：看對手流派，挑一個能剋制它的賽場（深盆逼消耗 / 闊台利速軌）。' }),
          el('li', { html: '<b>發射</b>：選技巧後玩拉鍊 timing 小遊戲，命中完美區拿開局增益。' }),
          el('li', { html: '<b>對戰</b>：看 3D 陀螺旋轉碰撞，右側即時戰鬥 LOG 解釋每一次傷害。' }),
          el('li', { html: '<b>相剋</b>：速→軌→重→速（剋者傷害 ×1.13）。<b>相生</b>：同陀螺成對堆高有加成。' }),
        ]),
        el('p', { class: 'help-credit', html: '音樂：Kevin MacLeod (incompetech.com) — 「Ryno&#39;s Theme」、「Crossing the Chasm」、「Volatile Reaction」，授權 CC BY 4.0' }),
        el('button', { class: 'btn btn-primary', text: '知道了', on: { click: toggleHelp } }),
      ]),
    ]);
    root.appendChild(help);
  };

  const panel = el('div', { class: 'screen menu-screen' }, [
    el('div', { class: 'menu-hero' }, [
      el('div', { class: 'menu-eyebrow', text: 'BROWSER 3D BEYBLADE ARENA' }),
      el('h1', { class: 'game-title', html: '爆旋<span class="accent">對決</span>' }),
      el('div', { class: 'game-sub', text: 'S P I N   C L A S H' }),
      el('p', { class: 'menu-tag', text: '組裝你的陀螺 · 選場剋制 · 拉鍊發射 · 3D 物理激戰' }),
      el('div', { class: 'menu-actions' }, [
        el('button', { class: 'btn btn-primary btn-lg', text: '開始遊戲 ▶', on: { click: () => ctx.go('garage') } }),
        el('button', { class: 'btn btn-ghost', text: '玩法說明', on: { click: toggleHelp } }),
      ]),
    ]),
  ]);
  root.appendChild(panel);

  return {
    unmount() {
      if (help) help.remove();
      preview.dispose();
    },
  };
}
