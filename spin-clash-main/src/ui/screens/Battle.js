import { el, hexCss } from '../dom.js';
import { computeEffectiveStats } from '../../sim/stats.js';
import { ARENAS_BY_ID } from '../../data/arenas.js';
import { BattleSim } from '../../sim/BattleSim.js';
import { Battle3D } from '../../render/Battle3D.js';
import { BattleLog } from '../BattleLog.js';
import { FACTION_VIS, factionForBuild, slotFactionsFor } from '../../render/factions.js';
import { BALANCE } from '../../data/balance.js';
import { audio } from '../../audio/AudioManager.js';

export function mount(root, ctx) {
  const game = ctx.game;

  // dispose any leftover battle from a previous run
  if (ctx.battle) {
    ctx.battle.dispose();
    ctx.battle = null;
  }

  const playerFaction = factionForBuild(game.playerBuild);
  const oppFaction = factionForBuild(game.opponent.ids);
  const pColor = FACTION_VIS[playerFaction].bladeColor;
  const oColor = FACTION_VIS[oppFaction].bladeColor;

  const tops = [
    {
      name: game.playerName,
      color: pColor,
      faction: playerFaction,
      effective: computeEffectiveStats(game.playerBuild),
      launch: game.launchResult,
    },
    {
      name: game.opponent.name,
      color: oColor,
      faction: oppFaction,
      effective: computeEffectiveStats(game.opponent.ids),
      launch: game.opponent.launchResult,
    },
  ];

  const arena = ARENAS_BY_ID[game.arenaId];
  const sim = new BattleSim({ tops, arena, seed: game.nextSeed() });

  // --- HUD ---
  const pFill = el('div', { class: 'sta-fill', style: { width: '100%', background: hexCss(pColor) } });
  const oFill = el('div', { class: 'sta-fill', style: { width: '100%', background: hexCss(oColor) } });
  const pPct = el('span', { class: 'sta-pct', text: '100%' });
  const oPct = el('span', { class: 'sta-pct', text: '100%' });
  const timeEl = el('div', { class: 'battle-time', text: '0.0s' });

  const hud = el('div', { class: 'battle-hud' }, [
    el('div', { class: 'sta-block sta-left' }, [
      el('div', { class: 'sta-name', style: { color: hexCss(pColor) }, text: game.playerName }),
      el('div', { class: 'sta-bar' }, [pFill, el('div', { class: 'sta-notch', attrs: { title: '斬殺線 20%' } })]),
      pPct,
    ]),
    el('div', { class: 'battle-center' }, [timeEl, el('div', { class: 'battle-arena-name', text: arena.name })]),
    el('div', { class: 'sta-block sta-right' }, [
      el('div', { class: 'sta-name', style: { color: hexCss(oColor) }, text: game.opponent.name }),
      el('div', { class: 'sta-bar' }, [oFill, el('div', { class: 'sta-notch sta-notch-r', attrs: { title: '斬殺線 20%' } })]),
      oPct,
    ]),
  ]);

  const logBox = el('div', { class: 'log-box' });
  const logPanel = el('div', { class: 'log-panel' }, [el('div', { class: 'log-title', text: '戰鬥 LOG' }), logBox]);
  const log = new BattleLog(logBox, [game.playerName, game.opponent.name], [pColor, oColor]);

  const speedBtns = [1, 2, 3].map((s) =>
    el('button', { class: `btn btn-sm ${game.battleSpeed === s ? 'btn-on' : ''}`, text: `${s}×`, on: { click: () => setSpeed(s) } })
  );
  const controls = el('div', { class: 'battle-controls' }, [
    el('span', { class: 'muted small', text: '速度' }),
    ...speedBtns,
    el('button', { class: 'btn btn-sm btn-ghost', text: '跳至結果 ⏭', on: { click: skip } }),
  ]);

  const panel = el('div', { class: 'screen battle-screen' }, [hud, logPanel, controls]);
  root.appendChild(panel);

  function setSpeed(s) {
    game.battleSpeed = s;
    if (battle3d) battle3d.setSpeed(s);
    speedBtns.forEach((b, i) => b.classList.toggle('btn-on', [1, 2, 3][i] === s));
  }

  // --- 3D ---
  let routed = false;
  function routeFinish(result) {
    if (routed) return;
    routed = true;
    game.result = result;
    if (result.winnerIdx === 0) game.score.player += result.score;
    else game.score.ai += result.score;
    if (result.winnerIdx === 0) audio.victory();
    else audio.defeat();
    setTimeout(() => ctx.go('result'), 200);
  }

  const battle3d = new Battle3D({
    stage: ctx.stage,
    sim,
    factions: [playerFaction, oppFaction],
    slotFactions: [slotFactionsFor(game.playerBuild), slotFactionsFor(game.opponent.ids)],
    labels: ['我方', game.friendBattle ? game.opponent.name : '對手'],
    arena,
    onState: (fracs, time) => {
      pFill.style.width = `${Math.max(0, fracs[0]) * 100}%`;
      oFill.style.width = `${Math.max(0, fracs[1]) * 100}%`;
      pPct.textContent = `${Math.round(Math.max(0, fracs[0]) * 100)}%`;
      oPct.textContent = `${Math.round(Math.max(0, fracs[1]) * 100)}%`;
      timeEl.textContent = `${time.toFixed(1)}s / ${BALANCE.MATCH_TIME_LIMIT}s`;
    },
    onEvent: (ev) => log.handle(ev),
    onFinish: (result) => routeFinish(result),
  });
  battle3d.setSpeed(game.battleSpeed);

  ctx.battle = {
    sim,
    battle3d,
    dispose() {
      battle3d.dispose();
    },
  };

  function skip() {
    if (!sim.finished) sim.runToEnd();
    // flush remaining events into the log
    for (const ev of sim.drainEvents()) log.handle(ev);
    routeFinish(sim.result);
  }

  // small dramatic beat before the tops engage
  setTimeout(() => battle3d.play(), 350);

  return {
    unmount() {
      // keep the 3D scene as a live backdrop for the result screen,
      // but stop touching now-detached HUD/log nodes
      battle3d.onState = () => {};
      battle3d.onEvent = () => {};
    },
  };
}
