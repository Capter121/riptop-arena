import battlePartsJson from './battle-parts.json';
import catalogJson from './parts.catalog.json';
import {
  AFFINITIES,
  createDefaultAffinityLayers,
  isAffinityLayers,
  isPartAffinity,
  type AffinityLayers,
  type PartAffinity,
} from './affinity';

export const RULE_FAMILIES = ['core', 'blade', 'assist', 'gear', 'tip'] as const;
export type RuleFamily = (typeof RULE_FAMILIES)[number];
export type RuleCombination = Record<RuleFamily, string>;
export type RuleBuild = Readonly<{ combination: RuleCombination; affinities: AffinityLayers }>;
export type BuildRulePresetId = 'FREE' | 'LIGHTWEIGHT' | 'ELEMENT_SPECIALIST' | 'BASIC_PARTS_CUP';
export type BuildRuleSelection =
  | Readonly<{ preset: 'FREE' | 'LIGHTWEIGHT' | 'BASIC_PARTS_CUP' }>
  | Readonly<{ preset: 'ELEMENT_SPECIALIST'; affinity: PartAffinity }>;

export type DisabledPartViolation = Readonly<{
  code: 'DISABLED_PART';
  partId: string;
  family: RuleFamily;
  displayName: string;
}>;
export type WeightLimitViolation = Readonly<{
  code: 'WEIGHT_LIMIT';
  actual: number;
  maximum: number;
  excess: number;
}>;
export type AffinityMinimumViolation = Readonly<{
  code: 'AFFINITY_MINIMUM';
  affinity: PartAffinity;
  actual: number;
  minimum: number;
  missing: number;
}>;
export type BuildRuleViolation = DisabledPartViolation | WeightLimitViolation | AffinityMinimumViolation;
export type NoLegalBuildViolation = Readonly<{ code: 'NO_LEGAL_BUILD' }>;
export type RandomBuildResult =
  | Readonly<{ ok: true; build: RuleBuild }>
  | Readonly<{ ok: false; violations: readonly (BuildRuleViolation | NoLegalBuildViolation)[] }>;

type RulePartRecord = Readonly<{
  id: string;
  displayName: string;
  family: RuleFamily;
}>;

type BattlePartRecord = Readonly<{
  id: string;
  family: RuleFamily;
  physics: Readonly<{ weight: number }>;
}>;

export const BASIC_PARTS_CUP_DISABLED_IDS = Object.freeze([
  'blade_storm_fang',
  'blade_iron_bastion',
  'assist_heavy',
] as const);

export const BUILD_RULE_PRESETS = Object.freeze({
  FREE: Object.freeze({ id: 'FREE' as const }),
  LIGHTWEIGHT: Object.freeze({ id: 'LIGHTWEIGHT' as const, maxWeight: 2.1 }),
  ELEMENT_SPECIALIST: Object.freeze({ id: 'ELEMENT_SPECIALIST' as const, minimumAffinityCount: 3 }),
  BASIC_PARTS_CUP: Object.freeze({ id: 'BASIC_PARTS_CUP' as const, disabledPartIds: BASIC_PARTS_CUP_DISABLED_IDS }),
});

const catalog = catalogJson.parts as RulePartRecord[];
const partById = new Map(catalog.map(part => [part.id, part]));
const weights = new Map((battlePartsJson.parts as BattlePartRecord[]).map(part => [part.id, part.physics.weight]));

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isRuleSelection(value: unknown): value is BuildRuleSelection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.preset === 'ELEMENT_SPECIALIST') {
    return Object.keys(record).sort().join(',') === 'affinity,preset' && isPartAffinity(record.affinity);
  }
  return Object.keys(record).join(',') === 'preset'
    && (record.preset === 'FREE' || record.preset === 'LIGHTWEIGHT' || record.preset === 'BASIC_PARTS_CUP');
}

function isRuleCombination(value: unknown): value is RuleCombination {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== [...RULE_FAMILIES].sort().join(',')) return false;
  return RULE_FAMILIES.every(family => {
    const part = typeof record[family] === 'string' ? partById.get(record[family]) : undefined;
    return part?.family === family && weights.has(part.id);
  });
}

function assertSelection(selection: unknown): asserts selection is BuildRuleSelection {
  if (!isRuleSelection(selection)) throw new Error('Invalid NSS build rule selection');
}

function assertBuild(build: unknown): asserts build is RuleBuild {
  if (!build || typeof build !== 'object' || Array.isArray(build)) throw new Error('Invalid NSS rule build');
  const record = build as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== 'affinities,combination'
    || !isRuleCombination(record.combination)
    || !isAffinityLayers(record.affinities)) {
    throw new Error('Invalid NSS rule build');
  }
}

