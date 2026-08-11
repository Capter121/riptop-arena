import catalog from '../../../../shared/campaign/campaign-v1.json';
import type { SharePayload } from '../sharing/combinationUrl';
import { buildToSearch } from '../sharing/combinationUrl';

const opponentIds = new Set(catalog.opponents.map(opponent => opponent.id));

export interface CampaignReturnTarget { opponentId: string }

function validTarget(target: CampaignReturnTarget) {
  return opponentIds.has(target.opponentId);
}

export function parseCampaignReturnTarget(search: string): CampaignReturnTarget | null {
  const parameters = new URLSearchParams(search);
  const sources = parameters.getAll('return');
  const opponents = parameters.getAll('opponent');
  if (sources.length !== 1 || sources[0] !== 'campaign' || opponents.length !== 1 || !opponentIds.has(opponents[0])) return null;
  return { opponentId: opponents[0] };
}

export function createCampaignReturnLink(target: CampaignReturnTarget, payload: SharePayload): string {
  if (!validTarget(target)) throw new Error('Invalid campaign return target');
  return `/campaign/?return=campaign&opponent=${encodeURIComponent(target.opponentId)}&${buildToSearch(payload).slice(1)}`;
}

export function createCampaignCancelLink(target: CampaignReturnTarget): string {
  if (!validTarget(target)) throw new Error('Invalid campaign return target');
  return `/campaign/?opponent=${encodeURIComponent(target.opponentId)}`;
}
