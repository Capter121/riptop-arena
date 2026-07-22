import { describe, expect, it } from 'vitest';
import { shouldRenderSolarWolfBadge, solarWolfBadgePolicy } from '../../src/rendering/solarWolfBadge';

describe('Solar Wolf badge policy', () => {
  it('renders only when the selected core is Solar Wolf and the layer is enabled', () => {
    expect(shouldRenderSolarWolfBadge('core_solar_wolf', true)).toBe(true);
    expect(shouldRenderSolarWolfBadge('core_solar_wolf', false)).toBe(false);
    expect(shouldRenderSolarWolfBadge('core_void_falcon', true)).toBe(false);
  });

  it('stays within the approved 8 mm Core safe radius', () => {
    expect(solarWolfBadgePolicy.radiusM).toBeLessThan(0.008);
    expect(solarWolfBadgePolicy.topOffsetM).toBeGreaterThan(0);
  });

  it('has a bounded attachment cost', () => {
    expect(solarWolfBadgePolicy.additionalDrawCalls).toBe(1);
    expect(solarWolfBadgePolicy.additionalTextures).toBe(1);
  });
});
