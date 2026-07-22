import { describe, expect, it } from 'vitest';
import { resolveStudioQuality, studioQualityProfiles } from '../../src/rendering/qualityPolicy';

describe('studio quality policy', () => {
  it('caps the low-performance renderer at one device pixel ratio', () => {
    expect(resolveStudioQuality(true)).toEqual(studioQualityProfiles.low);
    expect(resolveStudioQuality(true).pixelRatio).toBe(1);
  });

  it('keeps the default renderer within the medium DPR cap', () => {
    expect(resolveStudioQuality(false)).toEqual(studioQualityProfiles.medium);
    expect(resolveStudioQuality(false).pixelRatio).toEqual([1, 1.5]);
  });

  it('declares a bounded high profile without enabling shadows', () => {
    expect(studioQualityProfiles.high.pixelRatio).toEqual([1, 2]);
    expect(Object.values(studioQualityProfiles).every(profile => profile.shadows === false)).toBe(true);
  });
});
