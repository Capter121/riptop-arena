import rules from './affinity-rules.json';

export type PartAffinity = 'WIND' | 'FIRE' | 'WATER' | 'WOOD' | 'EARTH' | 'LIGHT' | 'DARK';
export type AffinityRelation = 'advantage' | 'disadvantage' | 'neutral';

export const AFFINITIES = rules.affinities as readonly PartAffinity[];

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
