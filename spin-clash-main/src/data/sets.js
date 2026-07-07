// Set bonuses (PRD ch.7). 2-pc and 4-pc. 4-pc includes the 2-pc.
// pct bonuses are applied to summed stats BEFORE synergy (PRD ch.10.1).
// proc fields drive in-battle events handled by the sim.

export const SETS = {
  inferno: {
    id: 'inferno',
    name: '烈焰',
    en: 'Inferno',
    color: 0xff4d2e,
    glow: 0xff8a3d,
    blurb: '攻擊 / 爆發',
    two: { atk_pct: 0.12 },
    four: {
      bst_pct: 0.20,
      // On crit: 25% chance burn follow-up dealing 40% of ATK.
      proc: 'burn_followup',
      proc_chance: 0.25,
      proc_value: 0.40,
    },
    twoDesc: '攻擊 +12%',
    fourDesc: '爆發 +20%；爆擊時 25% 機率「灼燒追擊」+40% 攻擊傷害',
  },
  bedrock: {
    id: 'bedrock',
    name: '磐石',
    en: 'Bedrock',
    color: 0x3f8fd0,
    glow: 0x8fd0ff,
    blurb: '防禦 / 重量 / 反震',
    two: { def_pct: 0.12, wgt_pct: 0.08 },
    four: {
      // On being hit: 18% chance to reflect 30% of incoming damage.
      proc: 'counter_reflect',
      proc_chance: 0.18,
      proc_value: 0.30,
      drain_reduction: 0.12, // -12% stamina drain
    },
    twoDesc: '防禦 +12%、重量 +8%',
    fourDesc: '受擊 18% 機率「反震」反彈 30% 傷害；續航耗損 −12%',
  },
  gale: {
    id: 'gale',
    name: '疾風',
    en: 'Gale',
    color: 0x2fe6a8,
    glow: 0x9bffe0,
    blurb: '速度 / 軌跡 / 迴避',
    two: { spd_pct: 0.12, trj_pct: 0.10 },
    four: {
      dodge_cap_bonus: 0.12,
      // Each consecutive dodge: +9% atk, max 6 stacks, reset when hit.
      proc: 'cyclone',
      proc_value: 0.09,
      proc_max: 6,
    },
    twoDesc: '速度 +12%、軌跡 +10%',
    fourDesc: '迴避上限 +12%；連續迴避疊「氣旋」每層 +9% 攻擊（最多 6 層）',
  },
  chaos: {
    id: 'chaos',
    name: '混沌',
    en: 'Chaos',
    color: 0xb15cff,
    glow: 0xe0a3ff,
    blurb: '爆發 / 真傷',
    two: { bst_pct: 0.25 },
    four: {
      // Each collision: 8% chance to deal 6% of opponent CURRENT stamina as true damage.
      proc: 'chaos_burst',
      proc_chance: 0.08,
      proc_value: 0.06,
    },
    twoDesc: '爆發 +25%',
    fourDesc: '每次碰撞 8% 機率「混沌爆發」造成對手當前續航 6% 真傷（無視防禦）',
  },
};

export const SET_LIST = Object.values(SETS);

// Count set tags in a list of components -> { inferno: 2, gale: 2, ... }.
export function countSets(components) {
  const counts = {};
  for (const c of components) {
    if (!c) continue;
    counts[c.set] = (counts[c.set] || 0) + 1;
  }
  return counts;
}

// Which tiers are active per set: { inferno: { two: true, four: false }, ... }.
export function activeSetTiers(components) {
  const counts = countSets(components);
  const out = {};
  for (const [setId, n] of Object.entries(counts)) {
    out[setId] = { count: n, two: n >= 2, four: n >= 4 };
  }
  return out;
}
