import type { LocalIdentity } from '../auth/localIdentity';
import type { UpgradeLevels } from '../app/progression';
import type { CampaignAiProfileId, CampaignArena, CampaignOpponent } from '../data/campaign/opponents';
import type { NssBattleLoadoutV2 } from '../nss/types';
import { parseBattleSeed, type BattleSeed } from '../sim/battleSeed';
import type { CampaignAttempt, CampaignClient } from './campaignClient';

type CampaignCombatant = {
  displayName: string;
  loadout: NssBattleLoadoutV2;
  upgrades: UpgradeLevels;
};

export interface GameCampaignOptions {
  battleKind: 'campaign';
  attemptId: string;
  opponentId: string;
  opponentName: string;
  arena: CampaignArena;
  seed: BattleSeed;
  aiProfileId: CampaignAiProfileId;
  objectives: CampaignOpponent['objectives'];
  player: CampaignCombatant;
  enemy: CampaignCombatant;
  controller: CampaignController;
}

export class CampaignController {
  readonly attempt: CampaignAttempt;
  readonly identity: LocalIdentity;
  readonly client: CampaignClient;

  constructor(
    attempt: CampaignAttempt,
    identity: LocalIdentity,
    client: CampaignClient,
  ) {
    this.attempt = attempt;
    this.identity = identity;
    this.client = client;
    if (attempt.configVersion !== 'campaign-v1' || attempt.simulationVersion !== 1) {
      throw new Error('Unsupported campaign version');
    }
  }

  gameOptions(): GameCampaignOptions {
    return {
      battleKind: 'campaign',
      attemptId: this.attempt.attemptId,
      opponentId: this.attempt.opponent.id,
      opponentName: this.attempt.opponent.name,
      arena: this.attempt.arena,
      seed: parseBattleSeed(this.attempt.seed),
      aiProfileId: this.attempt.aiProfileId as CampaignAiProfileId,
      objectives: this.attempt.objectives,
      player: {
        displayName: this.attempt.player.displayName,
        loadout: this.attempt.player.loadout,
        upgrades: this.attempt.player.upgrades,
      },
      enemy: {
        displayName: this.attempt.enemy.displayName,
        loadout: this.attempt.enemy.loadout,
        upgrades: this.attempt.enemy.upgrades,
      },
      controller: this,
    };
  }
}
