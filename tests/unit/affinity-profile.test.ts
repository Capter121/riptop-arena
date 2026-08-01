import { describe, expect, it } from 'vitest';
import {
  resolveAffinityProfile,
  type AffinityLayers,
} from '../../battle-top-designer/shared/nss/affinity';

describe('NSS affinity profiles', () => {
  it.each([
    {
      distribution: '5',
      layers: { core: 'FIRE', blade: 'FIRE', assist: 'FIRE', gear: 'FIRE', tip: 'FIRE' },
      resonance: { kind: 'offense', affinity: 'FIRE', count: 5, bonus: 0.15 },
    },
    {
      distribution: '4-1',
      layers: { core: 'WATER', blade: 'FIRE', assist: 'FIRE', gear: 'FIRE', tip: 'FIRE' },
      resonance: { kind: 'offense', affinity: 'FIRE', count: 4, bonus: 0.1 },
    },
    {
      distribution: '3-2',
      layers: { core: 'WATER', blade: 'WATER', assist: 'FIRE', gear: 'FIRE', tip: 'FIRE' },
      resonance: { kind: 'offense', affinity: 'FIRE', count: 3, bonus: 0.06 },
    },
    {
      distribution: '3-1-1',
      layers: { core: 'WATER', blade: 'FIRE', assist: 'FIRE', gear: 'FIRE', tip: 'WOOD' },
      resonance: { kind: 'offense', affinity: 'FIRE', count: 3, bonus: 0.06 },
    },
    {
      distribution: '2-2-1',
      layers: { core: 'WIND', blade: 'WIND', assist: 'FIRE', gear: 'FIRE', tip: 'EARTH' },
      resonance: { kind: 'harmony', distribution: '2-2-1', defenseBonus: 0.05, stabilityBonus: 0.06 },
    },
    {
      distribution: '2-1-1-1',
      layers: { core: 'WATER', blade: 'WATER', assist: 'FIRE', gear: 'WOOD', tip: 'EARTH' },
      resonance: { kind: 'harmony', distribution: '2-1-1-1', defenseBonus: 0.07, stabilityBonus: 0.08 },
    },
    {
      distribution: '1-1-1-1-1',
      layers: { core: 'LIGHT', blade: 'WIND', assist: 'FIRE', gear: 'WATER', tip: 'EARTH' },
      resonance: { kind: 'harmony', distribution: '1-1-1-1-1', defenseBonus: 0.09, stabilityBonus: 0.1 },
    },
  ] as const)('resolves the $distribution integer partition', ({ layers, resonance }) => {
    const profile = resolveAffinityProfile(layers);
    expect(profile.resonance).toEqual(resonance);
  });

  it('uses the core for a tied maximum, then the fixed affinity order when the core is not tied', () => {
    expect(resolveAffinityProfile({
      core: 'FIRE', blade: 'FIRE', assist: 'WIND', gear: 'WIND', tip: 'EARTH',
    }).primary).toBe('FIRE');

    expect(resolveAffinityProfile({
      core: 'EARTH', blade: 'FIRE', assist: 'FIRE', gear: 'WIND', tip: 'WIND',
    }).primary).toBe('WIND');
  });

  it('returns the approved multipliers and deeply frozen output', () => {
    const offense = resolveAffinityProfile({
      core: 'DARK', blade: 'DARK', assist: 'DARK', gear: 'DARK', tip: 'WATER',
    });
    expect(offense.modifiers).toEqual({
      elementalPower: 1.1,
      defenseMultiplier: 1,
      spinDrainMultiplier: 1,
      tiltGrowthMultiplier: 1,
    });

    const harmony = resolveAffinityProfile({
      core: 'LIGHT', blade: 'WIND', assist: 'FIRE', gear: 'WATER', tip: 'EARTH',
    });
    expect(harmony.modifiers).toEqual({
      elementalPower: 1,
      defenseMultiplier: 1.09,
      spinDrainMultiplier: 0.9,
      tiltGrowthMultiplier: 0.9,
    });
    expect(Object.isFrozen(harmony)).toBe(true);
    expect(Object.isFrozen(harmony.counts)).toBe(true);
    expect(Object.isFrozen(harmony.resonance)).toBe(true);
    expect(Object.isFrozen(harmony.modifiers)).toBe(true);
  });

  it('does not depend on object key insertion order', () => {
    const ordered: AffinityLayers = {
      core: 'EARTH', blade: 'FIRE', assist: 'FIRE', gear: 'WIND', tip: 'WIND',
    };
    const reordered = {
      tip: 'WIND', gear: 'WIND', assist: 'FIRE', blade: 'FIRE', core: 'EARTH',
    };
    expect(resolveAffinityProfile(reordered)).toEqual(resolveAffinityProfile(ordered));
  });

  it('rejects missing, extra, or unknown layer affinities', () => {
    expect(() => resolveAffinityProfile({
      core: 'WIND', blade: 'FIRE', assist: 'WATER', gear: 'WOOD',
    })).toThrow('Invalid NSS affinity layers');
    expect(() => resolveAffinityProfile({
      core: 'WIND', blade: 'FIRE', assist: 'WATER', gear: 'WOOD', tip: 'EARTH', extra: 'LIGHT',
    })).toThrow('Invalid NSS affinity layers');
    expect(() => resolveAffinityProfile({
      core: 'ICE', blade: 'FIRE', assist: 'WATER', gear: 'WOOD', tip: 'EARTH',
    })).toThrow('Invalid NSS affinity layers');
  });
});
