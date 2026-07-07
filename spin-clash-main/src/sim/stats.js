// Effective-stats pipeline (PRD ch.10.1):
//   raw sum (4 parts) -> set % bonuses -> synergy -> effective stats.
// Launch buffs are NOT folded here; the sim applies them as timed windows.

import { COMPONENTS_BY_ID } from '../data/components.js';
import { SETS, activeSetTiers } from '../data/sets.js';
import { BALANCE, STAT_MAX } from '../data/balance.js';

export const STAT_KEYS = ['atk', 'def', 'spd', 'wgt', 'bst', 'trj'];
export const STAT_LABELS = { atk: '攻擊', def: '防禦', spd: '速度', wgt: '重量', bst: '爆發', trj: '軌跡' };

// Counter triangle: speed beats trajectory, trajectory beats weight, weight beats speed.
export const BEATS = { spd: 'trj', trj: 'wgt', wgt: 'spd' };

function zeroStats() {
  return { atk: 0, def: 0, spd: 0, wgt: 0, bst: 0, trj: 0 };
}

export function sumStats(componentIds) {
  const s = zeroStats();
  for (const id of componentIds) {
    const c = COMPONENTS_BY_ID[id];
    if (!c) continue;
    for (const k of STAT_KEYS) s[k] += c.stats[k];
  }
  return s;
}

// Apply 2-pc / 4-pc percentage bonuses from active sets.
export function applySetBonuses(stats, tiers) {
  const out = { ...stats };
  for (const [setId, tier] of Object.entries(tiers)) {
    const set = SETS[setId];
    if (!set) continue;
    const apply = (bonus) => {
      if (!bonus) return;
      for (const k of STAT_KEYS) {
        const pctKey = `${k}_pct`;
        if (bonus[pctKey]) out[k] *= 1 + bonus[pctKey];
      }
    };
    if (tier.two) apply(set.two);
    if (tier.four) apply(set.four);
  }
  return out;
}

// Synergy (PRD ch.5.3.2): threshold 26, coeff 0.12. Cycle trj->spd->wgt->trj.
// Evaluated on a single snapshot so additions don't cascade within one pass.
export function applySynergy(stats) {
  const T = BALANCE.SYNERGY_THRESHOLD;
  const K = BALANCE.SYNERGY_COEFF;
  const out = { ...stats };
  const fired = [];
  // trj -> spd
  if (stats.trj >= T && stats.spd >= T) {
    out.spd += stats.trj * K;
    fired.push({ from: 'trj', to: 'spd', amount: stats.trj * K });
  }
  // spd -> wgt
  if (stats.spd >= T && stats.wgt >= T) {
    out.wgt += stats.spd * K;
    fired.push({ from: 'spd', to: 'wgt', amount: stats.spd * K });
  }
  // wgt -> trj
  if (stats.wgt >= T && stats.trj >= T) {
    out.trj += stats.wgt * K;
    fired.push({ from: 'wgt', to: 'trj', amount: stats.wgt * K });
  }
  return { stats: out, fired };
}

// Normalised dominant counter stat (spd/wgt/trj) of a stats object.
export function dominantStat(stats) {
  const cand = {
    spd: stats.spd / STAT_MAX.spd,
    wgt: stats.wgt / STAT_MAX.wgt,
    trj: stats.trj / STAT_MAX.trj,
  };
  let best = 'spd';
  for (const k of ['wgt', 'trj']) if (cand[k] > cand[best]) best = k;
  return best;
}

// Multiplier when `mine` clashes with `opp` (both are dominant-stat strings).
export function counterMultiplier(mine, opp) {
  if (BEATS[mine] === opp) return BALANCE.COUNTER_WIN; // I counter them
  if (BEATS[opp] === mine) return BALANCE.COUNTER_LOSE; // they counter me
  return 1.0;
}

// Pull the active 4-pc combat mods + procs into one struct for the sim.
function collectMods(tiers) {
  const mods = {
    drainReduction: 0,
    dodgeCapBonus: 0,
    procs: { burn_followup: null, counter_reflect: null, cyclone: null, chaos_burst: null },
  };
  for (const [setId, tier] of Object.entries(tiers)) {
    if (!tier.four) continue;
    const four = SETS[setId].four;
    if (four.drain_reduction) mods.drainReduction = four.drain_reduction;
    if (four.dodge_cap_bonus) mods.dodgeCapBonus = four.dodge_cap_bonus;
    if (four.proc) mods.procs[four.proc] = four;
  }
  return mods;
}

// Full computation for a build (array of 4 component ids).
export function computeEffectiveStats(componentIds) {
  const raw = sumStats(componentIds);
  const tiers = activeSetTiers(componentIds.map((id) => COMPONENTS_BY_ID[id]));
  const afterSets = applySetBonuses(raw, tiers);
  const { stats, fired } = applySynergy(afterSets);
  return {
    raw,
    afterSets,
    stats,
    tiers,
    synergy: fired,
    mods: collectMods(tiers),
    dominant: dominantStat(stats),
    total: STAT_KEYS.reduce((a, k) => a + stats[k], 0),
  };
}

// Lightweight: just the effective six-stat block (for radar previews).
export function quickStats(componentIds) {
  return computeEffectiveStats(componentIds).stats;
}
