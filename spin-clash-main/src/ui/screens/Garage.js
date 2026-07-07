import { el, hexCss } from '../dom.js';
import { SLOTS, componentsForSlot, COMPONENTS_BY_ID, BALANCED_PRESET } from '../../data/components.js';
import { SETS, activeSetTiers } from '../../data/sets.js';
import { STAT_KEYS, STAT_LABELS, computeEffectiveStats } from '../../sim/stats.js';
import { RadarChart } from '../RadarChart.js';
import { GaragePreview } from '../../render/GaragePreview.js';
import { FACTION_VIS, factionForBuild } from '../../render/factions.js';
import { pickAIBuild } from '../../ai/ai.js';
import { RNG } from '../../sim/rng.js';

export function mount(root, ctx) {
  const game = ctx.game;
  const preview = new GaragePreview(ctx.stage);

  // --- right control panel skeleton ---
  const slotsWrap = el('div', { class: 'slots' });
  const radarCanvas = el('canvas', { class: 'radar-canvas' });
  const statList = el('div', { class: 'stat-list' });
  const setsWrap = el('div', { class: 'sets-wrap' });
  const synWrap = el('div', { class: 'syn-wrap' });
  const totalEl = el('div', { class: 'stat-total' });
  const factionBadge = el('div', { class: 'faction-badge' });

  const radar = new RadarChart(radarCanvas);

  const panel = el('div', { class: 'screen garage-screen' }, [
    el('div', { class: 'garage-left' }, [factionBadge]),
    el('div', { class: 'garage-right panel scrollable' }, [
      el('div', { class: 'panel-head' }, [
        el('div', { class: 'panel-kicker', text: 'STEP 1' }),
        el('h2', { text: '組裝 GARAGE' }),
      ]),
      slotsWrap,
      el('div', { class: 'radar-block' }, [
        el('div', { class: 'radar-col' }, [radarCanvas]),
        el('div', { class: 'stat-col' }, [statList, totalEl]),
      ]),
      el('div', { class: 'section-label', text: '套裝效果' }),
      setsWrap,
      synWrap,
      el('div', { class: 'garage-actions' }, [
        el('button', { class: 'btn btn-ghost', text: '⟲ 平衡預設', on: { click: () => applyPreset() } }),
        el('button', { class: 'btn btn-primary btn-lg', text: '出戰 →', on: { click: () => goBattle() } }),
      ]),
    ]),
  ]);
  root.appendChild(panel);

  function applyPreset() {
    game.playerBuild = [...BALANCED_PRESET];
    refresh();
  }

  function setSlot(slotIndex, compId) {
    game.playerBuild[slotIndex] = compId;
    refresh();
  }

  function renderSlots() {
    slotsWrap.innerHTML = '';
    SLOTS.forEach((slot, i) => {
      const options = componentsForSlot(slot.id);
      const equipped = game.playerBuild[i];
      const chips = options.map((c) => {
        const set = SETS[c.set];
        const active = c.id === equipped;
        return el('button', {
          class: `chip ${active ? 'chip-on' : ''}`,
          style: active ? { borderColor: hexCss(set.color), boxShadow: `0 0 12px ${hexCss(set.glow)}66` } : {},
          on: { click: () => setSlot(i, c.id) },
        }, [
          el('span', { class: 'chip-dot', style: { background: hexCss(set.color) } }),
          el('span', { class: 'chip-name', text: c.name }),
        ]);
      });
      slotsWrap.appendChild(
        el('div', { class: 'slot-row' }, [
          el('div', { class: 'slot-label' }, [
            el('span', { class: 'slot-id', text: slot.id }),
            el('span', { class: 'slot-name', text: slot.name }),
          ]),
          el('div', { class: 'chip-row' }, chips),
        ])
      );
    });
  }

  function renderStats(eff) {
    statList.innerHTML = '';
    for (const k of STAT_KEYS) {
      const v = eff.stats[k];
      statList.appendChild(
        el('div', { class: 'stat-row' }, [
          el('span', { class: 'stat-name', text: STAT_LABELS[k] }),
          el('span', { class: 'stat-bar' }, [
            el('span', { class: 'stat-fill', style: { width: `${Math.min(100, (v / 50) * 100)}%` } }),
          ]),
          el('span', { class: 'stat-val', text: Math.round(v) }),
        ])
      );
    }
    totalEl.innerHTML = `六圍總和 <b>${Math.round(eff.total)}</b> <span class="muted">/ 預算 ~150</span>`;
  }

  function renderSets(eff) {
    setsWrap.innerHTML = '';
    const tiers = eff.tiers;
    let any = false;
    for (const setId of ['inferno', 'bedrock', 'gale', 'chaos']) {
      const t = tiers[setId];
      const set = SETS[setId];
      if (!t || t.count < 1) continue;
      const tier = t.four ? 4 : t.two ? 2 : 0;
      const cls = tier ? 'set-badge set-on' : 'set-badge';
      setsWrap.appendChild(
        el('div', { class: cls, style: tier ? { borderColor: hexCss(set.color) } : {} }, [
          el('div', { class: 'set-badge-head' }, [
            el('span', { class: 'set-dot', style: { background: hexCss(set.color) } }),
            el('span', { class: 'set-name', text: `${set.name} ${set.en}` }),
            el('span', { class: 'set-count', text: `${t.count}/4` }),
          ]),
          tier >= 2 ? el('div', { class: 'set-eff', text: `2件套：${set.twoDesc}` }) : null,
          tier >= 4 ? el('div', { class: 'set-eff set-eff-4', text: `4件套：${set.fourDesc}` }) : null,
        ])
      );
      if (tier) any = true;
    }
    if (!any && setsWrap.children.length === 0) {
      setsWrap.appendChild(el('div', { class: 'muted small', text: '湊 2 / 4 件同套裝觸發效果' }));
    }

    // synergy
    synWrap.innerHTML = '';
    if (eff.synergy.length) {
      const names = { atk: '攻', def: '防', spd: '速', wgt: '重', bst: '爆', trj: '軌' };
      synWrap.appendChild(el('div', { class: 'section-label', text: '相生加成（同陀螺）' }));
      for (const s of eff.synergy) {
        synWrap.appendChild(
          el('div', { class: 'syn-line', text: `${names[s.from]}生${names[s.to]}：${names[s.to]} +${s.amount.toFixed(1)}` })
        );
      }
    }
  }

  function refresh() {
    const eff = computeEffectiveStats(game.playerBuild);
    renderSlots();
    renderStats(eff);
    renderSets(eff);
    const setId = factionForBuild(game.playerBuild);
    const vis = FACTION_VIS[setId];
    radar.update(stableStats(eff), vis.bladeColor);
    factionBadge.innerHTML = '';
    factionBadge.appendChild(el('span', { class: 'fb-dot', style: { background: hexCss(vis.bladeColor) } }));
    factionBadge.appendChild(el('span', { text: `${SETS[setId].name}系 主導` }));
    preview.setBuild(game.playerBuild);
  }

  function stableStats(eff) {
    const o = {};
    for (const k of STAT_KEYS) o[k] = eff.stats[k];
    return o;
  }

  function goBattle() {
    if (game.friendBattle) {
      // friend-battle: face the inviter's shared top
      game.opponent = {
        name: game.friendBattle.inviterName,
        ids: [...game.friendBattle.inviterBuild],
        launchResult: null,
      };
    } else {
      const rng = new RNG(game.nextSeed());
      const ai = pickAIBuild(rng);
      game.opponent = { name: ai.name, ids: [...ai.ids], launchResult: null };
    }
    ctx.go('arena');
  }

  refresh();

  return {
    unmount() {
      preview.dispose();
    },
  };
}
