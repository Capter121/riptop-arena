import { loadLocalIdentity, type LocalIdentity } from '../auth/localIdentity';
import { SurvivalApiError, createSurvivalClient, type SurvivalClient } from './survivalClient';
import { SurvivalController } from './survivalController';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SurvivalBootstrapResult =
  | { kind: 'ready'; controller: SurvivalController }
  | { kind: 'invalid_link' | 'missing_identity' | 'forbidden' | 'completed' | 'reward_pending' | 'unsupported' | 'offline' };

function runIdFromSearch(search: string) {
  const parameters = new URLSearchParams(search);
  const ids = parameters.getAll('survival');
  const qa = parameters.getAll('qa');
  const allowed = [...parameters.keys()].every(key => key === 'survival' || key === 'qa');
  const validQa = qa.length === 0 || (qa.length === 1 && qa[0] === '1');
  return allowed && validQa && ids.length === 1 && UUID_V4.test(ids[0]) ? ids[0] : null;
}

export async function bootstrapSurvival(
  search: string,
  dependencies: {
    loadIdentity?: () => LocalIdentity | null;
    createClient?: (identity: LocalIdentity) => SurvivalClient;
  } = {},
): Promise<SurvivalBootstrapResult> {
  const runId = runIdFromSearch(search);
  if (!runId) return { kind: 'invalid_link' };
  const identity = (dependencies.loadIdentity ?? (() => loadLocalIdentity()))();
  if (!identity) return { kind: 'missing_identity' };
  const client = (dependencies.createClient ?? (value => createSurvivalClient(value)))(identity);
  try {
    const hub = await client.getHub();
    const run = hub.activeRun;
    if (!run || run.runId !== runId) return { kind: 'forbidden' };
    if (run.status === 'completed') return { kind: 'completed' };
    if (run.status === 'reward_pending') return { kind: 'reward_pending' };
    return { kind: 'ready', controller: new SurvivalController(run, identity, client) };
  } catch (error) {
    if (error instanceof Error && error.message === 'Unsupported survival version') return { kind: 'unsupported' };
    if (error instanceof SurvivalApiError) {
      if (error.code === 'INVALID_RESPONSE' || error.code === 'UNSUPPORTED_SURVIVAL_VERSION') return { kind: 'unsupported' };
      if (error.status === 401 || error.status === 403 || error.status === 404) return { kind: 'forbidden' };
    }
    return { kind: 'offline' };
  }
}
