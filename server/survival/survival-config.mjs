import { readFileSync } from 'node:fs';
import {
  SURVIVAL_AI_PROFILE_IDS,
  SURVIVAL_ARENAS,
  assertSurvivalCatalog,
} from '../../shared/survival/survival-rules.js';

const catalogUrl = new URL('../../shared/survival/survival-v1.json', import.meta.url);

export const SURVIVAL_CONFIG = JSON.parse(readFileSync(catalogUrl, 'utf8'));
assertSurvivalCatalog(SURVIVAL_CONFIG);

export { SURVIVAL_AI_PROFILE_IDS, SURVIVAL_ARENAS, assertSurvivalCatalog };
