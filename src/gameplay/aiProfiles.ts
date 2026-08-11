import { CAMPAIGN_AI_PROFILE_WEIGHTS, type CampaignAiProfileId } from '../data/campaign/opponents';

export type CampaignAiActionWeights = Readonly<{
  attack: number;
  dodge: number;
  guard: number;
  charge: number;
  reflectLight: number;
  reflectHeavy: number;
}>;

export const CAMPAIGN_AI_WEIGHTS = CAMPAIGN_AI_PROFILE_WEIGHTS as Readonly<Record<CampaignAiProfileId, CampaignAiActionWeights>>;

export function getCampaignAiWeights(profileId: CampaignAiProfileId): CampaignAiActionWeights {
  return CAMPAIGN_AI_WEIGHTS[profileId];
}
