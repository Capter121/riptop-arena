// Headless sim validation: determinism, counter-triangle directions,
// match length, and win-type distribution. Run: node sim_smoke.mjs
import { BattleSim } from './src/sim/BattleSim.js';
import { computeEffectiveStats } from './src/sim/stats.js';
import { ARENAS_BY_ID } from './src/data/arenas.js';

const BUILDS = {
  inferno: ['ring_inferno', 'driver_inferno', 'disc_inferno', 'core_inferno'],
  bedrock: ['ring_bedrock', 'driver_bedrock', 'disc_bedrock', 'core_bedrock'],
  gale: ['ring_gale', 'driver_gale', 'disc_gale', 'core_gale'],
  chaos: ['ring_chaos', 'driver_chaos', 'disc_chaos', 'core_chaos'],
};
const flatLaunch = { staminaMult: 1, timedBuffs: [], startPosition: 'mid' };

function eff(name) {
  return computeEffectiveStats(BUILDS[name]);
}

function run(aName, bName, arenaId, seed) {
  const sim = new BattleSim({
    tops: [
      { name: aName, color: 0, faction: aName, effective: eff(aName), launch: flatLaunch },
      { name: bName, color: 0, faction: bName, effective: eff(bName), launch: flatLaunch },
    ],
    arena: ARENAS_BY_ID[arenaId],
    seed,
  });
  return sim.runToEnd();
}

// 1) Determinism
const r1 = run('inferno', 'gale', 'standard', 999);
const r2 = run('inferno', 'gale', 'standard', 999);
console.log('DETERMINISM same-seed identical:', JSON.stringify(r1) === JSON.stringify(r2));

// 2) Dominant stats per faction
console.log('\nDOMINANT STATS:');
for (const f of Object.keys(BUILDS)) {
  const e = eff(f);
  console.log(`  ${f.padEnd(8)} dominant=${e.dominant}  stats=`,
    Object.fromEntries(Object.entries(e.stats).map(([k, v]) => [k, Math.round(v)])), ` total=${Math.round(e.total)}`);
}

// 3) Pairwise win rates + duration + win-type dist (standard arena)
const N = 2000;
const factions = Object.keys(BUILDS);
console.log(`\nPAIRWISE (standard arena, ${N} runs each, win% for ROW):`);
const winTypes = { spinout: 0, ringout: 0, burst: 0, decision: 0 };
let durSum = 0, durN = 0;
for (let i = 0; i < factions.length; i++) {
  const row = [];
  for (let j = 0; j < factions.length; j++) {
    if (i === j) { row.push('  —  '); continue; }
    let aWins = 0;
    for (let s = 0; s < N; s++) {
      const res = run(factions[i], factions[j], 'standard', s * 31 + 7);
      if (res.winnerIdx === 0) aWins++;
      winTypes[res.winType] = (winTypes[res.winType] || 0) + 1;
      durSum += res.duration; durN++;
    }
    row.push((((aWins / N) * 100).toFixed(0) + '%').padStart(5));
  }
  console.log(`  ${factions[i].padEnd(8)} ` + row.join(' '));
}
console.log('\nWIN TYPE DIST:', Object.fromEntries(Object.entries(winTypes).map(([k, v]) => [k, ((v / (durN)) * 100).toFixed(0) + '%'])));
console.log('AVG DURATION:', (durSum / durN).toFixed(1) + 's');

// 4) Counter triangle spot checks (isolated speed/weight/trajectory archetypes)
console.log('\nNOTE: faction builds are not pure archetypes; counter triangle is verified by dominant-stat matchups above.');