export function buildWeight(combination: RuleCombination): number {
  if (!isRuleCombination(combination)) throw new Error('Invalid NSS rule build');
  return RULE_FAMILIES.reduce((total, family) => total + weights.get(combination[family])!, 0);
}

export function eligibleParts(family: RuleFamily, selection: BuildRuleSelection): readonly RulePartRecord[] {
  assertSelection(selection);
  if (!RULE_FAMILIES.includes(family)) throw new Error('Invalid NSS rule family');
  const disabled: readonly string[] = selection.preset === 'BASIC_PARTS_CUP' ? BASIC_PARTS_CUP_DISABLED_IDS : [];
  return catalog.filter(part => part.family === family && !disabled.includes(part.id));
}

export function validateBuild(build: RuleBuild, selection: BuildRuleSelection): readonly BuildRuleViolation[] {
  assertBuild(build);
  assertSelection(selection);
  const violations: BuildRuleViolation[] = [];

  if (selection.preset === 'BASIC_PARTS_CUP') {
    for (const family of RULE_FAMILIES) {
      const partId = build.combination[family];
      if (BASIC_PARTS_CUP_DISABLED_IDS.includes(partId as typeof BASIC_PARTS_CUP_DISABLED_IDS[number])) {
        const part = partById.get(partId)!;
        violations.push({ code: 'DISABLED_PART', partId, family, displayName: part.displayName });
      }
    }
  }

  if (selection.preset === 'LIGHTWEIGHT') {
    const actual = buildWeight(build.combination);
    const maximum = BUILD_RULE_PRESETS.LIGHTWEIGHT.maxWeight;
    if (actual > maximum) {
      violations.push({ code: 'WEIGHT_LIMIT', actual: round2(actual), maximum, excess: round2(actual - maximum) });
    }
  }

  if (selection.preset === 'ELEMENT_SPECIALIST') {
    const actual = RULE_FAMILIES.filter(family => build.affinities[family] === selection.affinity).length;
    const minimum = BUILD_RULE_PRESETS.ELEMENT_SPECIALIST.minimumAffinityCount;
    if (actual < minimum) {
      violations.push({ code: 'AFFINITY_MINIMUM', affinity: selection.affinity, actual, minimum, missing: minimum - actual });
    }
  }

  return violations;
}

function randomIndex(length: number, random: () => number): number {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Invalid NSS random value');
  return Math.floor(value * length);
}

function enumerateRuleCombinations(selection: BuildRuleSelection): RuleCombination[] {
  const pools = Object.fromEntries(RULE_FAMILIES.map(family => [family, eligibleParts(family, selection)])) as
    Record<RuleFamily, readonly RulePartRecord[]>;
  const combinations: RuleCombination[] = [];
  for (const core of pools.core)
    for (const blade of pools.blade)
      for (const assist of pools.assist)
        for (const gear of pools.gear)
          for (const tip of pools.tip)
            combinations.push({ core: core.id, blade: blade.id, assist: assist.id, gear: gear.id, tip: tip.id });
  return combinations;
}

function specialistAffinities(target: PartAffinity): AffinityLayers[] {
  const candidates: AffinityLayers[] = [];
  for (const core of AFFINITIES)
    for (const blade of AFFINITIES)
      for (const assist of AFFINITIES)
        for (const gear of AFFINITIES)
          for (const tip of AFFINITIES) {
            const layers = { core, blade, assist, gear, tip };
            if (Object.values(layers).filter(affinity => affinity === target).length >= 3) candidates.push(layers);
          }
  return candidates;
}

export function randomBuild(selection: BuildRuleSelection, random: () => number = Math.random): RandomBuildResult {
  assertSelection(selection);
  const combinations = enumerateRuleCombinations(selection).filter(combination => {
    const affinities = selection.preset === 'ELEMENT_SPECIALIST'
      ? Object.fromEntries(RULE_FAMILIES.map(family => [family, selection.affinity])) as AffinityLayers
      : createDefaultAffinityLayers(combination.core);
    return validateBuild({ combination, affinities }, selection).length === 0;
  });
  if (!combinations.length) return { ok: false, violations: [{ code: 'NO_LEGAL_BUILD' }] };

  const combination = combinations[randomIndex(combinations.length, random)];
  const affinities = selection.preset === 'ELEMENT_SPECIALIST'
    ? (() => {
      const candidates = specialistAffinities(selection.affinity);
      return candidates[randomIndex(candidates.length, random)];
    })()
    : createDefaultAffinityLayers(combination.core);
  const build: RuleBuild = { combination, affinities };
  const violations = validateBuild(build, selection);
  return violations.length ? { ok: false, violations } : { ok: true, build };
}
