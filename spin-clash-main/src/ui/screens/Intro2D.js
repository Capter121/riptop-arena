import { el, hexCss } from '../dom.js';
import { activeSetTiers, SETS } from '../../data/sets.js';
import { COMPONENTS_BY_ID } from '../../data/components.js';
import { FACTION_VIS, factionForBuild } from '../../render/factions.js';

const ULTIMATE = { inferno: '灼焰殲滅', bedrock: '不動金剛', gale: '疾風氣旋', chaos: '混沌奇點' };

function sideData(name, ids) {
  const faction = factionForBuild(ids);
  const tiers = activeSetTiers(ids.map((id) => COMPONENTS_BY_ID[id]));
  return {
    name,
    faction,
    vis: FACTION_VIS[faction],
    set: SETS[faction],
    ult: tiers[faction]?.four ? ULTIMATE[faction] : null,
  };
}

export function mount(root, ctx) {
  const game = ctx.game;
  const player = sideData(game.playerName, game.playerBuild);
  const opp = sideData(game.opponent.name, game.opponent.ids);

  const card = (d, side) =>
    el('div', { class: `intro-card intro-${side}`, style: { '--c': hexCss(d.vis.bladeColor), '--g': hexCss(d.vis.glow) } }, [
      el('div', { class: 'intro-faction', text: `${d.set.name}系` }),
      el('div', { class: 'intro-topname', text: d.name }),
      d.ult ? el('div', { class: 'intro-ult', text: `必殺 · ${d.ult}` }) : null,
    ]);

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    ctx.go('battle');
  };

  const overlay = el('div', { class: 'screen intro-screen', on: { click: finish } }, [
    card(player, 'left'),
    el('div', { class: 'intro-vs' }, [el('span', { text: 'VS' })]),
    card(opp, 'right'),
    el('div', { class: 'intro-skip', text: '點擊任意處跳過' }),
  ]);
  root.appendChild(overlay);

  const timer = setTimeout(finish, 2800);

  return {
    unmount() {
      clearTimeout(timer);
    },
  };
}
