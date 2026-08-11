import type { LocalIdentity } from '../auth/localIdentity';
import type { UpgradeLevels } from '../app/progression';
import type { CampaignAiProfileId, CampaignArena, CampaignOpponent } from '../data/campaign/opponents';
import type { NssBattleLoadoutV2 } from '../nss/types';
import { parseBattleSeed, type BattleSeed } from '../sim/battleSeed';
import {
  CampaignApiError,
  isCampaignOutcome,
  type CampaignAttempt,
  type CampaignClient,
  type CampaignSettlement,
} from './campaignClient';
import {
  loadPendingCampaignResult,
  pendingCampaignResultKey,
  savePendingCampaignResult,
} from './pendingCampaignResult';

type CampaignStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;
export type CampaignSubmitResult =
  | { status: 'submitted'; settlement: CampaignSettlement }
  | { status: 'pending' | 'storage_failed' | 'conflict' };

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
  private settlementPromise: Promise<CampaignSubmitResult> | null = null;

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

  settle(
    outcome: unknown,
    dependencies: { storage?: CampaignStorage; randomUUID?: () => string } = {},
  ): Promise<CampaignSubmitResult> {
    if (this.settlementPromise) return this.settlementPromise;
    if (!isCampaignOutcome(outcome) || outcome.simulationVersion !== this.attempt.simulationVersion || outcome.seed !== this.attempt.seed) {
      return Promise.reject(new Error('Campaign outcome does not match frozen attempt'));
    }
    const requestId = (dependencies.randomUUID ?? (() => crypto.randomUUID()))();
    const storage = dependencies.storage ?? window.localStorage;
    const normalized = structuredClone(outcome) as unknown as Record<string, unknown>;
    this.settlementPromise = this.submitOnce(requestId, normalized, storage);
    return this.settlementPromise;
  }

  private async submitOnce(requestId: string, outcome: Record<string, unknown>, storage: CampaignStorage): Promise<CampaignSubmitResult> {
    if (!savePendingCampaignResult(this.identity.playerId, requestId, this.attempt.attemptId, outcome, storage)) {
      return { status: 'storage_failed' };
    }
    try {
      const settlement = await this.client.submitResult(this.attempt.attemptId, { requestId, outcome });
      storage.removeItem(pendingCampaignResultKey(this.identity.playerId, this.attempt.attemptId));
      return { status: 'submitted', settlement };
    } catch (error) {
      if (error instanceof CampaignApiError && error.code === 'CAMPAIGN_RESULT_CONFLICT') {
        const pending = loadPendingCampaignResult(this.identity.playerId, this.attempt.attemptId, storage);
        if (pending) {
          try { storage.setItem(pendingCampaignResultKey(this.identity.playerId, this.attempt.attemptId), JSON.stringify({ ...pending, status: 'conflict' })); } catch { /* Preserve the pending record. */ }
        }
        return { status: 'conflict' };
      }
      return { status: 'pending' };
    }
  }
}
