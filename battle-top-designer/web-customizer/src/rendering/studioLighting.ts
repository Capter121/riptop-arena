export interface StudioDirectionalLight {
  type: 'directional';
  color: string;
  intensity: number;
  position: readonly [number, number, number];
  enabled: boolean;
}

export interface StudioLightingProfile {
  ambientIntensity: number;
  hemisphere: { enabled: boolean; skyColor: string; groundColor: string; intensity: number };
  key: StudioDirectionalLight;
  fill: StudioDirectionalLight;
  rim: StudioDirectionalLight;
  shadows: false;
}

export const studioLightingProfiles: Record<'editing' | 'low' | 'medium' | 'high', StudioLightingProfile> = {
  editing: {
    ambientIntensity: 1.6,
    hemisphere: { enabled: true, skyColor: '#c9ddff', groundColor: '#211d2b', intensity: 1.8 },
    key: { type: 'directional', color: '#fff1d2', intensity: 3.2, position: [0.12, 0.16, 0.1], enabled: true },
    fill: { type: 'directional', color: '#8bb8ff', intensity: 1.8, position: [-0.1, 0.04, -0.12], enabled: true },
    rim: { type: 'directional', color: '#8bd8ff', intensity: 0, position: [-0.08, 0.11, 0.14], enabled: false },
    shadows: false,
  },
  low: {
    ambientIntensity: 1.45,
    hemisphere: { enabled: false, skyColor: '#c9ddff', groundColor: '#211d2b', intensity: 0 },
    key: { type: 'directional', color: '#fff0d4', intensity: 2.35, position: [0.12, 0.16, 0.1], enabled: true },
    fill: { type: 'directional', color: '#9bc8ff', intensity: 0.72, position: [-0.1, 0.04, -0.12], enabled: true },
    rim: { type: 'directional', color: '#9de9ff', intensity: 0, position: [-0.08, 0.11, 0.14], enabled: false },
    shadows: false,
  },
  medium: {
    ambientIntensity: 1.25,
    hemisphere: { enabled: true, skyColor: '#c9ddff', groundColor: '#211d2b', intensity: 1.05 },
    key: { type: 'directional', color: '#fff0d4', intensity: 2.7, position: [0.12, 0.16, 0.1], enabled: true },
    fill: { type: 'directional', color: '#9bc8ff', intensity: 1.05, position: [-0.1, 0.04, -0.12], enabled: true },
    rim: { type: 'directional', color: '#8ee5ff', intensity: 0.82, position: [-0.08, 0.11, 0.14], enabled: true },
    shadows: false,
  },
  high: {
    ambientIntensity: 1.2,
    hemisphere: { enabled: true, skyColor: '#c9ddff', groundColor: '#211d2b', intensity: 1.1 },
    key: { type: 'directional', color: '#fff0d4', intensity: 2.8, position: [0.12, 0.16, 0.1], enabled: true },
    fill: { type: 'directional', color: '#9bc8ff', intensity: 1.12, position: [-0.1, 0.04, -0.12], enabled: true },
    rim: { type: 'directional', color: '#8ee5ff', intensity: 1.05, position: [-0.08, 0.11, 0.14], enabled: true },
    shadows: false,
  },
};

export function resolveStudioLighting(lowPerformance: boolean, showcaseEnabled: boolean) {
  if (!showcaseEnabled) return lowPerformance
    ? { ...studioLightingProfiles.editing, ambientIntensity: 1.9, hemisphere: { ...studioLightingProfiles.editing.hemisphere, enabled: false } }
    : studioLightingProfiles.editing;
  return lowPerformance ? studioLightingProfiles.low : studioLightingProfiles.medium;
}
