import catalogJson from '../../../shared/survival/survival-v1.json';
import {
  SURVIVAL_AI_PROFILE_IDS,
  SURVIVAL_ARENAS,
  assertSurvivalCatalog as assertSharedSurvivalCatalog,
  type SurvivalCatalog,
} from '../../../shared/survival/survival-rules.js';

export { SURVIVAL_AI_PROFILE_IDS, SURVIVAL_ARENAS };
export type { SurvivalAiProfileId, SurvivalArena, SurvivalWaveType } from '../../../shared/survival/survival-rules.js';

export function assertSurvivalCatalog(value: unknown = catalogJson): asserts value is SurvivalCatalog {
  assertSharedSurvivalCatalog(value);
}

assertSurvivalCatalog(catalogJson);

export const SURVIVAL_CONFIG = catalogJson as SurvivalCatalog;
