import type { TurnAction } from '../types/battle';
import {
  appendBattleTurn,
  appendPlayerVoiceFrame,
  createBattleInputLog,
  setBattleTurnQteFinal,
  type BattleInputLogV1,
  type BattleLaunchInputV1,
} from './battleRecord';
import { createBattleSimulationContext, type BattleSimulationContext } from './battleSeed';
import { FIXED_BATTLE_DT, FixedStepClock } from './fixedStep';
import { DeterministicAiVoiceBoost, decodePlayerVoiceFrame } from './voiceBoost';

const DEFAULT_VOICE_BOOST_TICKS = 180;

export type BattleTickInput = {
  dt: typeof FIXED_BATTLE_DT;
  tickCount: number;
  playerVolume: number;
  aiVolume: number;
  voiceBoostActive: boolean;
};

export class BattleRuntime {
  readonly context: BattleSimulationContext;
  readonly clock = new FixedStepClock();
  readonly aiVoice: DeterministicAiVoiceBoost;
  inputLog: BattleInputLogV1 | null = null;
  decisionTicks = 0;
  private voiceBoostTicksRemaining = 0;

  constructor(seed: string) {
    this.context = createBattleSimulationContext(seed);
    this.aiVoice = new DeterministicAiVoiceBoost(this.context.random.ai);
  }

  get tickCount() {
    return this.clock.tickCount;
  }

  get voiceBoostSecondsRemaining() {
    return this.voiceBoostTicksRemaining * FIXED_BATTLE_DT;
  }

  beginLaunch(launch: BattleLaunchInputV1) {
    this.clock.reset();
    this.inputLog = createBattleInputLog(this.context.seed, launch);
    this.decisionTicks = 0;
    this.voiceBoostTicksRemaining = 0;
  }

  advance(
    frameDt: number,
    playerVoiceByte: number,
    decisionActive: boolean,
    onTick: (input: BattleTickInput) => boolean | void,
  ) {
    if (!this.inputLog) throw new Error('Battle launch must be recorded before simulation advances.');
    return this.clock.advance(frameDt, (_dt, tickCount) => {
      appendPlayerVoiceFrame(this.inputLog!, playerVoiceByte);
      if (decisionActive) this.decisionTicks += 1;
      const voiceBoostActive = this.voiceBoostTicksRemaining > 0;
      const input: BattleTickInput = {
        dt: FIXED_BATTLE_DT,
        tickCount,
        playerVolume: decodePlayerVoiceFrame(playerVoiceByte),
        aiVolume: this.aiVoice.update(),
        voiceBoostActive,
      };
      if (voiceBoostActive) this.voiceBoostTicksRemaining -= 1;
      return onTick(input);
    });
  }

  recordTurn(playerAction: TurnAction, enemyAction: TurnAction) {
    if (!this.inputLog) throw new Error('Battle launch must be recorded before turns.');
    appendBattleTurn(this.inputLog, {
      turnIndex: this.inputLog.turns.length + 1,
      decisionTicks: this.decisionTicks,
      playerAction,
      enemyAction,
    });
    this.decisionTicks = 0;
  }

  recordQteFinal(turnIndex: number, playerScore: number, enemyScore: number) {
    if (!this.inputLog) throw new Error('Battle launch must be recorded before QTE results.');
    setBattleTurnQteFinal(this.inputLog, turnIndex, { playerScore, enemyScore });
  }

  startVoiceBoost(ticks = DEFAULT_VOICE_BOOST_TICKS) {
    if (!Number.isSafeInteger(ticks) || ticks < 0) throw new RangeError('Voice boost ticks must be a non-negative safe integer.');
    this.voiceBoostTicksRemaining = Math.max(this.voiceBoostTicksRemaining, ticks);
  }
}
