import { el, hexCss } from '../dom.js';
import { TECHNIQUES, TECHNIQUES_BY_ID, ZONE, zoneForPosition, buildLaunchResult } from '../../data/launch.js';
import { pickAILaunch } from '../../ai/ai.js';
import { RNG } from '../../sim/rng.js';
import { audio } from '../../audio/AudioManager.js';

export function mount(root, ctx) {
  const game = ctx.game;

  let techId = null;
  let stance = 'center';
  let phase = 'select'; // select -> charging -> done
  let pos = 0;
  let dir = 1;
  let raf = null;
  let lastT = null;
  let locked = false;

  const techRow = el('div', { class: 'tech-row' });
  const stanceRow = el('div', { class: 'stance-row' });
  const barWrap = el('div', { class: 'launch-bar-wrap' });
  const bar = el('div', { class: 'launch-bar' });
  const indicator = el('div', { class: 'launch-indicator' });
  const feedback = el('div', { class: 'launch-feedback' });
  const actionWrap = el('div', { class: 'launch-action' });

  function renderTech() {
    techRow.innerHTML = '';
    for (const t of TECHNIQUES) {
      const on = t.id === techId;
      techRow.appendChild(
        el('div', { class: `tech-card ${on ? 'tech-on' : ''}`, on: { click: () => selectTech(t.id) } }, [
          el('div', { class: 'tech-name', text: t.name }),
          el('div', { class: 'tech-risk', text: `風險：${t.risk}` }),
          el('div', { class: 'tech-blurb', text: t.blurb }),
          el('div', { class: 'tech-perfect', text: `完美：${t.perfectDesc}` }),
        ])
      );
    }
  }

  function renderStance() {
    stanceRow.innerHTML = '';
    const tech = techId && TECHNIQUES_BY_ID[techId];
    if (!tech || !tech.needsStance) return;
    stanceRow.appendChild(el('div', { class: 'section-label', text: '開局站位' }));
    const opts = [
      { id: 'center', label: '中央強攻', desc: '首 5 秒 攻擊 +10%' },
      { id: 'outer', label: '外圈防守', desc: '首 5 秒 防禦 +12%' },
    ];
    const wrap = el('div', { class: 'stance-opts' });
    for (const o of opts) {
      wrap.appendChild(
        el('button', { class: `chip ${stance === o.id ? 'chip-on' : ''}`, on: { click: () => { stance = o.id; renderStance(); } } }, [
          el('span', { class: 'chip-name', text: `${o.label}` }),
          el('span', { class: 'muted small', text: o.desc }),
        ])
      );
    }
    stanceRow.appendChild(wrap);
  }

  function buildZones() {
    bar.innerHTML = '';
    const tech = TECHNIQUES_BY_ID[techId];
    const half = tech.perfectWidth / 2;
    const goodHalf = half + tech.goodWidth / 2;
    const seg = (left, w, cls) => el('div', { class: `zone ${cls}`, style: { left: `${left * 100}%`, width: `${w * 100}%` } });
    bar.appendChild(seg(0, 0.5 - goodHalf, 'zone-slip'));
    bar.appendChild(seg(0.5 - goodHalf, tech.goodWidth / 2, 'zone-good'));
    bar.appendChild(seg(0.5 - half, tech.perfectWidth, 'zone-perfect'));
    bar.appendChild(seg(0.5 + half, tech.goodWidth / 2, 'zone-good'));
    bar.appendChild(seg(0.5 + goodHalf, 0.5 - goodHalf, 'zone-slip'));
    bar.appendChild(indicator);
  }

  function selectTech(id) {
    if (phase === 'charging') return;
    techId = id;
    renderTech();
    renderStance();
    buildZones();
    feedback.textContent = '';
    actionWrap.innerHTML = '';
    actionWrap.appendChild(
      el('button', { class: 'btn btn-primary btn-lg', text: '開始發射', on: { click: startCharge } })
    );
    barWrap.classList.add('ready');
  }

  function startCharge() {
    phase = 'charging';
    locked = false;
    pos = 0;
    dir = 1;
    lastT = null;
    audio.launchCharge();
    feedback.textContent = '按 空白鍵 或 點擊「放開！」鎖定';
    actionWrap.innerHTML = '';
    actionWrap.appendChild(el('button', { class: 'btn btn-power btn-lg', text: '放開！ (Space)', on: { click: lock } }));
    raf = requestAnimationFrame(loop);
  }

  function loop(ts) {
    if (locked) return;
    if (lastT == null) lastT = ts;
    const dt = Math.min(0.05, (ts - lastT) / 1000);
    lastT = ts;
    pos += dir * dt * 1.05;
    if (pos >= 1) { pos = 1; dir = -1; }
    if (pos <= 0) { pos = 0; dir = 1; }
    indicator.style.left = `${pos * 100}%`;
    raf = requestAnimationFrame(loop);
  }

  function lock() {
    if (phase !== 'charging' || locked) return;
    locked = true;
    if (raf) cancelAnimationFrame(raf);
    phase = 'done';
    const zoneId = zoneForPosition(pos, techId);
    const zone = ZONE[zoneId];
    const result = buildLaunchResult(techId, zoneId, stance);
    game.launchResult = result;
    audio.launchRelease(zoneId);

    // AI launches now too.
    const rng = new RNG(game.nextSeed());
    game.opponent.launchResult = pickAILaunch(game.opponent.ids, rng);

    indicator.style.background = hexCss(zone.color);
    feedback.innerHTML = `<span style="color:${hexCss(zone.color)}">${zone.name} ${zone.en}!</span> 初始續航 ×${result.staminaMult.toFixed(2)}`;
    flash(zone.color);
    actionWrap.innerHTML = '';
    actionWrap.appendChild(el('button', { class: 'btn btn-primary btn-lg', text: '進入對戰 ▶', on: { click: () => ctx.go('intro') } }));
    setTimeout(() => { if (phase === 'done') ctx.go('intro'); }, 1600);
  }

  function flash(colorHex) {
    const f = document.getElementById('fx-flash');
    if (!f) return;
    f.style.background = `radial-gradient(circle, ${hexCss(colorHex)}66, transparent 70%)`;
    f.style.opacity = '1';
    setTimeout(() => { f.style.opacity = '0'; }, 220);
  }

  const onKey = (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (phase === 'charging') lock();
      else if (phase === 'select' && techId) startCharge();
    }
  };
  window.addEventListener('keydown', onKey);

  bar.appendChild(indicator);
  barWrap.appendChild(bar);

  const panel = el('div', { class: 'screen launch-screen' }, [
    el('div', { class: 'launch-panel panel' }, [
      el('div', { class: 'panel-kicker', text: 'STEP 3 — 發射' }),
      el('h2', { text: '拉鍊發射' }),
      el('p', { class: 'muted', text: '先選技巧，再玩 timing 小遊戲。命中綠色完美區拿開局增益。' }),
      techRow,
      stanceRow,
      barWrap,
      feedback,
      actionWrap,
    ]),
  ]);
  root.appendChild(panel);

  renderTech();

  return {
    unmount() {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
    },
  };
}
