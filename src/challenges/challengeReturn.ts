import versions from '../../battle-top-designer/shared/nss/versions.json';
import { isNssAffinitySelection, createNssBattleLoadout, nssCombinationFromId, nssCombinationId } from '../nss/loadout';
import { NSS_FAMILIES, type NssBattleLoadoutV2 } from '../nss/types';

const requiredParameters = ['sv', 'cv', 'rv', 'combo', 'a'] as const;
const challengeIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type ChallengeReturnParseResult =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'ready'; loadout: NssBattleLoadoutV2 };

export function parseChallengeReturn(search: string): ChallengeReturnParseResult {
  const parameters = new URLSearchParams(search);
  if ([...parameters.keys()].length === 0) return { kind: 'none' };
  if ([...new Set(parameters.keys())].some(key => parameters.getAll(key).length !== 1)
    || [...parameters.keys()].some(key => !requiredParameters.includes(key as typeof requiredParameters[number]))
    || !requiredParameters.every(key => parameters.has(key))
    || parameters.get('sv') !== String(versions.shareSchemaVersion)
    || parameters.get('cv') !== String(versions.catalogVersion)
    || parameters.get('rv') !== String(versions.affinityRulesVersion)) {
    return { kind: 'invalid' };
  }
  const combination = nssCombinationFromId(parameters.get('combo') ?? '');
  const values = parameters.get('a')?.split(',') ?? [];
  const affinities = values.length === NSS_FAMILIES.length
    ? Object.fromEntries(NSS_FAMILIES.map((family, index) => [family, values[index]]))
    : null;
  if (!combination || !isNssAffinitySelection(affinities)) return { kind: 'invalid' };
  return { kind: 'ready', loadout: createNssBattleLoadout(combination, affinities) };
}

export function buildChallengeCustomizerPath(offerId: string, loadout: NssBattleLoadoutV2): string {
  if (!challengeIdPattern.test(offerId)) throw new Error('Invalid challenge offer id');
  const parameters = new URLSearchParams();
  parameters.set('returnTo', `/challenge/${offerId}`);
  parameters.set('sv', String(versions.shareSchemaVersion));
  parameters.set('cv', String(versions.catalogVersion));
  parameters.set('rv', String(versions.affinityRulesVersion));
  parameters.set('combo', nssCombinationId(loadout.combination));
  parameters.set('a', NSS_FAMILIES.map(family => loadout.affinities[family]).join(','));
  return `/customizer/?${parameters.toString()}`;
}
