import type { UpgradeLevels } from '../app/progression';
import type { LocalIdentity } from '../auth/localIdentity';
import { CAMPAIGN_OPPONENT_BY_ID, type CampaignAiProfileId, type CampaignArena } from '../data/campaign/opponents';
import { createSurvivalBattleRuntime, type SurvivalBattleRuntime } from '../gameplay/survival/survivalRun';
import type { NssBattleLoadoutV2 } from '../nss/types';
import { parseBattleSeed, type BattleSeed } from '../sim/battleSeed';
import { isCampaignOutcome } from '../campaign/campaignClient';
import {
  submitSurvivalResultWithQueue,
} from './pendingSurvivalResult';
import {
  SurvivalApiError,
  type SurvivalClient,
  type SurvivalResultRequest,
  type SurvivalRun,
  type SurvivalSettlement,
} from './survivalClient';

type SurvivalStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;
type SurvivalCombatant = { displayName: string; loadout: NssBattleLoadoutV2; upgrades: UpgradeLevels };

export type SurvivalSubmitResult =
  | { status: 'submitted'; settlement: SurvivalSettlement }
  | { status: 'pending' | 'storage_failed' | 'conflict' };

export interface GameSurvivalOptions {
  battleKind: 'survival';
  runId: string;
  waveNumber: number;
  waveType: 'normal' | 'elite' | 'boss';
  arena: CampaignArena;
  seed: BattleSeed;
  aiProfileId: CampaignAiProfileId;
  player: SurvivalCombatant;
  enemy: SurvivalCombatant;
  runtime: SurvivalBattleRuntime;
  controller: SurvivalController;
}

export class SurvivalController {
  readonly run: SurvivalRun;
  readonly identity: LocalIdentity;
  readonly client: SurvivalClient;
  private request: SurvivalResultRequest | null = null;
  private outcomeJson: string | null = null;
  private settlementPromise: Promise<SurvivalSubmitResult> | null = null;
  private confirmed: SurvivalSubmitResult | null = null;

  constructor(run: SurvivalRun, identity: LocalIdentity, client: SurvivalClient) {
    if (run.configVersion !== 'survival-v1' || run.simulationVersion !== 1 || run.battleRulesVersion !== 2) {
      throw new Error('Unsupported survival version');
    }
    if (run.player.playerId !== identity.playerId) throw new Error('Survival run identity mismatch');
    if (run.status !== 'wave_ready') throw new Error('Survival run is not battle-ready');
    this.run = run;
    this.identity = identity;
    this.client = client;
  }

  gameOptions(): GameSurvivalOptions {
    const opponent = CAMPAIGN_OPPONENT_BY_ID.get(this.run.wave.sourceOpponentId);
    if (!opponent) throw new Error('Survival enemy source is unavailable');
    return {
      battleKind: 'survival',
      runId: this.run.runId,
      waveNumber: this.run.wave.wave,
      waveType: this.run.wave.type,
      arena: this.run.wave.arena,
      seed: parseBattleSeed(this.run.wave.seed),
      aiProfileId: this.run.wave.aiProfileId,
      player: {
        displayName: this.run.player.displayName,
        loadout: this.run.player.loadout,
        upgrades: { ...this.run.player.upgrades },
      },
      enemy: {
        displayName: opponent.name,
        loadout: this.run.wave.enemy,
        upgrades: { attack: 0, defense: 0, stamina: 0 },
      },
      runtime: createSurvivalBattleRuntime(this.run),
      controller: this,
    };
  }

  settle(
    outcome: unknown,
    dependencies: { storage?: SurvivalStorage; randomUUID?: () => string } = {},
  ): Promise<SurvivalSubmitResult> {
    if (!isCampaignOutcome(outcome)
      || outcome.simulationVersion !== this.run.simulationVersion
      || outcome.seed !== this.run.wave.seed) {
      return Promise.reject(new Error('Survival outcome does not match frozen wave'));
    }
    const normalized = structuredClone(outcome) as unknown as Record<string, unknown>;
    const outcomeJson = JSON.stringify(normalized);
    if (this.outcomeJson !== null && this.outcomeJson !== outcomeJson) {
      return Promise.reject(new Error('Survival outcome changed after settlement began'));
    }
    if (this.confirmed) return Promise.resolve(this.confirmed);
    if (this.settlementPromise) return this.settlementPromise;
    this.outcomeJson = outcomeJson;
    this.request ??= {
      requestId: (dependencies.randomUUID ?? (() => crypto.randomUUID()))(),
      configVersion: 'survival-v1',
      simulationVersion: 1,
      battleRulesVersion: 2,
      wave: this.run.wave.wave,
      outcome: normalized,
    };
    this.settlementPromise = this.submit(this.request, outcome.winner, dependencies.storage)
      .then((result) => {
        if (result.status === 'submitted') this.confirmed = result;
        return result;
      })
      .finally(() => { this.settlementPromise = null; });
    return this.settlementPromise;
  }

  private async submit(request: SurvivalResultRequest, winner: 'player' | 'enemy', storage?: SurvivalStorage): Promise<SurvivalSubmitResult> {
    if (winner === 'enemy') {
      const result = await submitSurvivalResultWithQueue(
        this.identity.playerId,
        this.run.runId,
        request,
        (runId, wave, value) => this.client.submitWaveResult(runId, wave, value),
        { storage },
      );
      return result.status === 'submitted'
        ? { status: 'submitted', settlement: result.response }
        : result;
    }
    try {
      const settlement = await this.client.submitWaveResult(this.run.runId, this.run.wave.wave, request);
      return { status: 'submitted', settlement };
    } catch (error) {
      if (error instanceof SurvivalApiError
        && (error.code === 'SURVIVAL_REQUEST_CONFLICT' || error.code === 'STALE_SURVIVAL_STATE')) {
        return { status: 'conflict' };
      }
      return { status: 'pending' };
    }
  }
}
