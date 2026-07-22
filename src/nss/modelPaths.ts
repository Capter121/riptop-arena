import { nssPartById } from './catalog';

export const DEFAULT_NSS_MODEL_ROOT = '/models/parts/';

export function nssModelPath(partId: string, modelRoot = DEFAULT_NSS_MODEL_ROOT): string {
  if (!nssPartById.has(partId)) throw new Error(`Unknown NSS model part: ${partId}`);
  const root = modelRoot.endsWith('/') ? modelRoot : `${modelRoot}/`;
  return `${root}${partId}.glb`;
}
