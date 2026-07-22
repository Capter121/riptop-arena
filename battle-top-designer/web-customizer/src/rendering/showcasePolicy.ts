export type ShowcaseCameraPreset = 'hero' | 'top' | 'side' | 'exploded';
export type TurntableSpeed = 'slow' | 'normal';

export const showcasePolicy = {
  cameraTransitionDurationMs: 320,
  turntableRadiansPerSecond: {
    slow: 0.16,
    normal: 0.32,
  },
} as const;

export function turntableRotationDelta(enabled: boolean, interacting: boolean, speed: TurntableSpeed, deltaSeconds: number) {
  if (!enabled || interacting || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return 0;
  return showcasePolicy.turntableRadiansPerSecond[speed] * deltaSeconds;
}
