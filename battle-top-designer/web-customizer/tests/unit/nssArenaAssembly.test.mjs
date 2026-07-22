import { describe, expect, it, vi } from 'vitest';
import {
  BufferGeometry, Group, Mesh, MeshBasicMaterial, Object3D, Vector3,
} from '../../../../node_modules/three/build/three.module.js';
import { assembleNssScenes, NSS_ARENA_VISUAL_SCALE } from '../../../../src/nss/assembler';
import { destroyNssBattleTopVisual } from '../../../../src/nss/battleTopVisual';
import { NssModelCache } from '../../../../src/nss/modelCache';
import { createNssBattleLoadout } from '../../../../src/nss/loadout';
import { NSS_FAMILIES } from '../../../../src/nss/types';

const loadout = createNssBattleLoadout({
  core: 'core_solar_wolf', blade: 'blade_storm_fang', assist: 'assist_heavy', gear: 'gear_low', tip: 'tip_flat_attack',
});

function scenes() {
  return Object.fromEntries(NSS_FAMILIES.map((family, index) => {
    const root = new Group();
    const id = loadout.combination[family];
    const top = new Object3D();
    top.name = `MOUNT_${id}_TOP`; top.position.y = 0.002 + index * 0.0001; top.userData.interface_id = 'NSS-V1';
    const bottom = new Object3D();
    bottom.name = `MOUNT_${id}_BOTTOM`; bottom.position.y = -0.002 - index * 0.0001; bottom.userData.interface_id = 'NSS-V1';
    root.add(top, bottom);
    return [family, root];
  }));
}

describe('NSS Arena model assembly', () => {
  it('aligns all adjacent NSS-V1 mounts and exposes stable part groups', () => {
    const assembly = assembleNssScenes(scenes(), loadout);
    assembly.root.updateMatrixWorld(true);
    expect(assembly.root.scale.x).toBe(NSS_ARENA_VISUAL_SCALE);
    expect(assembly.blade).toBe(assembly.parts.blade);
    for (let index = 1; index < NSS_FAMILIES.length; index += 1) {
      const upper = NSS_FAMILIES[index - 1];
      const lower = NSS_FAMILIES[index];
      const upperMount = assembly.parts[upper].getObjectByName(`MOUNT_${loadout.combination[upper]}_BOTTOM`);
      const lowerMount = assembly.parts[lower].getObjectByName(`MOUNT_${loadout.combination[lower]}_TOP`);
      expect(upperMount.getWorldPosition(new Vector3()).distanceTo(lowerMount.getWorldPosition(new Vector3()))).toBeLessThan(1e-9);
    }
  });

  it('rejects missing mounts and wrong interfaces before battle use', () => {
    const missing = scenes();
    missing.blade.remove(missing.blade.getObjectByName('MOUNT_blade_storm_fang_TOP'));
    expect(() => assembleNssScenes(missing, loadout)).toThrow('Missing MOUNT_blade_storm_fang_TOP');
    const wrong = scenes();
    wrong.core.getObjectByName('MOUNT_core_solar_wolf_BOTTOM').userData.interface_id = 'OTHER';
    expect(() => assembleNssScenes(wrong, loadout)).toThrow('Wrong interface');
  });

  it('deduplicates loads, clones instance transforms, and keeps cache resources alive until cache disposal', async () => {
    const geometry = new BufferGeometry();
    const material = new MeshBasicMaterial();
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const source = new Group(); source.add(new Mesh(geometry, material));
    const loader = { loadAsync: vi.fn(async () => ({ scene: source })) };
    const cache = new NssModelCache(loader, '/test-models');
    const first = await cache.instantiate('core_solar_wolf');
    const second = await cache.instantiate('core_solar_wolf');
    first.position.x = 5;
    expect(second.position.x).toBe(0);
    expect(loader.loadAsync).toHaveBeenCalledTimes(1);
    expect(first.children[0].geometry).toBe(geometry);
    const assembly = { root: new Group(), parts: {}, blade: new Group() };
    assembly.root.add(first);
    destroyNssBattleTopVisual(assembly);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    await cache.dispose();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });
});
