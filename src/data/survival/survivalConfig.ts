import catalogJson from '../../../shared/survival/survival-v1.json';
import campaignJson from '../../../shared/campaign/campaign-v1.json';
import {
  SURVIVAL_AI_PROFILE_IDS,
  SURVIVAL_ARENAS,
  assertSurvivalCatalog as assertSharedSurvivalCatalog,
  applySurvivalReward as applySharedSurvivalReward,
  compareSurvivalBest,
  createSurvivalSummary,
  generateSurvivalWave as generateSharedSurvivalWave,
  generateSurvivalRewards as generateSharedSurvivalRewards,
  normalizeSurvivalRewardState,
  scoreSurvivalWave as scoreSharedSurvivalWave,
  type SurvivalCatalog,
  type SurvivalRewardChoice,
  type SurvivalRewardState,
  type SurvivalFinishKind,
  type SurvivalSummary,
  type SurvivalWaveType,
} from '../../../shared/survival/survival-rules.js';

export { SURVIVAL_AI_PROFILE_IDS, SURVIVAL_ARENAS };
export type { SurvivalAiProfileId, SurvivalArena, SurvivalWaveType } from '../../../shared/survival/survival-rules.js';
export { normalizeSurvivalRewardState };
export { compareSurvivalBest, createSurvivalSummary };
export type { SurvivalFinishKind, SurvivalRewardChoice, SurvivalRewardState, SurvivalSummary };

export function assertSurvivalCatalog(value: unknown = catalogJson): asserts value is SurvivalCatalog {
  assertSharedSurvivalCatalog(value);
}

assertSurvivalCatalog(catalogJson);

export const SURVIVAL_CONFIG = catalogJson as SurvivalCatalog;
const campaignCatalog = campaignJson as typeof campaignJson & { configVersion: 'campaign-v1' };

export function generateSurvivalWave(seed: string, wave: number, riskLevel: number) {
  return generateSharedSurvivalWave(SURVIVAL_CONFIG, campaignCatalog, seed, wave, riskLevel);
}

export function generateSurvivalRewards(seed: string, wave: number, state: SurvivalRewardState) {
  return generateSharedSurvivalRewards(SURVIVAL_CONFIG, seed, wave, state);
}

export function applySurvivalReward(state: SurvivalRewardState, reward: SurvivalRewardChoice) {
  return applySharedSurvivalReward(SURVIVAL_CONFIG, state, reward);
}

export function scoreSurvivalWave(input: Readonly<{
  wave: number;
  type: SurvivalWaveType;
  finishKind: SurvivalFinishKind;
  flawless: boolean;
  flawlessStreak: number;
  riskLevel: number;
}>) {
  return scoreSharedSurvivalWave(SURVIVAL_CONFIG, input);
}
