import { readFileSync } from 'node:fs';
import {
  SURVIVAL_AI_PROFILE_IDS,
  SURVIVAL_ARENAS,
  assertSurvivalCatalog,
  generateSurvivalWave as generateSharedSurvivalWave,
} from '../../shared/survival/survival-rules.js';

const catalogUrl = new URL('../../shared/survival/survival-v1.json', import.meta.url);
const campaignUrl = new URL('../../shared/campaign/campaign-v1.json', import.meta.url);

export const SURVIVAL_CONFIG = JSON.parse(readFileSync(catalogUrl, 'utf8'));
const campaignCatalog = JSON.parse(readFileSync(campaignUrl, 'utf8'));
assertSurvivalCatalog(SURVIVAL_CONFIG);

export { SURVIVAL_AI_PROFILE_IDS, SURVIVAL_ARENAS, assertSurvivalCatalog };

export function generateSurvivalWave(seed, wave, riskLevel) {
  return generateSharedSurvivalWave(SURVIVAL_CONFIG, campaignCatalog, seed, wave, riskLevel);
}
