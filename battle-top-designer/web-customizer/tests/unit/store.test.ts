// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultAffinities, enumerateCombinations, stormAttack } from '../../src/domain';
import { useCustomizer } from '../../src/store';

describe('customizer store and local persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    useCustomizer.getState().reset();
    useCustomizer.getState().setSolarWolfBadgeEnabled(true);
    useCustomizer.getState().setStormFangPatternEnabled(true);
    useCustomizer.getState().setVoidFalconBadgeEnabled(true);
    useCustomizer.getState().setIronBastionPatternEnabled(true);
    useCustomizer.getState().setOrbitHaloPatternEnabled(true);
    useCustomizer.getState().setDualCometPatternEnabled(true);
    useCustomizer.getState().setShowcaseEnabled(false);
    useCustomizer.getState().setShowcaseCameraPreset('hero');
    useCustomizer.getState().setTurntableSpeed('slow');
  });

  it('updates the correct family and focus state', () => {
    useCustomizer.getState().selectPart('gear_high');
    expect(useCustomizer.getState().combination.gear).toBe('gear_high');
    expect(useCustomizer.getState().focusState.target).toBe('gear');
    expect(useCustomizer.getState().cameraPreset).toBe('side');
  });

  it('saves and restores a valid versioned combination', () => {
    useCustomizer.getState().selectPart('core_void_falcon');
    useCustomizer.getState().setAffinity('core', 'DARK');
    useCustomizer.getState().setAffinity('blade', 'DARK');
    useCustomizer.getState().save();
    const saved = JSON.parse(localStorage.getItem('nova-spin:phase3a:combination:v1')!);
    expect(saved).toEqual({
      schemaVersion: 2,
      combination: useCustomizer.getState().combination,
      affinities: useCustomizer.getState().affinities,
    });
    expect(saved.affinityProfile).toBeUndefined();
    useCustomizer.getState().reset();
    expect(useCustomizer.getState().restoreSaved()).toBe(true);
    expect(useCustomizer.getState().combination.core).toBe('core_void_falcon');
    expect(useCustomizer.getState().affinities).toMatchObject({ core: 'DARK', blade: 'DARK' });
  });

  it('migrates a V1 local combination to defaults and derives profiles from affinity changes', () => {
    const target = { ...stormAttack, core: 'core_void_falcon' };
    localStorage.setItem('nova-spin:phase3a:combination:v1', JSON.stringify({ schemaVersion: 1, combination: target }));
    expect(useCustomizer.getState().restoreSaved()).toBe(true);
    expect(useCustomizer.getState().affinities).toEqual(defaultAffinities(target));

    for (const family of ['core', 'blade', 'assist', 'gear', 'tip'] as const) {
      useCustomizer.getState().setAffinity(family, 'WOOD');
    }
    expect(useCustomizer.getState().affinityProfile).toMatchObject({
      primary: 'WOOD',
      resonance: { kind: 'offense', count: 5, bonus: 0.15 },
    });
  });

  it('hydrates V2 affinities and rejects invalid saved affinity data', () => {
    const saved = JSON.stringify({
      schemaVersion: 2,
      combination: stormAttack,
      affinities: { core: 'LIGHT', blade: 'WIND', assist: 'FIRE', gear: 'WATER', tip: 'WOOD' },
    });
    useCustomizer.getState().hydrate('', saved);
    expect(useCustomizer.getState().affinities.tip).toBe('WOOD');

    const invalid = saved.replace('WOOD', 'ICE');
    localStorage.setItem('nova-spin:phase3a:combination:v1', invalid);
    expect(useCustomizer.getState().restoreSaved()).toBe(false);
    expect(useCustomizer.getState().affinities.tip).toBe('WOOD');
    useCustomizer.getState().hydrate('', invalid);
    expect(useCustomizer.getState().affinities).toEqual(defaultAffinities(stormAttack));
  });

  it('rejects malformed local data without changing the default', () => {
    localStorage.setItem('nova-spin:phase3a:combination:v1', '{broken');
    expect(useCustomizer.getState().restoreSaved()).toBe(false);
    expect(useCustomizer.getState().combination).toEqual(stormAttack);
  });

  it('hydrates from URL before local storage and exposes invalid URL recovery state', () => {
    const target = enumerateCombinations()[10];
    localStorage.setItem('nova-spin:phase3a:combination:v1', JSON.stringify({ schemaVersion: 1, combination: target }));
    useCustomizer.getState().hydrate('?combo=nss-p2c-0138&test=1');
    expect(useCustomizer.getState()).toMatchObject({ combination: stormAttack, startupNotice: null, testMode: true });
    useCustomizer.getState().hydrate('?combo=INVALID');
    expect(useCustomizer.getState()).toMatchObject({ combination: stormAttack, startupNotice: 'Invalid share link. Storm Attack was restored.', testMode: false });
  });

  it('tracks monotonic loading progress and persists low-performance mode', () => {
    useCustomizer.getState().hydrate('', null);
    useCustomizer.getState().setLoadProgress(40);
    useCustomizer.getState().setLoadProgress(25);
    expect(useCustomizer.getState().loadProgress).toBe(40);
    useCustomizer.getState().selectPart('blade_orbit_halo');
    expect(useCustomizer.getState().loadProgress).toBe(10);
    useCustomizer.getState().setLoadState('ready');
    expect(useCustomizer.getState().loadProgress).toBe(100);
    useCustomizer.getState().setLowPerformance(true);
    expect(localStorage.getItem('nova-spin:phase3b:low-performance:v1')).toBe('true');
  });

  it('keeps each identity toggle independent across part selection', () => {
    useCustomizer.getState().setVoidFalconBadgeEnabled(false);
    useCustomizer.getState().setOrbitHaloPatternEnabled(false);
    useCustomizer.getState().selectPart('core_void_falcon');
    useCustomizer.getState().selectPart('blade_orbit_halo');
    expect(useCustomizer.getState()).toMatchObject({
      voidFalconBadgeEnabled: false,
      orbitHaloPatternEnabled: false,
      solarWolfBadgeEnabled: true,
      stormFangPatternEnabled: true,
      ironBastionPatternEnabled: true,
      dualCometPatternEnabled: true,
    });
  });

  it('keeps Showcase state independent from the selected parts, identities, and exploded state', () => {
    useCustomizer.getState().selectPart('core_void_falcon');
    useCustomizer.getState().setExploded(true);
    useCustomizer.getState().setVoidFalconBadgeEnabled(false);
    const before = useCustomizer.getState();
    useCustomizer.getState().setShowcaseEnabled(true);
    useCustomizer.getState().setShowcaseCameraPreset('exploded');
    expect(useCustomizer.getState()).toMatchObject({
      showcaseEnabled: true,
      showcaseCameraPreset: 'exploded',
      turntableEnabled: false,
      combination: before.combination,
      exploded: true,
      voidFalconBadgeEnabled: false,
    });
  });

  it('stops the turntable when Showcase closes', () => {
    useCustomizer.getState().setShowcaseEnabled(true);
    useCustomizer.getState().setTurntableEnabled(true);
    expect(useCustomizer.getState().turntableEnabled).toBe(true);
    useCustomizer.getState().setShowcaseEnabled(false);
    expect(useCustomizer.getState()).toMatchObject({ showcaseEnabled: false, turntableEnabled: false });
  });
});
