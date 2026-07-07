import { el, hexCss } from '../dom.js';
import { STAT_LABELS } from '../../sim/stats.js';
import { FACTION_VIS, factionForBuild } from '../../render/factions.js';
import { sanitizeName, buildChallengeUrl } from '../friendlink.js';
import { audio } from '../../audio/AudioManager.js';

const WIN_LABEL = { spinout: '擊停 KO', ringout: '彈飛 KO', burst: '解體 KO', decision: '判定勝' };

// Contextual headline based on the WINNER's remaining stamina.
function bannerText(playerWon, pct) {
  if (playerWon) return pct >= 0.5 ? '秒殺對手' : pct >= 0.2 ? '輕鬆取勝' : '奇蹟生還';
  return pct >= 0.5 ? '不堪一擊' : pct >= 0.2 ? '一敗塗地' : '遺憾落敗';
}

export function mount(root, ctx) {
  const game = ctx.game;
  const r = game.result;
  const playerWon = r.winnerIdx === 0;
  const winnerPct = r.tops[r.winnerIdx].staminaPct;
  const pColor = FACTION_VIS[factionForBuild(game.playerBuild)].bladeColor;
  const oColor = FACTION_VIS[factionForBuild(game.opponent.ids)].bladeColor;

  const statRow = (label, pv, ov) =>
    el('div', { class: 'res-stat-row' }, [
      el('span', { class: 'res-pv', text: pv }),
      el('span', { class: 'res-label', text: label }),
      el('span', { class: 'res-ov', text: ov }),
    ]);

  const p = r.tops[0];
  const o = r.tops[1];

  const panel = el('div', { class: 'screen result-screen' }, [
    el('div', { class: 'result-card panel scrollable' }, [
      el('div', {
        class: `result-banner ${playerWon ? 'res-win' : 'res-lose'}`,
        text: bannerText(playerWon, winnerPct),
      }),
      el('div', { class: 'result-vs', html: `VS <b style="color:${hexCss(oColor)}">${game.opponent.name}</b>` }),
      el('div', { class: 'result-sub' }, [
        el('span', { class: 'result-winby', text: `${WIN_LABEL[r.winType]}　+${r.score} 分` }),
        el('span', { class: 'muted', text: `用時 ${r.duration.toFixed(1)}s` }),
      ]),

      el('div', { class: 'result-names' }, [
        el('span', { style: { color: hexCss(pColor) }, text: game.playerName }),
        el('span', { class: 'muted', text: 'VS' }),
        el('span', { style: { color: hexCss(oColor) }, text: game.opponent.name }),
      ]),

      el('div', { class: 'result-stats' }, [
        statRow('總傷害', p.dmgDealt, o.dmgDealt),
        statRow('最大單擊', p.maxHit, o.maxHit),
        statRow('爆擊次數', p.crits, o.crits),
        statRow('迴避次數', p.dodges, o.dodges),
        statRow('剩餘續航', `${Math.round(p.staminaPct * 100)}%`, `${Math.round(o.staminaPct * 100)}%`),
      ]),

      el('div', { class: 'result-mvp' }, ['勝方 MVP 屬性：', el('b', { text: STAT_LABELS[r.mvpStat] })]),

      el('div', { class: 'result-score' }, [
        el('span', { text: '系列比分　' }),
        el('b', { style: { color: hexCss(pColor) }, text: game.score.player }),
        el('span', { text: ' : ' }),
        el('b', { style: { color: hexCss(oColor) }, text: game.score.ai }),
      ]),

      el('div', { class: 'result-actions' }, [
        el('button', { class: 'btn btn-friend', text: '好友對戰 🔗', on: { click: openShare } }),
        el('button', { class: 'btn btn-primary', text: '再戰 ⚔', on: { click: () => leave('arena') } }),
        el('button', { class: 'btn btn-ghost', text: '↻ 回組裝', on: { click: () => leave('garage') } }),
      ]),
    ]),
  ]);
  root.appendChild(panel);

  // ---- friend-battle share ----
  let shareOverlay = null;
  function openShare() {
    if (shareOverlay) return;
    let url = '';

    const nameInput = el('input', {
      class: 'share-input',
      attrs: { type: 'text', maxlength: '4', placeholder: '輸入你的名字（≤4 字）', autocomplete: 'off' },
    });
    nameInput.addEventListener('input', () => {
      const v = Array.from(nameInput.value).slice(0, 4).join('');
      if (v !== nameInput.value) nameInput.value = v;
    });

    const linkBox = el('input', { class: 'share-link', attrs: { type: 'text', readonly: 'readonly' } });
    const status = el('p', { class: 'share-status' });
    const copyBtn = el('button', { class: 'btn btn-primary', text: '複製連結', on: { click: copyLink } });
    const linkWrap = el('div', { class: 'share-link-wrap', style: { display: 'none' } }, [linkBox, copyBtn]);

    function copyLink() {
      if (!url) return;
      const done = () => {
        status.textContent = '✅ 已複製！把連結傳給好友，邀請他來決鬥！';
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(fallback);
      } else fallback();
      function fallback() {
        linkBox.focus();
        linkBox.select();
        status.textContent = '請長按 / 選取上方連結手動複製，傳給好友決鬥！';
      }
    }

    function generate() {
      const nm = sanitizeName(nameInput.value) || '你的好友';
      url = buildChallengeUrl(game.playerBuild, nm);
      linkBox.value = url;
      linkWrap.style.display = 'flex';
      audio.ui('select');
      copyLink();
    }

    const close = () => {
      if (shareOverlay) shareOverlay.remove();
      shareOverlay = null;
    };

    shareOverlay = el('div', { class: 'share-overlay', on: { click: (e) => { if (e.target === shareOverlay) close(); } } }, [
      el('div', { class: 'share-card panel' }, [
        el('h2', { text: '好友對戰 🔗' }),
        el('p', { class: 'muted', text: '用你目前的這顆陀螺向好友下戰書。輸入你的名字，產生連結傳給他！' }),
        nameInput,
        el('button', { class: 'btn btn-primary btn-lg', text: '產生對戰連結', on: { click: generate } }),
        linkWrap,
        status,
        el('button', { class: 'btn btn-ghost', text: '關閉', on: { click: close } }),
      ]),
    ]);
    root.appendChild(shareOverlay);
    setTimeout(() => nameInput.focus(), 50);
  }

  function leave(dest) {
    if (shareOverlay) shareOverlay.remove();
    if (ctx.battle) {
      ctx.battle.dispose();
      ctx.battle = null;
    }
    ctx.stage.setOnFrame(() => {});
    ctx.stage.clearContent();
    ctx.go(dest);
  }

  return {
    unmount() {
      if (shareOverlay) shareOverlay.remove();
    },
  };
}
