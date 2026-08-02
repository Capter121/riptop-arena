import { describe, expect, it } from 'vitest';
import { AFFINITIES, type AffinityLayers, type PartAffinity } from '../../../shared/nss/affinity';
import {
  BASIC_PARTS_CUP_DISABLED_IDS,
  BUILD_RULE_PRESETS,
  buildWeight,
  eligibleParts,
  validateBuild,
  type BuildRuleSelection,
  type RuleBuild,
  type RuleCombination,
} from '../../../shared/nss/build-rules';

const exactWeightCombination: RuleCombination = {
  core: 'core_solar_wolf',
  blade: 'blade_dual_comet',
  assist: 'assist_guard',
  gear: 'gear_low',
  tip: 'tip_ball_defense',
};

const heavyCombination: RuleCombination = {
  core: 'core_solar_wolf',
  blade: 'blade_iron_bastion',
  assist: 'assist_heavy',
  gear: 'gear_high',
  tip: 'tip_ball_defense',
};

const harmony: AffinityLayers = {
  core: 'LIGHT',
  blade: 'WIND',
  assist: 'FIRE',
  gear: 'WATER',
  tip: 'EARTH',
};

function build(combination = exactWeightCombination, affinities = harmony): RuleBuild {
  return { combination, affinities };
}

function specialist(affinity: PartAffinity): BuildRuleSelection {
  return { preset: 'ELEMENT_SPECIALIST', affinity };
}

function affinityLayers(affinity: PartAffinity, count: 2 | 3): AffinityLayers {
  const others = AFFINITIES.filter(value => value !== affinity);
  return {
    core: affinity,
    blade: affinity,
    assist: count === 3 ? affinity : others[0],
    gear: others[1],
    tip: others[2],
  };
}

describe('NSS build rules', () => {
  it('exposes four immutable fixed presets', () => {
    expect(BUILD_RULE_PRESETS).toEqual({
      FREE: { id: 'FREE' },
      LIGHTWEIGHT: { id: 'LIGHTWEIGHT', maxWeight: 2.1 },
      ELEMENT_SPECIALIST: { id: 'ELEMENT_SPECIALIST', minimumAffinityCount: 3 },
      BASIC_PARTS_CUP: { id: 'BASIC_PARTS_CUP', disabledPartIds: BASIC_PARTS_CUP_DISABLED_IDS },
    });
    expect(BASIC_PARTS_CUP_DISABLED_IDS).toEqual([
      'blade_storm_fang',
      'blade_iron_bastion',
      'assist_heavy',
    ]);
    expect(Object.isFrozen(BUILD_RULE_PRESETS)).toBe(true);
    expect(Object.isFrozen(BASIC_PARTS_CUP_DISABLED_IDS)).toBe(true);
  });

  it('keeps free builds unrestricted', () => {
    expect(validateBuild(build(heavyCombination), { preset: 'FREE' })).toEqual([]);
  });

  it('accepts exactly 2.10 and reports weight above the boundary', () => {
    expect(buildWeight(exactWeightCombination)).toBe(2.1);
    expect(validateBuild(build(), { preset: 'LIGHTWEIGHT' })).toEqual([]);

    expect(validateBuild(build(heavyCombination), { preset: 'LIGHTWEIGHT' })).toEqual([{
      code: 'WEIGHT_LIMIT',
      actual: 2.55,
      maximum: 2.1,
      excess: 0.45,
    }]);
  });

  it.each(AFFINITIES)('requires at least three %s layers', affinity => {
    expect(validateBuild(build(exactWeightCombination, affinityLayers(affinity, 3)), specialist(affinity))).toEqual([]);
    expect(validateBuild(build(exactWeightCombination, affinityLayers(affinity, 2)), specialist(affinity))).toEqual([{
      code: 'AFFINITY_MINIMUM',
      affinity,
      actual: 2,
      minimum: 3,
      missing: 1,
    }]);
  });

  it.each([
    ['blade_storm_fang', 'blade', 'Storm Fang'],
    ['blade_iron_bastion', 'blade', 'Iron Bastion'],
    ['assist_heavy', 'assist', 'Heavy Assist'],
  ] as const)('identifies disabled part %s', (partId, family, displayName) => {
    const combination = { ...exactWeightCombination, [family]: partId };
    expect(validateBuild(build(combination), { preset: 'BASIC_PARTS_CUP' })).toEqual([{
      code: 'DISABLED_PART',
      partId,
      family,
      displayName,
    }]);
  });

  it('returns every disabled-part violation in stable family order', () => {
    expect(validateBuild(build(heavyCombination), { preset: 'BASIC_PARTS_CUP' })).toEqual([
      { code: 'DISABLED_PART', partId: 'blade_iron_bastion', family: 'blade', displayName: 'Iron Bastion' },
      { code: 'DISABLED_PART', partId: 'assist_heavy', family: 'assist', displayName: 'Heavy Assist' },
    ]);
  });

  it('filters only disabled parts from eligible family pools', () => {
    expect(eligibleParts('blade', { preset: 'BASIC_PARTS_CUP' }).map(part => part.id)).not.toContain('blade_storm_fang');
    expect(eligibleParts('blade', { preset: 'BASIC_PARTS_CUP' }).map(part => part.id)).not.toContain('blade_iron_bastion');
    expect(eligibleParts('assist', { preset: 'BASIC_PARTS_CUP' }).map(part => part.id)).not.toContain('assist_heavy');
    expect(eligibleParts('tip', { preset: 'BASIC_PARTS_CUP' })).toHaveLength(4);
  });

  it('rejects invalid builds, presets, and affinity targets', () => {
    expect(() => validateBuild(build({ ...exactWeightCombination, tip: 'unknown' }), { preset: 'FREE' })).toThrow('Invalid NSS rule build');
    expect(() => validateBuild(build(), { preset: 'UNKNOWN' } as unknown as BuildRuleSelection)).toThrow('Invalid NSS build rule selection');
    expect(() => validateBuild(build(), { preset: 'ELEMENT_SPECIALIST', affinity: 'ICE' } as unknown as BuildRuleSelection)).toThrow('Invalid NSS build rule selection');
  });

  it('does not mutate the build or selection', () => {
    const value = build();
    const selection: BuildRuleSelection = { preset: 'LIGHTWEIGHT' };
    const before = JSON.stringify({ value, selection });
    validateBuild(value, selection);
    expect(JSON.stringify({ value, selection })).toBe(before);
  });
});
