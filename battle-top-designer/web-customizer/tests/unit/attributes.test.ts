import { describe, expect, it } from 'vitest';
import { attributeNames, conceptAttributes } from '../../src/attributes';
import { enumerateCombinations, stormAttack } from '../../src/domain';

describe('concept attributes', () => {
  it('returns six bounded deterministic values', () => {
    const first = conceptAttributes(stormAttack);
    expect(Object.keys(first)).toEqual([...attributeNames]);
    expect(conceptAttributes(stormAttack)).toEqual(first);
    expect(Object.values(first).every(value => value >= 0 && value <= 100)).toBe(true);
  });

  it('has complete data for all 288 combinations', () => {
    for (const combination of enumerateCombinations()) expect(() => conceptAttributes(combination)).not.toThrow();
  });
});
