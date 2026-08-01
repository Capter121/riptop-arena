import {
  combinationId, enumerateCombinations, isAffinitySelection, isCombination, stormAttack, type Combination,
} from '../domain';

const combinationsById = new Map(enumerateCombinations().map(combination => [combinationId(combination), combination]));

export interface InitialCombinationResolution {
  combination: Combination;
  source: 'url' | 'local' | 'fallback';
  invalidUrl: boolean;
  testMode: boolean;
}

export function combinationFromId(id: string): Combination | null {
  return combinationsById.get(id) ?? null;
}

export function combinationToSearch(combination: Combination): string {
  return `?combo=${combinationId(combination)}`;
}

function savedCombination(savedText: string | null): Combination | null {
  if (!savedText) return null;
  try {
    const saved = JSON.parse(savedText);
    if (!isCombination(saved?.combination)) return null;
    if (saved.schemaVersion === 1) return saved.combination;
    return saved.schemaVersion === 2 && isAffinitySelection(saved.affinities) ? saved.combination : null;
  } catch {
    return null;
  }
}

export function resolveInitialCombination(search: string, savedText: string | null): InitialCombinationResolution {
  const parameters = new URLSearchParams(search);
  const comboValues = parameters.getAll('combo');
  const testValues = parameters.getAll('test');
  const testMode = testValues.length === 1 && testValues[0] === '1';
  const allowedParameters = [...parameters.keys()].every(key => key === 'combo' || key === 'test');
  const validTestParameter = testValues.length === 0 || testMode;

  if (comboValues.length > 0) {
    const combination = comboValues.length === 1 ? combinationFromId(comboValues[0]) : null;
    if (combination && allowedParameters && validTestParameter) {
      return { combination, source: 'url', invalidUrl: false, testMode };
    }
    return { combination: stormAttack, source: 'fallback', invalidUrl: true, testMode };
  }
  if (!allowedParameters || !validTestParameter) {
    return { combination: stormAttack, source: 'fallback', invalidUrl: true, testMode };
  }
  const local = savedCombination(savedText);
  return local
    ? { combination: local, source: 'local', invalidUrl: false, testMode }
    : { combination: stormAttack, source: 'fallback', invalidUrl: false, testMode };
}

export function createShareLink(combination: Combination, currentLocation: URL, configuredBase?: string): { url: string; deviceOnly: boolean } {
  const target = configuredBase ? new URL(configuredBase, currentLocation) : new URL(currentLocation.href);
  target.search = combinationToSearch(combination);
  target.hash = '';
  const deviceOnly = target.protocol === 'file:' || target.hostname === 'localhost' || target.hostname === '127.0.0.1';
  return { url: target.href, deviceOnly };
}
