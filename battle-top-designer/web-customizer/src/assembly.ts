import { Matrix4, Object3D } from 'three';
import { families, type Combination, type Family } from './domain';

function mount(scene: Object3D, id: string, role: 'TOP' | 'BOTTOM'): Object3D {
  scene.updateMatrixWorld(true);
  const object = scene.getObjectByName(`MOUNT_${id}_${role}`);
  if (!object) throw new Error(`Missing MOUNT_${id}_${role}`);
  if (object.userData.interface_id !== 'NSS-V1') throw new Error(`Wrong interface on ${object.name}`);
  return object;
}

export function assembleMatrices(scenes: Record<Family, Object3D>, combination: Combination): Record<Family, Matrix4> {
  const result = { core: new Matrix4(), blade: new Matrix4(), assist: new Matrix4(), gear: new Matrix4(), tip: new Matrix4() };
  for (let index = 1; index < families.length; index += 1) {
    const upper = families[index - 1];
    const lower = families[index];
    const upperMount = mount(scenes[upper], combination[upper], 'BOTTOM').matrixWorld.clone();
    const lowerMountInverse = mount(scenes[lower], combination[lower], 'TOP').matrixWorld.clone().invert();
    result[lower].copy(result[upper]).multiply(upperMount).multiply(lowerMountInverse);
  }
  return result;
}
