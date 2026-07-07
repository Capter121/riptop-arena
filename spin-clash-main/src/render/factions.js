// Visual identity per set — drives geometry variant + materials of a top.
// Colours align with the UI palette (inferno red / bedrock steel-blue /
// gale teal / chaos violet) while blade counts & silhouettes stay distinct.

import { countSets } from '../data/sets.js';
import { COMPONENTS_BY_ID } from '../data/components.js';

export const FACTION_VIS = {
  inferno: {
    blades: 3,
    style: 'swept',
    bodyColor: 0x35110a,
    bladeColor: 0xff5a2c,
    discColor: 0x5e1400,
    accent: 0xff8a3d,
    bladeMetal: 0.55,
    bladeRough: 0.32,
    emissiveColor: 0xff5a2c,
    emissiveIntensity: 0.75,
    glow: 0xff8a3d,
    driver: 'flat',
    discScale: 1.06,
    lightColor: 0xff5a2c,
    lightIntensity: 1.5,
  },
  bedrock: {
    blades: 4,
    style: 'blunt',
    bodyColor: 0x13243a,
    bladeColor: 0x4f9dd9,
    discColor: 0x1c3146,
    accent: 0x8fd0ff,
    bladeMetal: 0.85,
    bladeRough: 0.28,
    emissiveColor: 0x3f8fd0,
    emissiveIntensity: 0.32,
    glow: 0x8fd0ff,
    driver: 'wide',
    discScale: 1.2,
    lightColor: 0x4f9dd9,
    lightIntensity: 0.9,
  },
  gale: {
    blades: 6,
    style: 'fan',
    bodyColor: 0x06382c,
    bladeColor: 0x2fe6a8,
    discColor: 0x06443a,
    accent: 0x9bffe0,
    bladeMetal: 0.6,
    bladeRough: 0.25,
    emissiveColor: 0x2fe6a8,
    emissiveIntensity: 0.5,
    glow: 0x9bffe0,
    driver: 'needle',
    discScale: 0.86,
    lightColor: 0x2fe6a8,
    lightIntensity: 1.2,
  },
  chaos: {
    blades: 3,
    style: 'asym',
    bodyColor: 0x1a0731,
    bladeColor: 0xb15cff,
    discColor: 0x0d0a14,
    accent: 0xe0a3ff,
    bladeMetal: 0.9,
    bladeRough: 0.2,
    emissiveColor: 0xb15cff,
    emissiveIntensity: 0.85,
    glow: 0xe0a3ff,
    driver: 'orb',
    discScale: 1.0,
    lightColor: 0xb15cff,
    lightIntensity: 2.0,
  },
};

// The visual faction of a (possibly mixed) build = its most-equipped set.
// Tie-break by the attack ring (slot A), then a fixed order.
export function factionForBuild(componentIds) {
  const comps = componentIds.map((id) => COMPONENTS_BY_ID[id]).filter(Boolean);
  if (comps.length === 0) return 'inferno';
  const counts = countSets(comps);
  let best = null;
  let bestN = -1;
  for (const setId of ['inferno', 'bedrock', 'gale', 'chaos']) {
    const n = counts[setId] || 0;
    if (n > bestN) {
      bestN = n;
      best = setId;
    }
  }
  // tie-break: if attack ring's set is among the top, prefer it
  const ringSet = comps.find((c) => c.slot === 'A')?.set;
  if (ringSet && (counts[ringSet] || 0) === bestN) return ringSet;
  return best;
}

// Per-slot faction map so each physical part reflects the component you equipped:
//   A -> energy layer + blades, B -> driver tip, C -> forge disc, D -> core glow.
export function slotFactionsFor(componentIds) {
  const out = { A: 'inferno', B: 'inferno', C: 'inferno', D: 'inferno' };
  for (const id of componentIds) {
    const c = COMPONENTS_BY_ID[id];
    if (c) out[c.slot] = c.set;
  }
  return out;
}
