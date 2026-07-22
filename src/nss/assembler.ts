import { Group, Matrix4, Object3D } from 'three';
import { NSS_FAMILIES, type NssBattleLoadoutV1, type NssFamily } from './types';

export const NSS_ARENA_VISUAL_SCALE = 20;

function mount(scene: Object3D, id: string, role: 'TOP' | 'BOTTOM'): Object3D {
  scene.updateMatrixWorld(true);
  const object = scene.getObjectByName(`MOUNT_${id}_${role}`);
  if (!object) throw new Error(`Missing MOUNT_${id}_${role}`);
  if (object.userData.interface_id !== 'NSS-V1') throw new Error(`Wrong interface on ${object.name}`);
  return object;
}

export function nssAssemblyMatrices(
  scenes: Record<NssFamily, Object3D>,
  loadout: NssBattleLoadoutV1,
): Record<NssFamily, Matrix4> {
  const matrices = Object.fromEntries(NSS_FAMILIES.map(family => [family, new Matrix4()])) as Record<NssFamily, Matrix4>;
  for (let index = 1; index < NSS_FAMILIES.length; index += 1) {
    const upper = NSS_FAMILIES[index - 1];
    const lower = NSS_FAMILIES[index];
    const upperBottom = mount(scenes[upper], loadout.combination[upper], 'BOTTOM').matrixWorld.clone();
    const lowerTopInverse = mount(scenes[lower], loadout.combination[lower], 'TOP').matrixWorld.clone().invert();
    matrices[lower].copy(matrices[upper]).multiply(upperBottom).multiply(lowerTopInverse);
  }
  return matrices;
}

export type NssAssembly = {
  root: Group;
  parts: Record<NssFamily, Group>;
  blade: Group;
};

export function assembleNssScenes(
  scenes: Record<NssFamily, Object3D>,
  loadout: NssBattleLoadoutV1,
): NssAssembly {
  const matrices = nssAssemblyMatrices(scenes, loadout);
  const root = new Group();
  root.name = 'NSS_BATTLE_TOP';
  root.scale.setScalar(NSS_ARENA_VISUAL_SCALE);
  const parts = {} as Record<NssFamily, Group>;
  for (const family of NSS_FAMILIES) {
    const group = new Group();
    group.name = `NSS_${family.toUpperCase()}`;
    group.matrix.copy(matrices[family]);
    group.matrixAutoUpdate = false;
    group.add(scenes[family]);
    root.add(group);
    parts[family] = group;
  }
  return { root, parts, blade: parts.blade };
}
