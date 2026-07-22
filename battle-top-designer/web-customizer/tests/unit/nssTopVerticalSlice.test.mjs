// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { Group, Object3D } from '../../../../node_modules/three/build/three.module.js';
import { DEFAULT_NSS_COMBINATION_ID, NssLoadoutController } from '../../../../src/nss/loadoutController';
import { NSS_FAMILIES } from '../../../../src/nss/types';
import { createNssBattleLoadout, enumerateNssCombinations, nssCombinationId } from '../../../../src/nss/loadout';

function sourceFor(partId) {
  const root = new Group();
  const top = new Object3D(); top.name = `MOUNT_${partId}_TOP`; top.position.y = 0.002; top.userData.interface_id = 'NSS-V1';
  const bottom = new Object3D(); bottom.name = `MOUNT_${partId}_BOTTOM`; bottom.position.y = -0.002; bottom.userData.interface_id = 'NSS-V1';
  root.add(top, bottom);
  return root;
}

function mockCanvas() {
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
}

describe('NSS TopEntity vertical slice', () => {
  it('resolves all 288 URLs, recent storage, and strict fallback without partial input', () => {
    const controller = new NssLoadoutController({});
    expect(controller.resolve('', null)).toEqual({ kind: 'none' });
    for (const combination of enumerateNssCombinations()) {
      const id = nssCombinationId(combination);
      expect(controller.resolve(`?combo=${id}&loadoutVersion=1`, null)).toMatchObject({
        kind: 'ready', source: 'url', loadout: { combination },
      });
    }
    const saved = createNssBattleLoadout(enumerateNssCombinations()[50]);
    expect(controller.resolve('', saved)).toMatchObject({ kind: 'ready', source: 'local', loadout: saved });
    expect(controller.resolve('?combo=nss-p2c-0001&loadoutVersion=2', saved)).toMatchObject({
      kind: 'ready', source: 'fallback', loadout: { combination: createNssBattleLoadout(enumerateNssCombinations()[137]).combination },
    });
    expect(controller.resolve('?combo=nss-p2c-0001&loadoutVersion=1&extra=1', null)).toMatchObject({ source: 'fallback' });
    expect(controller.resolve('?combo=nss-p2c-0001&combo=nss-p2c-0002&loadoutVersion=1', null)).toMatchObject({ source: 'fallback' });
    expect(controller.customizerLink(saved, new URL('https://example.test/arena/')))
      .toBe(`https://example.test/customizer/?combo=${nssCombinationId(saved.combination)}`);
    expect(controller.customizerLink(saved, new URL('https://example.test/nova/arena/')))
      .toBe(`https://example.test/nova/customizer/?combo=${nssCombinationId(saved.combination)}`);
  });

  it('waits for all five cached parts before returning an NSS battle top', async () => {
    mockCanvas();
    const loadAsync = vi.fn(async url => {
      const partId = url.split('/').at(-1).replace('.glb', '');
      return { scene: sourceFor(partId) };
    });
    const { NssModelCache } = await import('../../../../src/nss/modelCache');
    const controller = new NssLoadoutController(new NssModelCache({ loadAsync }, '/models'));
    const request = controller.resolve(`?combo=${DEFAULT_NSS_COMBINATION_ID}&loadoutVersion=1`, null);
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

  it('persists the latest NSS loadout without rewriting the legacy build', async () => {
    localStorage.clear();
    const { loadProgression, saveProgression, setNssLoadout } = await import('../../../../src/app/progression');
    const before = loadProgression();
    const loadout = createNssBattleLoadout(enumerateNssCombinations()[287]);
    saveProgression(setNssLoadout(before, loadout));
    const restored = loadProgression();
    expect(restored.latestNssLoadout).toEqual(loadout);
    expect(restored.build).toEqual(before.build);
    expect(restored.partUpgrades).toEqual(before.partUpgrades);
  });

  it('renders five NSS parts and a reversible Customizer link without legacy selectors', async () => {
    mockCanvas();
    globalThis.requestAnimationFrame = vi.fn(() => 1);
    const [{ GaragePanel }, { buildNssBattleStats }] = await Promise.all([
      import('../../../../src/ui/garage'),
      import('../../../../src/nss/buildStats'),
    ]);
    const panel = new GaragePanel();
    const loadout = createNssBattleLoadout(enumerateNssCombinations()[137]);
    panel.showNssMode(loadout, buildNssBattleStats(loadout), 'https://example.test/customizer/?combo=nss-p2c-0138');
    expect(panel.nssPanel.querySelectorAll('.garage-nss__parts > div')).toHaveLength(5);
    expect([...panel.selects.values()].every(select => select.parentElement.hidden)).toBe(true);
    expect(panel.returnCustomizerLink.href).toBe('https://example.test/customizer/?combo=nss-p2c-0138');
    expect(panel.shopButton.hidden).toBe(true);
  });
});
