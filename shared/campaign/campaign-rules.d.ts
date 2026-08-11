export type CampaignFinishKind = 'ring out' | 'spin finish' | 'burst finish' | 'timeout';
export type CampaignOutcome = {
  winner: 'player' | 'enemy';
  kind: CampaignFinishKind;
  turnCount: number;
  tickCount: number;
  player: { integrity: number; tilt: number };
};
export type CampaignAffinityProfile = { primary: string; resonance: 'offense' | 'harmony' | 'none' };
export type CampaignObjectiveDefinition =
  | { kind: 'primary_affinity'; affinity: string }
  | { kind: 'harmony' }
  | { kind: 'turn_limit'; maximum: number }
  | { kind: 'integrity_ratio'; minimum: number }
  | { kind: 'finish'; finish: 'ringout' | 'spin' | 'burst' | 'timeout' }
  | { kind: 'tilt_limit'; maximum: number };
export type CampaignOpponentRules = {
  objectives: { strategy: CampaignObjectiveDefinition; performance: CampaignObjectiveDefinition };
};

export function selectCampaignRotation(attemptOrdinal: number, loadoutCount: number, arenaCount: number): { loadoutIndex: number; arenaIndex: number };
export function evaluateCampaignStars(opponent: CampaignOpponentRules, profile: CampaignAffinityProfile, outcome: CampaignOutcome, maximumIntegrity?: number): number;
export function mergeCampaignStars(existingMask: number, earnedMask: number): number;
export function nextCampaignOpponentIndex(defeated: readonly boolean[]): number;
export function campaignWinCoins(opponentIndex: number, finishKind: CampaignFinishKind): number;
export function compareCampaignOutcomes(candidate: CampaignOutcome, incumbent: CampaignOutcome | null): number;
export function campaignEventUuid(logicalKey: string): string;
