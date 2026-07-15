// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { enumerateCombinations, stormAttack } from '../../src/domain';
import { useCustomizer } from '../../src/store';

describe('customizer store and local persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    useCustomizer.getState().reset();
  });

  it('updates the correct family and focus state', () => {
    useCustomizer.getState().selectPart('gear_high');
    expect(useCustomizer.getState().combination.gear).toBe('gear_high');
    expect(useCustomizer.getState().focus).toBe('gear');
    expect(useCustomizer.getState().cameraPreset).toBe('side');
  });

  it('saves and restores a valid versioned combination', () => {
    useCustomizer.getState().selectPart('core_void_falcon');
    useCustomizer.getState().save();
    useCustomizer.getState().reset();
    expect(useCustomizer.getState().restoreSaved()).toBe(true);
    expect(useCustomizer.getState().combination.core).toBe('core_void_falcon');
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
});
