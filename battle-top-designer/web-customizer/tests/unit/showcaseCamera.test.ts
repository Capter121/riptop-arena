import { describe, expect, it } from 'vitest';
import { cameraTransitionProgress, easeOutQuad, showcaseCameraPresets } from '../../src/rendering/showcaseCamera';

describe('showcase camera presets', () => {
  it('defines four finite camera targets with a deterministic transition', () => {
    expect(Object.keys(showcaseCameraPresets)).toEqual(['hero', 'top', 'side', 'exploded']);
    for (const preset of Object.values(showcaseCameraPresets)) {
      expect([...preset.position, ...preset.target].every(Number.isFinite)).toBe(true);
      expect(preset.durationMs).toBeGreaterThanOrEqual(250);
      expect(preset.durationMs).toBeLessThanOrEqual(400);
    }
  });

  it('keeps Hero distinct from Top and gives Exploded the more distant product view', () => {
    expect(showcaseCameraPresets.hero.position).not.toEqual(showcaseCameraPresets.top.position);
    const length = (value: readonly number[]) => Math.hypot(...value);
    expect(length(showcaseCameraPresets.exploded.position)).toBeGreaterThan(length(showcaseCameraPresets.hero.position));
  });

  it('reaches exact transition endpoints without requiring another Camera instance', () => {
    expect(cameraTransitionProgress(0, 320)).toBe(0);
    expect(cameraTransitionProgress(320, 320)).toBe(1);
    expect(cameraTransitionProgress(800, 320)).toBe(1);
    expect(easeOutQuad(0)).toBe(0);
    expect(easeOutQuad(1)).toBe(1);
  });
});
