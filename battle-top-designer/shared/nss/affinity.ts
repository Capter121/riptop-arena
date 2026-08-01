import rules from './affinity-rules.json';

export type PartAffinity = 'WIND' | 'FIRE' | 'WATER' | 'WOOD' | 'EARTH' | 'LIGHT' | 'DARK';
export type AffinityRelation = 'advantage' | 'disadvantage' | 'neutral';
export type AffinityLayers = {
  core: PartAffinity;
  blade: PartAffinity;
  assist: PartAffinity;
  gear: PartAffinity;
  tip: PartAffinity;
};
export type OffenseResonance = Readonly<{
  kind: 'offense';
  affinity: PartAffinity;
  count: 3 | 4 | 5;
  bonus: number;
}>;
export type HarmonyDistribution = '2-2-1' | '2-1-1-1' | '1-1-1-1-1';
export type HarmonyResonance = Readonly<{
  kind: 'harmony';
  distribution: HarmonyDistribution;
  defenseBonus: number;
  stabilityBonus: number;
}>;
export type NoResonance = Readonly<{ kind: 'none' }>;
export type AffinityProfile = Readonly<{
  rulesVersion: number;
  primary: PartAffinity;
  counts: Readonly<Record<PartAffinity, number>>;
  resonance: OffenseResonance | HarmonyResonance | NoResonance;
  modifiers: Readonly<{
    elementalPower: number;
    defenseMultiplier: number;
    spinDrainMultiplier: number;
    tiltGrowthMultiplier: number;
  }>;
}>;

const AFFINITY_LAYERS = ['core', 'blade', 'assist', 'gear', 'tip'] as const;
const affinityLayerKeys = [...AFFINITY_LAYERS].sort().join(',');

export const AFFINITIES = Object.freeze([...rules.affinities]) as readonly PartAffinity[];

export function isPartAffinity(value: unknown): value is PartAffinity {
  return typeof value === 'string' && AFFINITIES.includes(value as PartAffinity);
}

export function getAffinityRelation(attacker: unknown, defender: unknown): AffinityRelation {
  if (!isPartAffinity(attacker) || !isPartAffinity(defender)) {
    throw new Error('Unknown NSS affinity');
  }

  const direct = rules.advantages.some(pair => pair.attacker === attacker && pair.defender === defender);
  if (direct) return 'advantage';

  const reverse = rules.advantages.some(pair => pair.attacker === defender && pair.defender === attacker);
  return reverse ? 'disadvantage' : 'neutral';
}

export const AFFINITY_DAMAGE_RULES = Object.freeze({ ...rules.damage });
export const AFFINITY_RESONANCE_RULES = Object.freeze({
  offense: Object.freeze({ ...rules.resonance.offense }),
  harmony: Object.freeze({ ...rules.resonance.harmony }),
});

export function isAffinityLayers(value: unknown): value is AffinityLayers {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).sort().join(',') === affinityLayerKeys
    && AFFINITY_LAYERS.every(layer => isPartAffinity(record[layer]));
}

export function createDefaultAffinityLayers(coreId: string): AffinityLayers {
  return {
    core: coreId === 'core_void_falcon' ? 'DARK' : 'LIGHT',
    blade: 'WIND',
    assist: 'FIRE',
    gear: 'WATER',
    tip: 'EARTH',
  };
}

export function resolveAffinityProfile(value: unknown): AffinityProfile {
  if (!isAffinityLayers(value)) throw new Error('Invalid NSS affinity layers');

  const counts: Record<PartAffinity, number> = {
    WIND: 0,
    FIRE: 0,
    WATER: 0,
    WOOD: 0,
    EARTH: 0,
    LIGHT: 0,
    DARK: 0,
  };
  for (const layer of AFFINITY_LAYERS) counts[value[layer]] += 1;

  const maximum = Math.max(...Object.values(counts));
  const primaryCandidates = AFFINITIES.filter(affinity => counts[affinity] === maximum);
  const primary = primaryCandidates.includes(value.core) ? value.core : primaryCandidates[0];
  const distribution = Object.values(counts).filter(Boolean).sort((left, right) => right - left).join('-');

  let resonance: OffenseResonance | HarmonyResonance | NoResonance;
  if (maximum >= 3) {
    const count = maximum as 3 | 4 | 5;
    const bonus = AFFINITY_RESONANCE_RULES.offense[String(count) as '3' | '4' | '5'];
    resonance = Object.freeze({ kind: 'offense', affinity: primary, count, bonus });
  } else if (distribution in AFFINITY_RESONANCE_RULES.harmony) {
    const harmonyDistribution = distribution as HarmonyDistribution;
    const harmony = AFFINITY_RESONANCE_RULES.harmony[harmonyDistribution];
    resonance = Object.freeze({
      kind: 'harmony',
      distribution: harmonyDistribution,
      defenseBonus: harmony.defense,
      stabilityBonus: harmony.stability,
    });
  } else {
    resonance = Object.freeze({ kind: 'none' });
  }

  const elementalBonus = resonance.kind === 'offense' ? resonance.bonus : 0;
  const defenseBonus = resonance.kind === 'harmony' ? resonance.defenseBonus : 0;
  const stabilityBonus = resonance.kind === 'harmony' ? resonance.stabilityBonus : 0;

  return Object.freeze({
    rulesVersion: rules.rulesVersion,
    primary,
    counts: Object.freeze(counts),
    resonance,
    modifiers: Object.freeze({
      elementalPower: 1 + elementalBonus,
      defenseMultiplier: 1 + defenseBonus,
      spinDrainMultiplier: 1 - stabilityBonus,
      tiltGrowthMultiplier: 1 - stabilityBonus,
    }),
  });
}
