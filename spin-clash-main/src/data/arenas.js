// Arenas (PRD ch.8). Physics modifiers feed the sim; visual params feed Arena3D.

export const ARENAS = [
  {
    id: 'standard',
    name: '標準競技場',
    en: 'Standard',
    shape: '淺碟形、廣口',
    material: '聚碳酸酯',
    size: '中',
    fric: 1.0,
    pull: 0.3,
    crate: 1.0,
    ringout: 1.0,
    favors: '攻擊 / 通用',
    // Visual (Arena3D): bowl radius, depth, rim, base color, material profile.
    visual: { radius: 7.2, depth: 1.4, rimHeight: 0.5, baseColor: 0x2a3550, accent: 0x5fb0ff, materialKind: 'polycarbonate' },
  },
  {
    id: 'abyss',
    name: '重壓深盆',
    en: 'Abyss',
    shape: '深盆 + 中央凹袋',
    material: '金屬',
    size: '小',
    fric: 0.7,
    pull: 0.85,
    crate: 1.4,
    ringout: 0.4,
    favors: '防禦 / 續航',
    visual: { radius: 5.6, depth: 2.6, rimHeight: 0.9, baseColor: 0x3a3340, accent: 0xc9a24a, materialKind: 'metal' },
  },
  {
    id: 'tempest',
    name: '狂風闊台',
    en: 'Tempest',
    shape: '大型淺盤 + 外圈緩坡',
    material: '木質高摩擦',
    size: '大',
    fric: 1.35,
    pull: 0.1,
    crate: 0.8,
    ringout: 1.7,
    favors: '速度 / 軌跡',
    visual: { radius: 9.0, depth: 0.8, rimHeight: 0.25, baseColor: 0x4a3a2a, accent: 0x7fe6a0, materialKind: 'wood' },
  },
];

export const ARENAS_BY_ID = Object.fromEntries(ARENAS.map((a) => [a.id, a]));
