// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { stormAttack } from '../../src/domain';
import { useCustomizer } from '../../src/store';

describe('successful combination history', () => {
  beforeEach(() => {
    localStorage.clear();
    useCustomizer.getState().hydrate('', null);
    useCustomizer.getState().setLoadState('ready');
  });

  it('commits only after ready and supports undo and redo', () => {
    useCustomizer.getState().selectPart('blade_orbit_halo');
    expect(useCustomizer.getState().canUndo).toBe(false);
    useCustomizer.getState().setLoadState('ready');
    expect(useCustomizer.getState().canUndo).toBe(true);
    useCustomizer.getState().undo();
    expect(useCustomizer.getState().combination).toEqual(stormAttack);
    useCustomizer.getState().setLoadState('ready');
    expect(useCustomizer.getState().canRedo).toBe(true);
    useCustomizer.getState().redo();
    expect(useCustomizer.getState().combination.blade).toBe('blade_orbit_halo');
  });

  it('coalesces rapid switches and excludes failed loads', () => {
    useCustomizer.getState().selectPart('blade_orbit_halo');
    useCustomizer.getState().selectPart('blade_iron_bastion');
    useCustomizer.getState().setLoadState('ready');
    useCustomizer.getState().undo();
    expect(useCustomizer.getState().combination).toEqual(stormAttack);
    useCustomizer.getState().setLoadState('ready');
    useCustomizer.getState().selectPart('blade_dual_comet');
    useCustomizer.getState().setLoadState('error', 'fixture failure');
    expect(useCustomizer.getState().canUndo).toBe(false);
  });

  it('clears redo after a successful branch and caps history at 50', () => {
    for (let index = 0; index < 55; index += 1) {
      useCustomizer.getState().selectPart(index % 2 ? 'blade_orbit_halo' : 'blade_iron_bastion');
      useCustomizer.getState().setLoadState('ready');
    }
    expect(useCustomizer.getState().historyDepth).toBe(50);
    useCustomizer.getState().undo();
    useCustomizer.getState().setLoadState('ready');
    expect(useCustomizer.getState().canRedo).toBe(true);
    useCustomizer.getState().selectPart('blade_dual_comet');
    useCustomizer.getState().setLoadState('ready');
    expect(useCustomizer.getState().canRedo).toBe(false);
  });
});
