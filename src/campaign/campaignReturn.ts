import versions from '../../battle-top-designer/shared/nss/versions.json';
import { CAMPAIGN_OPPONENT_BY_ID } from '../data/campaign/opponents';
import {
  createNssBattleLoadout,
  isNssAffinitySelection,
  nssCombinationFromId,
  nssCombinationId,
} from '../nss/loadout';
import { NSS_FAMILIES, type NssBattleLoadoutV2 } from '../nss/types';

const payloadKeys = ['sv', 'cv', 'rv', 'combo', 'a'] as const;
const allowedKeys = new Set(['return', 'opponent', ...payloadKeys]);

export type CampaignReturnParseResult =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'ready'; opponentId: string; loadout: NssBattleLoadoutV2 };

export function parseCampaignReturn(search: string): CampaignReturnParseResult {
  const parameters = new URLSearchParams(search);
  if (!parameters.has('return')) return { kind: 'none' };
  if ([...new Set(parameters.keys())].some(key => parameters.getAll(key).length !== 1)
    || [...parameters.keys()].some(key => !allowedKeys.has(key))
    || parameters.get('return') !== 'campaign'
    || !payloadKeys.every(key => parameters.has(key))) return { kind: 'invalid' };
  const opponentId = parameters.get('opponent') ?? '';
  if (!CAMPAIGN_OPPONENT_BY_ID.has(opponentId)
    || parameters.get('sv') !== String(versions.shareSchemaVersion)
    || parameters.get('cv') !== String(versions.catalogVersion)
    || parameters.get('rv') !== String(versions.affinityRulesVersion)) return { kind: 'invalid' };
  const combination = nssCombinationFromId(parameters.get('combo') ?? '');
  const affinityValues = parameters.get('a')?.split(',') ?? [];
  const affinities = affinityValues.length === NSS_FAMILIES.length
    ? Object.fromEntries(NSS_FAMILIES.map((family, index) => [family, affinityValues[index]]))
    : null;
  if (!combination || !isNssAffinitySelection(affinities)) return { kind: 'invalid' };
  return { kind: 'ready', opponentId, loadout: createNssBattleLoadout(combination, affinities) };
}

export function buildCampaignCustomizerPath(opponentId: string, loadout: NssBattleLoadoutV2 | null): string {
  if (!CAMPAIGN_OPPONENT_BY_ID.has(opponentId)) throw new Error('Invalid campaign opponent id');
  const parameters = new URLSearchParams({ return: 'campaign', opponent: opponentId });
  if (loadout) {
    parameters.set('sv', String(versions.shareSchemaVersion));
    parameters.set('cv', String(versions.catalogVersion));
    parameters.set('rv', String(versions.affinityRulesVersion));
    parameters.set('combo', nssCombinationId(loadout.combination));
    parameters.set('a', NSS_FAMILIES.map(family => loadout.affinities[family]).join(','));
  }
  return `/customizer/?${parameters.toString()}`;
}
