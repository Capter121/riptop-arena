import type { SharePayload } from '../sharing/combinationUrl';
import { buildToSearch } from '../sharing/combinationUrl';

const challengePathPattern = /^\/challenge\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseChallengeReturnPath(search: string): string | null {
  const parameters = new URLSearchParams(search);
  const values = parameters.getAll('returnTo');
  if (values.length !== 1 || !challengePathPattern.test(values[0])) return null;
  return values[0];
}

export function createChallengeReturnLink(returnTo: string, payload: SharePayload): string {
  if (!challengePathPattern.test(returnTo)) throw new Error('Invalid challenge return path');
  return `${returnTo}${buildToSearch({ combination: payload.combination, affinities: payload.affinities })}`;
}
