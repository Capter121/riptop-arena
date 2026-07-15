import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Object3D, Vector3 } from 'three';
import { assembleMatrices } from '../../src/assembly';
import { catalog, stormAttack, type Family } from '../../src/domain';

function glbJson(path: string) {
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 4).toString('ascii')).toBe('glTF');
  expect(bytes.length).toBeGreaterThan(20);
  const jsonLength = bytes.readUInt32LE(12);
  expect(bytes.readUInt32LE(16)).toBe(0x4e4f534a);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trim());
}

describe('protected GLB assets', () => {
  it('contains all 16 valid GLBs and required mounts without colliders', () => {
    for (const part of catalog) {
      const document = glbJson(resolve(__dirname, `../../../public/models/parts/${part.id}.glb`));
      const names = document.nodes.map((node: { name?: string }) => node.name ?? '');
      expect(names).toContain(`MOUNT_${part.id}_TOP`);
      expect(names).toContain(`MOUNT_${part.id}_BOTTOM`);
      expect(names.some((name: string) => name.startsWith('COLLIDER_'))).toBe(false);
    }
  });

  it('aligns adjacent mount matrices while preserving the upper root', () => {
    const scenes = {} as Record<Family, Object3D>;
    for (const [index, family] of (['core', 'blade', 'assist', 'gear', 'tip'] as Family[]).entries()) {
      const root = new Object3D();
      const id = stormAttack[family];
      const top = new Object3D(); top.name = `MOUNT_${id}_TOP`; top.position.y = 0.002 + index * 0.0001; top.userData.interface_id = 'NSS-V1';
      const bottom = new Object3D(); bottom.name = `MOUNT_${id}_BOTTOM`; bottom.position.y = -0.002 - index * 0.0001; bottom.userData.interface_id = 'NSS-V1';
      root.add(top, bottom); scenes[family] = root;
    }
    const matrices = assembleMatrices(scenes, stormAttack);
    expect(matrices.core.equals(new Object3D().matrix)).toBe(true);
    for (const family of ['blade', 'assist', 'gear', 'tip'] as Family[]) {
      expect(new Vector3().setFromMatrixPosition(matrices[family]).y).toBeLessThan(0);
    }
  });
});
