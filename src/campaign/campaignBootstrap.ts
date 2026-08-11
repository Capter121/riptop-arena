import { loadLocalIdentity, type LocalIdentity } from '../auth/localIdentity';
import { CAMPAIGN_OPPONENT_BY_ID } from '../data/campaign/opponents';
import { CampaignApiError, createCampaignClient, type CampaignClient } from './campaignClient';
import { CampaignController } from './campaignController';

export type CampaignBootstrapResult =
  | { kind: 'ready'; controller: CampaignController }
  | { kind: 'invalid_link' | 'missing_identity' | 'locked' | 'nss_required' | 'forbidden' | 'unsupported' | 'offline' };

function opponentIdFromSearch(search: string) {
  const parameters = new URLSearchParams(search);
  const opponents = parameters.getAll('campaign');
  const qa = parameters.getAll('qa');
  const allowed = [...parameters.keys()].every(key => key === 'campaign' || key === 'qa');
  const validQa = qa.length === 0 || (qa.length === 1 && qa[0] === '1');
  return allowed && validQa && opponents.length === 1 && CAMPAIGN_OPPONENT_BY_ID.has(opponents[0])
    ? opponents[0]
    : null;
}

export async function bootstrapCampaign(
  search: string,
  dependencies: {
    loadIdentity?: () => LocalIdentity | null;
    createClient?: (identity: LocalIdentity) => CampaignClient;
    randomUUID?: () => string;
  } = {},
): Promise<CampaignBootstrapResult> {
  const opponentId = opponentIdFromSearch(search);
  if (!opponentId) return { kind: 'invalid_link' };
  const identity = (dependencies.loadIdentity ?? (() => loadLocalIdentity()))();
  if (!identity) return { kind: 'missing_identity' };
  const client = (dependencies.createClient ?? (value => createCampaignClient(value)))(identity);
  try {
    const attempt = await client.startAttempt({
      requestId: (dependencies.randomUUID ?? (() => crypto.randomUUID()))(),
      opponentId,
    });
    return { kind: 'ready', controller: new CampaignController(attempt, identity, client) };
  } catch (error) {
    if (error instanceof Error && error.message === 'Unsupported campaign version') return { kind: 'unsupported' };
    if (error instanceof CampaignApiError) {
      if (error.code === 'CAMPAIGN_OPPONENT_LOCKED') return { kind: 'locked' };
      if (error.code === 'NSS_LOADOUT_REQUIRED') return { kind: 'nss_required' };
      if (error.code === 'INVALID_RESPONSE') return { kind: 'unsupported' };
      if (error.status === 401 || error.status === 403 || error.status === 404) return { kind: 'forbidden' };
    }
    return { kind: 'offline' };
  }
}
