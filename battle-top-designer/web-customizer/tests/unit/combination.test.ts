import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  combinationId, enumerateCombinations, families, familyParts, isCombination,
  parseCombinationJson, presentationOffsets, serializeCombination, stormAttack,
  randomCombination,
} from '../../src/domain';

describe('combination domain', () => {
  it('exposes exactly 2 × 4 × 3 × 3 × 4 parts', () => {
    expect(families.map(family => familyParts[family].length)).toEqual([2, 4, 3, 3, 4]);
  });

  it('enumerates 288 unique Phase 2C-compatible IDs', () => {
    const combinations = enumerateCombinations();
    const ids = combinations.map(combinationId);
    expect(combinations).toHaveLength(288);
    expect(new Set(ids).size).toBe(288);
    expect(ids[0]).toBe('nss-p2c-0001');
    expect(ids.at(-1)).toBe('nss-p2c-0288');
    const csv = readFileSync(resolve(__dirname, '../../../reports/assembly_matrix.csv'), 'utf8').trim().split(/\r?\n/);
    const expected = csv.slice(1).map(row => row.split(',', 1)[0]);
    expect(ids).toEqual(expected);
  });

  it('round-trips canonical JSON and rejects mismatches', () => {
    expect(parseCombinationJson(serializeCombination(stormAttack))).toEqual(stormAttack);
    expect(() => parseCombinationJson('{"core":"blade_storm_fang"}')).toThrow(/unknown|missing|mismatched/i);
    expect(isCombination({ ...stormAttack, extra: true })).toBe(false);
  });

  it('keeps permanent assembly separate from presentation offsets', () => {
    expect(presentationOffsets(false, null)).toEqual({ core: 0, blade: 0, assist: 0, gear: 0, tip: 0 });
    expect(presentationOffsets(true, null).tip).toBeLessThan(presentationOffsets(true, null).gear);
    expect(presentationOffsets(false, 'assist').assist).toBeGreaterThan(0);
    expect(presentationOffsets(false, 'assist').blade).toBeGreaterThan(0);
  });

  it('always creates a legal random combination', () => {
    expect(isCombination(randomCombination(() => 0))).toBe(true);
    expect(isCombination(randomCombination(() => 0.999999))).toBe(true);
  });
});
