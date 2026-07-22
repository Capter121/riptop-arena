import { combinationId, type Combination } from '../domain';

export function createArenaLink(
  combination: Combination,
  currentLocation: URL,
  configuredBase?: string,
): string {
  const target = configuredBase
    ? new URL(configuredBase, currentLocation)
    : new URL('/arena/', currentLocation.origin);
  target.search = '';
  target.searchParams.set('combo', combinationId(combination));
  target.searchParams.set('loadoutVersion', '1');
  target.hash = '';
  return target.href;
}
