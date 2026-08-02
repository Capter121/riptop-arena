import type {
  AffinityProfile,
  HarmonyDistribution,
  PartAffinity,
} from './affinity';

const ATTRIBUTE_NAMES = ['attack', 'defense', 'stamina', 'balance', 'weight', 'height'] as const;
const TIE_ORDER = ['BURST', 'BALANCED', 'COUNTER', 'ENDURANCE', 'FORTRESS', 'ASSAULT'] as const;

export type BuildProfileAttribute = (typeof ATTRIBUTE_NAMES)[number];
export type BuildProfileAttributes = Readonly<Record<BuildProfileAttribute, number>>;
export type BuildArchetype = (typeof TIE_ORDER)[number];

export type BuildProfileReason =
  | { kind: 'attribute'; attribute: BuildProfileAttribute; value: number }
  | { kind: 'counter-floor'; attribute: 'attack' | 'defense' | 'balance'; value: number }
  | { kind: 'offense-resonance'; affinity: PartAffinity; count: 3 | 4 | 5; bonus: number }
  | { kind: 'balance-spread'; value: number }
  | { kind: 'harmony'; distribution: HarmonyDistribution; defenseBonus: number; stabilityBonus: number };

export type BuildProfileResult = Readonly<{
  primary: BuildArchetype;
  secondary: readonly BuildArchetype[];
  reasons: readonly BuildProfileReason[];
}>;

type Score = { archetype: BuildArchetype; value: number };

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function validateAttributes(attributes: BuildProfileAttributes) {
  if (!attributes || typeof attributes !== 'object') throw new Error('Invalid NSS build profile attributes');
  for (const name of ATTRIBUTE_NAMES) {
    const value = attributes[name];
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error('Invalid NSS build profile attributes');
    }
  }
}

function attributeReasons(attributes: BuildProfileAttributes, names: readonly BuildProfileAttribute[]): BuildProfileReason[] {
  return names.map(attribute => ({ kind: 'attribute', attribute, value: attributes[attribute] }));
}

function reasonsFor(primary: BuildArchetype, attributes: BuildProfileAttributes, profile: AffinityProfile): BuildProfileReason[] {
  if (primary === 'ASSAULT') return attributeReasons(attributes, ['attack', 'balance', 'weight']);
  if (primary === 'FORTRESS') return attributeReasons(attributes, ['defense', 'weight', 'balance']);
  if (primary === 'ENDURANCE') return attributeReasons(attributes, ['stamina', 'balance', 'defense']);
  if (primary === 'BURST' && profile.resonance.kind === 'offense') {
    return [{
      kind: 'offense-resonance',
      affinity: profile.resonance.affinity,
      count: profile.resonance.count,
      bonus: profile.resonance.bonus,
    }];
  }
  if (primary === 'BALANCED') {
    const coreValues = [attributes.attack, attributes.defense, attributes.stamina, attributes.balance];
    const result: BuildProfileReason[] = [{ kind: 'balance-spread', value: Math.max(...coreValues) - Math.min(...coreValues) }];
    if (profile.resonance.kind === 'harmony') {
      result.push({
        kind: 'harmony',
        distribution: profile.resonance.distribution,
        defenseBonus: profile.resonance.defenseBonus,
        stabilityBonus: profile.resonance.stabilityBonus,
      });
    }
    return result;
  }

  const counterAttributes = ['attack', 'defense', 'balance'] as const;
  const floor = counterAttributes.reduce((lowest, name) => (
    attributes[name] < attributes[lowest] ? name : lowest
  ), counterAttributes[0]);
  return [
    { kind: 'counter-floor', attribute: floor, value: attributes[floor] },
    ...attributeReasons(attributes, counterAttributes.filter(name => name !== floor)),
  ];
}

export function resolveBuildProfile(attributes: BuildProfileAttributes, profile: AffinityProfile): BuildProfileResult {
  validateAttributes(attributes);

  const counterValues = [attributes.attack, attributes.defense, attributes.balance];
  const coreValues = [attributes.attack, attributes.defense, attributes.stamina, attributes.balance];
  const spread = Math.max(...coreValues) - Math.min(...coreValues);
  const harmonyBonus = profile.resonance.kind === 'harmony' ? 8 : 0;
  const scores: Score[] = [
    { archetype: 'ASSAULT', value: attributes.attack * 0.6 + attributes.balance * 0.25 + attributes.weight * 0.15 },
    { archetype: 'FORTRESS', value: attributes.defense * 0.6 + attributes.weight * 0.25 + attributes.balance * 0.15 },
    { archetype: 'ENDURANCE', value: attributes.stamina * 0.65 + attributes.balance * 0.25 + attributes.defense * 0.1 },
    {
      archetype: 'COUNTER',
      value: Math.min(...counterValues) * 0.55 + (counterValues.reduce((total, value) => total + value, 0) / counterValues.length) * 0.45,
    },
    { archetype: 'BALANCED', value: Math.max(0, Math.min(100, 78 - spread + harmonyBonus)) },
  ];

  if (profile.resonance.kind === 'offense') {
    scores.push({ archetype: 'BURST', value: profile.resonance.count === 3 ? 68 : profile.resonance.count === 4 ? 84 : 100 });
  }

  scores.forEach(score => { score.value = roundScore(score.value); });
  scores.sort((left, right) => right.value - left.value || TIE_ORDER.indexOf(left.archetype) - TIE_ORDER.indexOf(right.archetype));
  const [winner] = scores;
  const secondary = scores
    .slice(1)
    .filter(score => score.value >= 55 && winner.value - score.value <= 6)
    .slice(0, 2)
    .map(score => score.archetype);

  return {
    primary: winner.archetype,
    secondary,
    reasons: reasonsFor(winner.archetype, attributes, profile),
  };
}
