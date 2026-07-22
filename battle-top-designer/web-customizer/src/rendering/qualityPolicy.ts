export type StudioQualityTier = 'low' | 'medium' | 'high';

export interface StudioQualityProfile {
  tier: StudioQualityTier;
  pixelRatio: number | [number, number];
  antialias: boolean;
  shadows: false;
  environmentIntensity: number;
}

export const studioQualityProfiles: Record<StudioQualityTier, StudioQualityProfile> = {
  low: { tier: 'low', pixelRatio: 1, antialias: false, shadows: false, environmentIntensity: 0.78 },
  medium: { tier: 'medium', pixelRatio: [1, 1.5], antialias: true, shadows: false, environmentIntensity: 0.92 },
  high: { tier: 'high', pixelRatio: [1, 2], antialias: true, shadows: false, environmentIntensity: 1 },
};

export function resolveStudioQuality(lowPerformance: boolean): StudioQualityProfile {
  return lowPerformance ? studioQualityProfiles.low : studioQualityProfiles.medium;
}
