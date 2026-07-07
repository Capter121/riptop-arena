// Launch techniques + the ripcord timing minigame (PRD ch.9).
// A launch RESULT carries: a stamina multiplier (permanent) and a set of
// time-windowed buffs the sim applies during the opening seconds.

export const ZONE = {
  perfect: { id: 'perfect', name: '完美', en: 'Perfect', color: 0x35e06a, staminaMult: 1.12 },
  good: { id: 'good', name: '良好', en: 'Good', color: 0xf2c44a, staminaMult: 1.0 },
  slip: { id: 'slip', name: '打滑', en: 'Slip', color: 0xff5252, staminaMult: 0.86 },
};

export const TECHNIQUES = [
  {
    id: 'steady',
    name: '穩定發射',
    en: 'Steady',
    blurb: '低風險，上限低。新手 / 續航流。',
    risk: '低',
    // Wider perfect zone = easier to nail. Fractions of the bar [0..1].
    perfectWidth: 0.26,
    goodWidth: 0.42,
    perfectDesc: '初始續航 +6%',
  },
  {
    id: 'power',
    name: '全力爆發',
    en: 'Power',
    blurb: '高風險高回報。攻擊 / 速攻流。',
    risk: '高',
    perfectWidth: 0.1,
    goodWidth: 0.36,
    perfectDesc: '開局 10 秒 攻擊 +15%、轉速 +12%',
    slipExtraMult: 0.85, // Slip penalty heavier.
  },
  {
    id: 'spin_slide',
    name: '甩尾發射',
    en: 'Spin-Slide',
    blurb: '中風險。可選開局站位。軌跡 / 控場流。',
    risk: '中',
    perfectWidth: 0.18,
    goodWidth: 0.4,
    perfectDesc: '自選開局站位（中央強攻 / 外圈防守），首 5 秒對應增益',
    needsStance: true,
  },
];

export const TECHNIQUES_BY_ID = Object.fromEntries(TECHNIQUES.map((t) => [t.id, t]));

// Build a launch result object from technique + landed zone + optional stance.
// timedBuffs: [{ key, mult/add, until }] applied while battle time < until.
export function buildLaunchResult(techniqueId, zoneId, stance = 'center') {
  const tech = TECHNIQUES_BY_ID[techniqueId];
  const zone = ZONE[zoneId];
  let staminaMult = zone.staminaMult;
  const timedBuffs = [];
  let startPosition = 'mid';

  if (zoneId === 'slip') {
    // 2s stumble: trajectory -30%.
    timedBuffs.push({ stat: 'trj', mult: 0.7, until: 2.0, label: '踉蹌' });
    if (tech.slipExtraMult) staminaMult *= tech.slipExtraMult;
  }

  if (zoneId === 'perfect') {
    if (tech.id === 'steady') {
      staminaMult += 0.06;
    } else if (tech.id === 'power') {
      timedBuffs.push({ stat: 'atk', mult: 1.15, until: 10.0, label: '全力' });
      timedBuffs.push({ stat: 'spd', mult: 1.12, until: 10.0, label: '高轉速' });
    } else if (tech.id === 'spin_slide') {
      if (stance === 'center') {
        timedBuffs.push({ stat: 'atk', mult: 1.1, until: 5.0, label: '中央強攻' });
        startPosition = 'center';
      } else {
        timedBuffs.push({ stat: 'def', mult: 1.12, until: 5.0, label: '外圈防守' });
        startPosition = 'outer';
      }
    }
  } else if (tech.id === 'spin_slide') {
    // Spin-slide still picks a stance even on non-perfect, just without the buff.
    startPosition = stance === 'center' ? 'center' : 'outer';
  }

  return { techniqueId, zoneId, stance, staminaMult, timedBuffs, startPosition };
}

// Resolve where the ripcord pointer landed [0..1] into a zone for a technique.
// Layout: [slip | good | perfect | good | slip] centred on 0.5.
export function zoneForPosition(pos, techniqueId) {
  const tech = TECHNIQUES_BY_ID[techniqueId];
  const half = tech.perfectWidth / 2;
  const goodHalf = half + tech.goodWidth / 2;
  const d = Math.abs(pos - 0.5);
  if (d <= half) return 'perfect';
  if (d <= goodHalf) return 'good';
  return 'slip';
}

// For AI / auto launch: sample a zone with PRD-ish probabilities
// (perfect ~22% / good ~56% / slip ~22%), scaled by technique perfect width.
export function sampleZone(techniqueId, rng) {
  const tech = TECHNIQUES_BY_ID[techniqueId];
  const pPerfect = 0.22 * (tech.perfectWidth / 0.18); // wider zone -> more perfects
  const pSlip = tech.slipExtraMult ? 0.26 : 0.2;
  const r = rng();
  if (r < pPerfect) return 'perfect';
  if (r < 1 - pSlip) return 'good';
  return 'slip';
}
