import type { Object3D } from 'three';
import { assembleNssScenes, type NssAssembly } from './assembler';
import { NssModelCache } from './modelCache';
import { NSS_FAMILIES, type NssBattleLoadoutV1, type NssFamily } from './types';

export async function createNssBattleTopVisual(
  cache: NssModelCache,
  loadout: NssBattleLoadoutV1,
): Promise<NssAssembly> {
  const entries = await Promise.all(NSS_FAMILIES.map(async family => [
    family,
    await cache.instantiate(loadout.combination[family]),
  ] as const));
  return assembleNssScenes(Object.fromEntries(entries) as Record<NssFamily, Object3D>, loadout);
}

export function destroyNssBattleTopVisual(assembly: NssAssembly): void {
  assembly.root.removeFromParent();
  assembly.root.clear();
}
