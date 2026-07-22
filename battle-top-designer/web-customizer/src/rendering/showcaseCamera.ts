import type { ShowcaseCameraPreset } from './showcasePolicy';

export interface ShowcaseCameraDefinition {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  durationMs: number;
  easing: 'easeOutQuad';
}

export const showcaseCameraPresets: Record<ShowcaseCameraPreset, ShowcaseCameraDefinition> = {
  hero: { position: [0.118, 0.092, 0.118], target: [0, -0.008, 0], durationMs: 320, easing: 'easeOutQuad' },
  top: { position: [0, 0.175, 0.001], target: [0, -0.012, 0], durationMs: 280, easing: 'easeOutQuad' },
  side: { position: [0.178, 0.018, 0.072], target: [0, -0.014, 0], durationMs: 300, easing: 'easeOutQuad' },
  exploded: { position: [0.145, 0.12, 0.145], target: [0, -0.012, 0], durationMs: 360, easing: 'easeOutQuad' },
};

export function easeOutQuad(progress: number) {
  const clamped = Math.min(1, Math.max(0, progress));
  return clamped * (2 - clamped);
}

export function cameraTransitionProgress(elapsedMs: number, durationMs: number) {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(durationMs) || durationMs <= 0) return 1;
  return Math.min(1, Math.max(0, elapsedMs / durationMs));
}
