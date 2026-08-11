import {
  combinationId, defaultAffinities, enumerateCombinations, families, isAffinitySelection, isCombination,
  stormAttack, type AffinitySelection, type Combination,
} from '../domain';
import versions from '../../../shared/nss/versions.json';

const combinationsById = new Map(enumerateCombinations().map(combination => [combinationId(combination), combination]));
const v2RequiredParameters = ['sv', 'cv', 'rv', 'combo', 'a'] as const;
const v2AllowedParameters = new Set([...v2RequiredParameters, 'emblem', 'test', 'returnTo', 'return', 'opponent']);
const legacyAllowedParameters = new Set(['combo', 'test']);
const emblemPattern = /^emblem_[a-z0-9_-]{1,48}$/;

export interface ShareBuild {
  combination: Combination;
  affinities: AffinitySelection;
}

export interface SharePayload extends ShareBuild {
  emblemId?: string | null;
}

export type ParsedShareSearch =
  | { kind: 'none'; testMode: boolean }
  | { kind: 'legacy'; combination: Combination; testMode: boolean }
  | { kind: 'current'; combination: Combination; affinities: AffinitySelection; emblemId: string | null; testMode: boolean }
  | { kind: 'invalid'; testMode: boolean };

export interface InitialCombinationResolution {
  combination: Combination;
  affinities: AffinitySelection;
  emblemId: string | null;
  source: 'url' | 'local' | 'fallback';
  invalidUrl: boolean;
  legacyUrl: boolean;
  testMode: boolean;
}

export function combinationFromId(id: string): Combination | null {
  return combinationsById.get(id) ?? null;
}

function hasRepeatedParameters(parameters: URLSearchParams): boolean {
  return [...new Set(parameters.keys())].some(key => parameters.getAll(key).length !== 1);
}

function parseTestMode(parameters: URLSearchParams): { valid: boolean; testMode: boolean } {
  const values = parameters.getAll('test');
  if (values.length === 0) return { valid: true, testMode: false };
  return { valid: values.length === 1 && values[0] === '1', testMode: values.length === 1 && values[0] === '1' };
}

function parseAffinities(value: string | null): AffinitySelection | null {
  if (!value) return null;
  const entries = value.split(',');
  if (entries.length !== families.length) return null;
  const affinities = Object.fromEntries(families.map((family, index) => [family, entries[index]]));
  return isAffinitySelection(affinities) ? affinities : null;
}

export function parseShareSearch(search: string): ParsedShareSearch {
  const parameters = new URLSearchParams(search);
  const test = parseTestMode(parameters);
  if (hasRepeatedParameters(parameters) || !test.valid) return { kind: 'invalid', testMode: test.testMode };

  const keys = [...parameters.keys()];
  if (keys.every(key => key === 'test')) return { kind: 'none', testMode: test.testMode };
  if (!parameters.has('sv')
    && keys.every(key => key === 'return' || key === 'opponent' || key === 'test')
    && parameters.get('return') === 'campaign' && parameters.has('opponent')) {
    return { kind: 'none', testMode: test.testMode };
  }

  if (!parameters.has('sv')) {
    if (!keys.every(key => legacyAllowedParameters.has(key)) || !parameters.has('combo')) {
      return { kind: 'invalid', testMode: test.testMode };
    }
    const combination = combinationFromId(parameters.get('combo') ?? '');
    return combination
      ? { kind: 'legacy', combination, testMode: test.testMode }
      : { kind: 'invalid', testMode: test.testMode };
  }

  if (!keys.every(key => v2AllowedParameters.has(key))
    || !v2RequiredParameters.every(key => parameters.has(key))
    || parameters.get('sv') !== String(versions.shareSchemaVersion)
    || parameters.get('cv') !== String(versions.catalogVersion)
    || parameters.get('rv') !== String(versions.affinityRulesVersion)) {
    return { kind: 'invalid', testMode: test.testMode };
  }
  const combination = combinationFromId(parameters.get('combo') ?? '');
  const affinities = parseAffinities(parameters.get('a'));
  const emblemId = parameters.get('emblem');
  if (!combination || !affinities || (emblemId !== null && !emblemPattern.test(emblemId))) {
    return { kind: 'invalid', testMode: test.testMode };
  }
  return { kind: 'current', combination, affinities, emblemId, testMode: test.testMode };
}

export function buildToSearch(payload: SharePayload): string {
  if (!isCombination(payload.combination) || !isAffinitySelection(payload.affinities)) {
    throw new Error('Invalid share build');
  }
  if (payload.emblemId != null && !emblemPattern.test(payload.emblemId)) {
    throw new Error('Invalid share emblem');
  }
  const parameters = new URLSearchParams();
  parameters.set('sv', String(versions.shareSchemaVersion));
  parameters.set('cv', String(versions.catalogVersion));
  parameters.set('rv', String(versions.affinityRulesVersion));
  parameters.set('combo', combinationId(payload.combination));
  parameters.set('a', families.map(family => payload.affinities[family]).join(','));
  if (payload.emblemId) parameters.set('emblem', payload.emblemId);
  return `?${parameters.toString()}`;
}

function savedBuild(savedText: string | null): ShareBuild | null {
  if (!savedText) return null;
  try {
    const saved = JSON.parse(savedText);
    if (!isCombination(saved?.combination)) return null;
    if (saved.schemaVersion === 1) {
      return { combination: saved.combination, affinities: defaultAffinities(saved.combination) };
    }
    return saved.schemaVersion === 2 && isAffinitySelection(saved.affinities)
      ? { combination: saved.combination, affinities: saved.affinities }
      : null;
  } catch {
    return null;
  }
}

export function resolveInitialCombination(search: string, savedText: string | null): InitialCombinationResolution {
  const parsed = parseShareSearch(search);
  if (parsed.kind === 'current') {
    return { ...parsed, source: 'url', invalidUrl: false, legacyUrl: false };
  }
  if (parsed.kind === 'legacy') {
    return {
      combination: parsed.combination,
      affinities: defaultAffinities(parsed.combination),
      emblemId: null,
      source: 'url', invalidUrl: false, legacyUrl: true, testMode: parsed.testMode,
    };
  }
  const fallback = { combination: stormAttack, affinities: defaultAffinities(stormAttack), emblemId: null };
  if (parsed.kind === 'invalid') {
    return { ...fallback, source: 'fallback', invalidUrl: true, legacyUrl: false, testMode: parsed.testMode };
  }
  const local = savedBuild(savedText);
  return local
    ? { ...local, emblemId: null, source: 'local', invalidUrl: false, legacyUrl: false, testMode: parsed.testMode }
    : { ...fallback, source: 'fallback', invalidUrl: false, legacyUrl: false, testMode: parsed.testMode };
}

export function createShareLink(payload: SharePayload, currentLocation: URL, configuredBase?: string): { url: string; deviceOnly: boolean } {
  const target = configuredBase ? new URL(configuredBase, currentLocation) : new URL(currentLocation.href);
  target.search = buildToSearch(payload);
  target.hash = '';
  const deviceOnly = target.protocol === 'file:' || target.hostname === 'localhost' || target.hostname === '127.0.0.1';
  return { url: target.href, deviceOnly };
}
