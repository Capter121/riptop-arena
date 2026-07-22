import { describe, expect, it } from 'vitest';
import { resolveStudioLighting, studioLightingProfiles } from '../../src/rendering/studioLighting';

describe('studio lighting policy', () => {
  it('defines finite, non-negative Key / Fill / Rim parameters for every quality tier', () => {
    for (const profile of Object.values(studioLightingProfiles)) {
      expect(profile.key.intensity).toBeGreaterThan(profile.fill.intensity);
      expect(profile.shadows).toBe(false);
      for (const light of [profile.key, profile.fill, profile.rim]) {
        expect(Number.isFinite(light.intensity)).toBe(true);
        expect(light.intensity).toBeGreaterThanOrEqual(0);
        expect(light.position.every(Number.isFinite)).toBe(true);
      }
    }
  });

  it('uses a reduced low-performance showcase rig and preserves the editing rig when disabled', () => {
    expect(resolveStudioLighting(true, true)).toBe(studioLightingProfiles.low);
    expect(resolveStudioLighting(false, true)).toBe(studioLightingProfiles.medium);
    expect(resolveStudioLighting(false, false)).toBe(studioLightingProfiles.editing);
    expect(studioLightingProfiles.low.rim.enabled).toBe(false);
    expect(studioLightingProfiles.high.rim.intensity).toBeGreaterThan(studioLightingProfiles.medium.rim.intensity);
  });
});
