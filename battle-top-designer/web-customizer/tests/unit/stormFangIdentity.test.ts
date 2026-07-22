import { describe, expect, it } from 'vitest';
import { shouldRenderSolarWolfBadge } from '../../src/rendering/solarWolfBadge';
import { shouldRenderStormFangPattern, stormFangIdentityPolicy } from '../../src/rendering/stormFangIdentity';

describe('Storm Fang identity policy', () => {
  it('renders only for the selected Storm Fang blade while enabled', () => {
    expect(shouldRenderStormFangPattern('blade_storm_fang', true)).toBe(true);
    expect(shouldRenderStormFangPattern('blade_storm_fang', false)).toBe(false);
    expect(shouldRenderStormFangPattern('blade_dual_comet', true)).toBe(false);
  });

  it('uses three bounded top-surface sectors without touching the Core or attack edge', () => {
    expect(stormFangIdentityPolicy.sectorStarts).toHaveLength(3);
    expect(stormFangIdentityPolicy.innerRadiusM).toBeGreaterThanOrEqual(0.018);
    expect(stormFangIdentityPolicy.outerRadiusM).toBeLessThan(0.032);
    expect(stormFangIdentityPolicy.topSurfaceYM).toBeGreaterThan(0);
  });

  it('shares one texture and material while bounding the draw-call cost', () => {
    expect(stormFangIdentityPolicy.additionalDrawCalls).toBe(3);
    expect(stormFangIdentityPolicy.additionalTextures).toBe(1);
    expect(stormFangIdentityPolicy.additionalMaterials).toBe(1);
  });

  it('leaves GLB content untouched and declares the unmount disposal boundary', () => {
    expect(stormFangIdentityPolicy.mutatesGlb).toBe(false);
    expect(stormFangIdentityPolicy.disposeGeometryOnUnmount).toBe(true);
    expect(stormFangIdentityPolicy.disposeMaterialOnUnmount).toBe(true);
    expect(stormFangIdentityPolicy.disposeTextureOnUnmount).toBe(false);
  });

  it('does not couple the Storm pattern toggle to the Solar badge toggle', () => {
    expect(shouldRenderSolarWolfBadge('core_solar_wolf', true)).toBe(true);
    expect(shouldRenderStormFangPattern('blade_storm_fang', false)).toBe(false);
  });
});
