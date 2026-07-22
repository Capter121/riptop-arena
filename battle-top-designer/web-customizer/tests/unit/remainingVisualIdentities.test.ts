import { describe, expect, it } from 'vitest';
import { shouldRenderSolarWolfBadge } from '../../src/rendering/solarWolfBadge';
import { shouldRenderStormFangPattern } from '../../src/rendering/stormFangIdentity';
import {
  dualCometIdentityPolicy, ironBastionIdentityPolicy, orbitHaloIdentityPolicy,
  shouldRenderDualCometPattern, shouldRenderIronBastionPattern, shouldRenderOrbitHaloPattern,
  shouldRenderVoidFalconBadge, voidFalconBadgePolicy,
} from '../../src/rendering/remainingVisualIdentities';

describe('remaining visual identity policies', () => {
  it('attaches each new identity only to its approved part while enabled', () => {
    expect(shouldRenderVoidFalconBadge('core_void_falcon', true)).toBe(true);
    expect(shouldRenderVoidFalconBadge('core_solar_wolf', true)).toBe(false);
    expect(shouldRenderVoidFalconBadge('core_void_falcon', false)).toBe(false);
    expect(shouldRenderIronBastionPattern('blade_iron_bastion', true)).toBe(true);
    expect(shouldRenderOrbitHaloPattern('blade_orbit_halo', true)).toBe(true);
    expect(shouldRenderDualCometPattern('blade_dual_comet', true)).toBe(true);
    expect(shouldRenderDualCometPattern('blade_storm_fang', true)).toBe(false);
  });

  it('preserves the approved mesh, draw-call, and shared-resource budgets', () => {
    expect(voidFalconBadgePolicy.meshBudget).toBe(1);
    expect(voidFalconBadgePolicy.drawCallBudget).toBe(1);
    expect(ironBastionIdentityPolicy.meshBudget).toBe(3);
    expect(orbitHaloIdentityPolicy.layerType).toBe('blade-ring');
    expect(orbitHaloIdentityPolicy.drawCallBudget).toBe(1);
    expect(dualCometIdentityPolicy.rotationOffsetsRadians).toEqual([0, Math.PI * 2 / 3, Math.PI * 4 / 3]);
  });

  it('keeps the existing Solar and Storm identities independent', () => {
    expect(shouldRenderSolarWolfBadge('core_solar_wolf', true)).toBe(true);
    expect(shouldRenderStormFangPattern('blade_storm_fang', true)).toBe(true);
    expect(shouldRenderVoidFalconBadge('core_void_falcon', false)).toBe(false);
    expect(shouldRenderIronBastionPattern('blade_iron_bastion', false)).toBe(false);
  });
});
