import { el, hexCss } from '../dom.js';
import { ARENAS, ARENAS_BY_ID } from '../../data/arenas.js';
import { buildArena } from '../../render/Arena3D.js';
import { computeEffectiveStats, STAT_LABELS } from '../../sim/stats.js';
import { SETS } from '../../data/sets.js';
import { FACTION_VIS, factionForBuild } from '../../render/factions.js';

const PHYS = [
  { key: 'fric', label: '摩擦', max: 1.5 },
  { key: 'pull', label: '向心', max: 1.0 },
  { key: 'crate', label: '碰撞', max: 1.5 },
  { key: 'ringout', label: '擊飛', max: 1.8 },
];

const STYLE_NAME = { spd: '速度流', wgt: '重量流', trj: '軌跡流', atk: '攻擊流', def: '防禦流', bst: '爆發流' };

export function mount(root, ctx) {
  const game = ctx.game;
  const stage = ctx.stage;
  stage.clearContent();
  stage.root.rotation.set(0, 0, 0);

  let arenaObj = null;
  function showArena(id) {
    if (arenaObj) {
      stage.root.remove(arenaObj.group);
      arenaObj.dispose();
    }
    arenaObj = buildArena(ARENAS_BY_ID[id]);
    stage.root.add(arenaObj.group);
    stage.camera.position.set(0, arenaObj.radius * 1.35 + 2, arenaObj.radius * 1.7);
    stage.camera.lookAt(0, -0.5, 0);
  }
  stage.setOnFrame((dt) => {
    stage.root.rotation.y += dt * 0.12;
  });

  // opponent analysis
  const oppEff = computeEffectiveStats(game.opponent.ids);
  const oppFaction = factionForBuild(game.opponent.ids);
  const oppVis = FACTION_VIS[oppFaction];
  const oppStyle = STYLE_NAME[oppEff.dominant] || '平衡流';

  // recommend an arena to counter the opponent's dominant counter stat
  const recommend = { spd: 'abyss', trj: 'standard', wgt: 'tempest' }[oppEff.dominant] || 'standard';

  let selected = game.arenaId || 'standard';

  const cardsWrap = el('div', { class: 'arena-cards' });
  const goBtn = el('button', { class: 'btn btn-primary btn-lg', text: '前往發射 →', on: { click: commit } });

  function renderCards() {
    cardsWrap.innerHTML = '';
    for (const a of ARENAS) {
      const on = a.id === selected;
      const rec = a.id === recommend;
      const card = el('div', {
        class: `arena-card ${on ? 'arena-on' : ''}`,
        style: on ? { borderColor: hexCss(a.visual.accent), boxShadow: `0 0 20px ${hexCss(a.visual.accent)}55` } : {},
        on: { click: () => { selected = a.id; game.arenaId = a.id; showArena(a.id); renderCards(); } },
      }, [
        rec ? el('div', { class: 'arena-rec', text: '★ 推薦剋制' }) : null,
        el('div', { class: 'arena-name', text: a.name }),
        el('div', { class: 'arena-meta', text: `${a.material}・${a.size}型・${a.shape}` }),
        el('div', { class: 'phys-grid' }, PHYS.map((p) =>
          el('div', { class: 'phys-row' }, [
            el('span', { class: 'phys-label', text: p.label }),
            el('span', { class: 'phys-bar' }, [
              el('span', { class: 'phys-fill', style: { width: `${Math.min(100, (a[p.key] / p.max) * 100)}%`, background: hexCss(a.visual.accent) } }),
            ]),
            el('span', { class: 'phys-val', text: a[p.key].toFixed(2) }),
          ])
        )),
        el('div', { class: 'arena-favor', text: `利於：${a.favors}` }),
      ]);
      cardsWrap.appendChild(card);
    }
  }

  function commit() {
    ctx.go('launch');
  }

  const panel = el('div', { class: 'screen arena-screen' }, [
    el('div', { class: 'arena-top panel' }, [
      el('div', { class: 'panel-kicker', text: 'STEP 2 — 選賽場' }),
      el('div', { class: 'opp-reveal' }, [
        el('span', { class: 'opp-dot', style: { background: hexCss(oppVis.bladeColor), boxShadow: `0 0 14px ${hexCss(oppVis.glow)}` } }),
        el('div', {}, [
          el('div', { class: 'opp-name', text: `對手：${game.opponent.name}` }),
          el('div', { class: 'opp-style', text: `${SETS[oppFaction].name}系 · ${oppStyle} · 主導「${STAT_LABELS[oppEff.dominant]}」` }),
        ]),
      ]),
      el('p', { class: 'arena-hint', text: '挑一個能剋制對手流派的賽場。深盆逼消耗、闊台利速軌、標準通用。' }),
    ]),
    el('div', { class: 'arena-bottom' }, [cardsWrap, el('div', { class: 'arena-go' }, [goBtn])]),
  ]);
  root.appendChild(panel);

  showArena(selected);
  renderCards();

  return {
    // Leave the arena bowl in the scene as a rotating backdrop for the Launch
    // and Intro screens; Battle3D's clearContent disposes it when the fight starts.
    unmount() {},
  };
}
