import type { UpgradeLevels } from '../app/progression';
import { TopEntity, type TopSide } from '../gameplay/top';
import { createNssBattleTopVisual } from './battleTopVisual';
import { createNssBattleLoadout, nssCombinationFromId } from './loadout';
import { NssModelCache } from './modelCache';
import type { NssBattleLoadoutV1 } from './types';

export const DEFAULT_NSS_COMBINATION_ID = 'nss-p2c-0138';
export const DEFAULT_NSS_LOADOUT = createNssBattleLoadout(nssCombinationFromId(DEFAULT_NSS_COMBINATION_ID)!);

export type NssVerticalSliceRequest =
  | { kind: 'none' }
  | { kind: 'ready'; loadout: NssBattleLoadoutV1 }
  | { kind: 'unsupported'; message: string };

export class NssLoadoutController {
  private readonly cache: NssModelCache;

  constructor(cache = new NssModelCache()) {
    this.cache = cache;
  }

  resolveVerticalSlice(search: string): NssVerticalSliceRequest {
    const parameters = new URLSearchParams(search);
    const combos = parameters.getAll('combo');
    const versions = parameters.getAll('loadoutVersion');
    if (combos.length === 0 && versions.length === 0) return { kind: 'none' };
    if (combos.length === 1 && combos[0] === DEFAULT_NSS_COMBINATION_ID && versions.length === 1 && versions[0] === '1') {
      return { kind: 'ready', loadout: DEFAULT_NSS_LOADOUT };
    }
    return { kind: 'unsupported', message: 'This NSS combination is not enabled in the Arena vertical slice yet.' };
  }

  async createTop(side: TopSide, loadout: NssBattleLoadoutV1, upgrades?: UpgradeLevels): Promise<TopEntity> {
    const visual = await createNssBattleTopVisual(this.cache, loadout);
    const top = new TopEntity(side, { kind: 'nss-v1', loadout }, upgrades);
    top.attachNssVisual(visual);
    return top;
  }
}
