// 16 components: 4 slots x 4 parts. Values are exactly PRD ch.6.2.
// stat keys: atk 攻 / def 防 / spd 速 / wgt 重 / bst 爆 / trj 軌
// Each part sums to ~38 points; a 4-part top lands near the 150 budget.

export const SLOTS = [
  { id: 'A', name: '攻擊環', en: 'Attack Ring', role: '輸出來源' },
  { id: 'B', name: '軸承', en: 'Driver', role: '走位 / 接戰節奏' },
  { id: 'C', name: '重量盤', en: 'Weight Disc', role: '續航 / 坦度' },
  { id: 'D', name: '核心晶片', en: 'Core Chip', role: '混合 / wildcard' },
];

export const SETS_ORDER = ['inferno', 'bedrock', 'gale', 'chaos'];

export const COMPONENTS = [
  // A — 攻擊環 Attack Ring
  { id: 'ring_inferno', slot: 'A', name: '烈焰之刃', set: 'inferno', stats: { atk: 19, def: 2, spd: 2, wgt: 2, bst: 12, trj: 1 } },
  { id: 'ring_bedrock', slot: 'A', name: '鐵壁刃環', set: 'bedrock', stats: { atk: 12, def: 10, spd: 2, wgt: 7, bst: 5, trj: 2 } },
  { id: 'ring_gale', slot: 'A', name: '疾風刃', set: 'gale', stats: { atk: 16, def: 4, spd: 5, wgt: 3, bst: 7, trj: 6 } },
  { id: 'ring_chaos', slot: 'A', name: '混沌爆環', set: 'chaos', stats: { atk: 14, def: 4, spd: 3, wgt: 2, bst: 13, trj: 2 } },

  // B — 軸承 Driver
  { id: 'driver_inferno', slot: 'B', name: '烈焰衝軸', set: 'inferno', stats: { atk: 6, def: 4, spd: 14, wgt: 3, bst: 4, trj: 7 } },
  { id: 'driver_bedrock', slot: 'B', name: '磐石定軸', set: 'bedrock', stats: { atk: 2, def: 13, spd: 8, wgt: 6, bst: 1, trj: 8 } },
  { id: 'driver_gale', slot: 'B', name: '疾風飛軸', set: 'gale', stats: { atk: 5, def: 5, spd: 13, wgt: 3, bst: 2, trj: 12 } },
  { id: 'driver_chaos', slot: 'B', name: '亂舞軸', set: 'chaos', stats: { atk: 4, def: 4, spd: 12, wgt: 3, bst: 6, trj: 9 } },

  // C — 重量盤 Weight Disc
  { id: 'disc_inferno', slot: 'C', name: '重擊盤', set: 'inferno', stats: { atk: 6, def: 8, spd: 2, wgt: 17, bst: 3, trj: 2 } },
  { id: 'disc_bedrock', slot: 'C', name: '磐石巨盤', set: 'bedrock', stats: { atk: 1, def: 12, spd: 1, wgt: 23, bst: 0, trj: 1 } },
  { id: 'disc_gale', slot: 'C', name: '輕量盤', set: 'gale', stats: { atk: 4, def: 9, spd: 4, wgt: 15, bst: 2, trj: 6 } },
  { id: 'disc_chaos', slot: 'C', name: '失衡盤', set: 'chaos', stats: { atk: 5, def: 8, spd: 2, wgt: 16, bst: 5, trj: 2 } },

  // D — 核心晶片 Core Chip
  { id: 'core_inferno', slot: 'D', name: '烈焰核心', set: 'inferno', stats: { atk: 8, def: 2, spd: 11, wgt: 2, bst: 12, trj: 3 } },
  { id: 'core_bedrock', slot: 'D', name: '穩定核心', set: 'bedrock', stats: { atk: 3, def: 9, spd: 11, wgt: 6, bst: 4, trj: 5 } },
  { id: 'core_gale', slot: 'D', name: '疾風核心', set: 'gale', stats: { atk: 6, def: 4, spd: 13, wgt: 4, bst: 4, trj: 8 } },
  { id: 'core_chaos', slot: 'D', name: '混沌核心', set: 'chaos', stats: { atk: 5, def: 4, spd: 12, wgt: 3, bst: 10, trj: 4 } },
];

export const COMPONENTS_BY_ID = Object.fromEntries(COMPONENTS.map((c) => [c.id, c]));

export function componentsForSlot(slotId) {
  return COMPONENTS.filter((c) => c.slot === slotId);
}

// Default opening build — a red inferno top (sets the main red-black tone).
export const DEFAULT_BUILD = ['ring_inferno', 'driver_inferno', 'disc_inferno', 'core_inferno'];

// A sane starter build the "平衡預設" button applies: balanced (one of each set).
export const BALANCED_PRESET = ['ring_bedrock', 'driver_chaos', 'disc_gale', 'core_bedrock'];
