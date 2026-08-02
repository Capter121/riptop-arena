import { describe, expect, it, vi } from 'vitest';
import { AFFINITIES } from '../../../shared/nss/affinity';
import {
  BASIC_PARTS_CUP_DISABLED_IDS,
  buildWeight,
  randomBuild,
  validateBuild,
  type BuildRuleSelection,
} from '../../../shared/nss/build-rules';

function sequence(...values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

describe('rule-aware randomizer', () => {
  it.each([
    [{ preset: 'FREE' }, 0],
    [{ preset: 'FREE' }, 0.999999],
    [{ preset: 'LIGHTWEIGHT' }, 0],
    [{ preset: 'LIGHTWEIGHT' }, 0.999999],
    [{ preset: 'BASIC_PARTS_CUP' }, 0],
    [{ preset: 'BASIC_PARTS_CUP' }, 0.999999],
  ] as const)('returns a legal %o build at random boundary %s', (selection, value) => {
    const result = randomBuild(selection, () => value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(validateBuild(result.build, selection)).toEqual([]);
    expect(result.build.affinities).toEqual({
      core: result.build.combination.core === 'core_void_falcon' ? 'DARK' : 'LIGHT',
      blade: 'WIND',
      assist: 'FIRE',
      gear: 'WATER',
      tip: 'EARTH',
    });
  });

  it('never returns an overweight lightweight build', () => {
    for (let index = 0; index < 50; index += 1) {
      const result = randomBuild({ preset: 'LIGHTWEIGHT' }, () => index / 50);
      expect(result.ok).toBe(true);
      if (result.ok) expect(buildWeight(result.build.combination)).toBeLessThanOrEqual(2.1);
    }
  });

  it('never returns disabled basic-cup parts', () => {
    for (let index = 0; index < 50; index += 1) {
      const result = randomBuild({ preset: 'BASIC_PARTS_CUP' }, () => index / 50);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(Object.values(result.build.combination)).not.toEqual(expect.arrayContaining([...BASIC_PARTS_CUP_DISABLED_IDS]));
    }
  });

  it.each(AFFINITIES)('guarantees at least three %s layers', affinity => {
    const selection: BuildRuleSelection = { preset: 'ELEMENT_SPECIALIST', affinity };
    for (const values of [[0, 0], [0.5, 0.5], [0.999999, 0.999999]]) {
      const result = randomBuild(selection, sequence(...values));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(Object.values(result.build.affinities).filter(value => value === affinity).length).toBeGreaterThanOrEqual(3);
      expect(validateBuild(result.build, selection)).toEqual([]);
    }
  });

  it('is repeatable for the same random sequence without mutating the selection', () => {
    const selection: BuildRuleSelection = { preset: 'ELEMENT_SPECIALIST', affinity: 'WOOD' };
    const before = JSON.stringify(selection);
    const first = randomBuild(selection, sequence(0.37, 0.82));
    const second = randomBuild(selection, sequence(0.37, 0.82));
    expect(second).toEqual(first);
    expect(JSON.stringify(selection)).toBe(before);
  });

  it.each([Number.NaN, -0.01, 1, Number.POSITIVE_INFINITY])('rejects invalid random value %s', value => {
    expect(() => randomBuild({ preset: 'FREE' }, () => value)).toThrow('Invalid NSS random value');
  });

  it('returns an explicit failure when the catalog has no legal candidates', async () => {
    vi.resetModules();
    vi.doMock('../../../shared/nss/parts.catalog.json', () => ({ default: { schemaVersion: 1, parts: [] } }));
    vi.doMock('../../../shared/nss/battle-parts.json', () => ({ default: { schemaVersion: 1, parts: [] } }));
    const isolated = await import('../../../shared/nss/build-rules');
    expect(isolated.randomBuild({ preset: 'FREE' }, () => 0)).toEqual({
      ok: false,
      violations: [{ code: 'NO_LEGAL_BUILD' }],
    });
    vi.doUnmock('../../../shared/nss/parts.catalog.json');
    vi.doUnmock('../../../shared/nss/battle-parts.json');
  });
});
