// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { Group, Object3D } from '../../../../node_modules/three/build/three.module.js';
import { DEFAULT_NSS_COMBINATION_ID, NssLoadoutController } from '../../../../src/nss/loadoutController';
import { NSS_FAMILIES } from '../../../../src/nss/types';

function sourceFor(partId) {
  const root = new Group();
  const top = new Object3D(); top.name = `MOUNT_${partId}_TOP`; top.position.y = 0.002; top.userData.interface_id = 'NSS-V1';
  const bottom = new Object3D(); bottom.name = `MOUNT_${partId}_BOTTOM`; bottom.position.y = -0.002; bottom.userData.interface_id = 'NSS-V1';
  root.add(top, bottom);
  return root;
}

describe('NSS TopEntity vertical slice', () => {
  it('accepts only the approved default URL in Stage 5', () => {
    const controller = new NssLoadoutController({});
    expect(controller.resolveVerticalSlice('')).toEqual({ kind: 'none' });
    expect(controller.resolveVerticalSlice(`?combo=${DEFAULT_NSS_COMBINATION_ID}&loadoutVersion=1`)).toMatchObject({ kind: 'ready' });
    expect(controller.resolveVerticalSlice('?combo=nss-p2c-0001&loadoutVersion=1')).toMatchObject({ kind: 'unsupported' });
    expect(controller.resolveVerticalSlice(`?combo=${DEFAULT_NSS_COMBINATION_ID}&loadoutVersion=2`)).toMatchObject({ kind: 'unsupported' });
  });

  it('waits for all five cached parts before returning an NSS battle top', async () => {
    const gradient = { addColorStop: vi.fn() };
    const context = {
      createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(new Proxy(context, {
      get: (target, property) => target[property] ?? vi.fn(),
      set: (target, property, value) => { target[property] = value; return true; },
    }));
    const loadAsync = vi.fn(async url => {
      const partId = url.split('/').at(-1).replace('.glb', '');
      return { scene: sourceFor(partId) };
    });
    const { NssModelCache } = await import('../../../../src/nss/modelCache');
    const controller = new NssLoadoutController(new NssModelCache({ loadAsync }, '/models'));
    const request = controller.resolveVerticalSlice(`?combo=${DEFAULT_NSS_COMBINATION_ID}&loadoutVersion=1`);
    const top = await controller.createTop('player', request.loadout, { attack: 1, defense: 2, stamina: 3 });
    expect(loadAsync).toHaveBeenCalledTimes(5);
    expect(top.playerBuild.kind).toBe('nss-v1');
    expect(top.hasNssVisual()).toBe(true);
    expect(top.collisionRadius).toBe(0.83);
    expect(top.stats.attack).toBe(10);
    expect(top.mesh.getObjectByName('NSS_BATTLE_TOP')).toBeTruthy();
    expect(NSS_FAMILIES.every(family => top.mesh.getObjectByName(`NSS_${family.toUpperCase()}`))).toBe(true);
    top.syncMesh(1, 0, 1 / 60);
    expect(top.getVisualRotationAngles().ring).toBeGreaterThan(0);
    expect(top.mesh.getObjectByName('NSS_BATTLE_TOP').rotation.y).toBe(top.getVisualRotationAngles().core);
    const [{ TopEntity }, { DEFAULT_BUILD }, { calculateTurnDamage }] = await Promise.all([
      import('../../../../src/gameplay/top'),
      import('../../../../src/data/parts'),
      import('../../../../src/gameplay/damage'),
    ]);
    const enemy = new TopEntity('enemy', DEFAULT_BUILD);
    const damage = calculateTurnDamage({
      attacker: top, defender: enemy, skillTier: 2, isCounter: false, isClash: false, isBlockOrMiss: false, random: () => 0.99,
    });
    expect(damage.finalDamage).toBeGreaterThan(0);
    top.detachNssVisual();
    expect(top.hasNssVisual()).toBe(false);
  });
});
