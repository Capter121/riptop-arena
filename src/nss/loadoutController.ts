import type { UpgradeLevels } from '../app/progression';
import { TopEntity, type TopSide } from '../gameplay/top';
import { createNssBattleTopVisual } from './battleTopVisual';
import { createNssBattleLoadout, migrateNssBattleLoadout, nssCombinationFromId, nssCombinationId } from './loadout';
import { NssModelCache } from './modelCache';
import type { NssBattleLoadout, NssBattleLoadoutV2 } from './types';

export const DEFAULT_NSS_COMBINATION_ID = 'nss-p2c-0138';
export const DEFAULT_NSS_LOADOUT = createNssBattleLoadout(nssCombinationFromId(DEFAULT_NSS_COMBINATION_ID)!);

export type NssVerticalSliceRequest =
  | { kind: 'none' }
  | { kind: 'ready'; loadout: NssBattleLoadoutV2; source: 'url' | 'local' | 'fallback'; notice: string | null };

export class NssLoadoutController {
  private readonly cache: NssModelCache;

  constructor(cache = new NssModelCache()) {
    this.cache = cache;
  }

  resolve(search: string, saved: NssBattleLoadoutV2 | null): NssVerticalSliceRequest {
    const parameters = new URLSearchParams(search);
    const combos = parameters.getAll('combo');
    const versions = parameters.getAll('loadoutVersion');
    if (combos.length === 0 && versions.length === 0) {
      return saved
        ? { kind: 'ready', loadout: saved, source: 'local', notice: null }
        : { kind: 'none' };
    }
    const allowedParameters = [...parameters.keys()].every(key => key === 'combo' || key === 'loadoutVersion');
    const combination = combos.length === 1 ? nssCombinationFromId(combos[0]) : null;
    if (combination && versions.length === 1 && versions[0] === '1' && allowedParameters) {
      return { kind: 'ready', loadout: createNssBattleLoadout(combination), source: 'url', notice: null };
    }
    return {
      kind: 'ready',
      loadout: DEFAULT_NSS_LOADOUT,
      source: 'fallback',
      notice: 'Invalid NSS Arena link. The default Storm Attack combination was restored.',
    };
  }

  customizerLink(loadout: NssBattleLoadoutV2, currentLocation: URL, configuredBase?: string): string {
    let target: URL;
    if (configuredBase) {
      target = new URL(configuredBase, currentLocation);
    } else if (typeof import.meta !== 'undefined' && import.meta.env?.DEV && !currentLocation.pathname.includes('/arena')) {
      target = new URL('http://127.0.0.1:4175/');
    } else {
      target = new URL('../customizer/', currentLocation);
    }
    target.search = '';
    target.searchParams.set('combo', nssCombinationId(loadout.combination));
    target.hash = '';
    return target.href;
  }

  async createTop(side: TopSide, loadout: NssBattleLoadout, upgrades?: UpgradeLevels): Promise<TopEntity> {
    const currentLoadout = migrateNssBattleLoadout(loadout);
    const visual = await createNssBattleTopVisual(this.cache, currentLoadout);
    const top = new TopEntity(side, { kind: 'nss-v1', loadout: currentLoadout }, upgrades);
    top.attachNssVisual(visual);
    return top;
  }
}
