import { LAUNCH_MAX_POWER, ROUND_TIME } from '../app/config';
import { ELEMENT_ATTACKS, type TurnAction } from '../types/battle';
import type { FinishKind } from '../gameplay/rules';
import {
  CURRENT_SIMULATION_VERSION,
  parseBattleSeed,
  type BattleSeed,
} from './battleSeed';
import { FIXED_BATTLE_DT } from './fixedStep';

const MAX_LAUNCH_ANGLE_DEG = 35;

export const MAX_DECISION_TICKS = Math.round(ROUND_TIME / FIXED_BATTLE_DT);

export type BattleRecordErrorCode =
  | 'INVALID_BATTLE_INPUT'
  | 'AI_REPLAY_MISMATCH'
  | 'INVALID_BATTLE_OUTCOME';

export class BattleRecordError extends Error {
  readonly code: BattleRecordErrorCode;

  constructor(code: BattleRecordErrorCode, message: string) {
    super(message);
    this.name = 'BattleRecordError';
    this.code = code;
  }
}

export type BattleLaunchInputV1 = {
  playerPower: number;
  playerAngleDeg: number;
  enemyPower: number;
  enemyAngleDeg: number;
};

export type BattleTurnInputV1 = {
  turnIndex: number;
  decisionTicks: number;
  playerAction: TurnAction;
  enemyAction: TurnAction;
  qteFinal?: {
    playerScore: number;
    enemyScore: number;
  };
};

export type BattleInputLogV1 = {
  simulationVersion: typeof CURRENT_SIMULATION_VERSION;
  seed: BattleSeed;
  launch: BattleLaunchInputV1;
  playerVoiceFrames: number[];
  turns: BattleTurnInputV1[];
};

export type FinalTopState = {
  spin: number;
  integrity: number;
  stamina: number;
  spirit: number;
  burst: number;
  tilt: number;
  alive: boolean;
};

export type BattleOutcomeSummaryV1 = {
  simulationVersion: typeof CURRENT_SIMULATION_VERSION;
  seed: BattleSeed;
  winner: 'player' | 'enemy';
  kind: FinishKind;
  turnCount: number;
  tickCount: number;
  player: FinalTopState;
  enemy: FinalTopState;
};

type BattleOutcomeInput = Omit<BattleOutcomeSummaryV1, 'simulationVersion' | 'seed' | 'player' | 'enemy'> & {
  seed: string;
  player: FinalTopState;
  enemy: FinalTopState;
};

function invalidInput(message: string): never {
  throw new BattleRecordError('INVALID_BATTLE_INPUT', message);
}

function round3(value: number, errorCode: 'INVALID_BATTLE_INPUT' | 'INVALID_BATTLE_OUTCOME') {
  if (!Number.isFinite(value)) {
    throw new BattleRecordError(errorCode, 'Battle numbers must be finite.');
  }
  const rounded = Math.round(value * 1_000) / 1_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizeLaunchValue(value: number, min: number, max: number) {
  return round3(Math.max(min, Math.min(max, value)), 'INVALID_BATTLE_INPUT');
}

function normalizeLaunch(launch: BattleLaunchInputV1): BattleLaunchInputV1 {
  for (const value of Object.values(launch)) {
    if (!Number.isFinite(value)) invalidInput('Launch values must be finite.');
  }
  return {
    playerPower: normalizeLaunchValue(launch.playerPower, 0, LAUNCH_MAX_POWER),
    playerAngleDeg: normalizeLaunchValue(launch.playerAngleDeg, -MAX_LAUNCH_ANGLE_DEG, MAX_LAUNCH_ANGLE_DEG),
    enemyPower: normalizeLaunchValue(launch.enemyPower, 0, LAUNCH_MAX_POWER),
    enemyAngleDeg: normalizeLaunchValue(launch.enemyAngleDeg, -MAX_LAUNCH_ANGLE_DEG, MAX_LAUNCH_ANGLE_DEG),
  };
}

function isTurnAction(value: unknown): value is TurnAction {
  if (!value || typeof value !== 'object' || !('kind' in value)) return false;
  const action = value as { kind?: unknown; skillId?: unknown };
  if (action.kind === 'attack') {
    return typeof action.skillId === 'string' && action.skillId in ELEMENT_ATTACKS;
  }
  return action.kind === 'evade'
    || action.kind === 'defense'
    || action.kind === 'charge'
    || action.kind === 'light_reflect'
    || action.kind === 'heavy_reflect';
}

function assertDecisionTicks(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_DECISION_TICKS) {
    invalidInput(`Decision ticks must be within 0..${MAX_DECISION_TICKS}.`);
  }
}

function assertVoiceFrame(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    invalidInput('Player voice frames must be integer bytes.');
  }
}

function assertQteFinal(qteFinal: BattleTurnInputV1['qteFinal']) {
  if (!qteFinal) return;
  if (!Number.isFinite(qteFinal.playerScore) || !Number.isFinite(qteFinal.enemyScore)) {
    invalidInput('QTE scores must be finite.');
  }
}

function assertTurn(turn: BattleTurnInputV1, expectedIndex: number) {
  if (turn.turnIndex !== expectedIndex) invalidInput(`Expected turn index ${expectedIndex}.`);
  assertDecisionTicks(turn.decisionTicks);
  if (!isTurnAction(turn.playerAction) || !isTurnAction(turn.enemyAction)) {
    invalidInput('Turn actions are invalid.');
  }
  assertQteFinal(turn.qteFinal);
}

export function createBattleInputLog(seed: string, launch: BattleLaunchInputV1): BattleInputLogV1 {
  return {
    simulationVersion: CURRENT_SIMULATION_VERSION,
    seed: parseBattleSeed(seed),
    launch: normalizeLaunch(launch),
    playerVoiceFrames: [],
    turns: [],
  };
}

export function appendPlayerVoiceFrame(log: BattleInputLogV1, value: number) {
  assertVoiceFrame(value);
  log.playerVoiceFrames.push(value);
}

export function appendBattleTurn(log: BattleInputLogV1, turn: BattleTurnInputV1) {
  assertTurn(turn, log.turns.length + 1);
  log.turns.push({
    turnIndex: turn.turnIndex,
    decisionTicks: turn.decisionTicks,
    playerAction: { ...turn.playerAction },
    enemyAction: { ...turn.enemyAction },
    ...(turn.qteFinal ? { qteFinal: { ...turn.qteFinal } } : {}),
  });
}

export function setBattleTurnQteFinal(
  log: BattleInputLogV1,
  turnIndex: number,
  qteFinal: NonNullable<BattleTurnInputV1['qteFinal']>,
) {
  assertQteFinal(qteFinal);
  const turn = log.turns[turnIndex - 1];
  if (!turn || turn.turnIndex !== turnIndex) invalidInput(`Unknown turn index ${turnIndex}.`);
  turn.qteFinal = { ...qteFinal };
}

export function validateBattleInputLog(log: BattleInputLogV1, expectedTickCount?: number) {
  if (log.simulationVersion !== CURRENT_SIMULATION_VERSION) invalidInput('Simulation version is unsupported.');
  parseBattleSeed(log.seed);
  normalizeLaunch(log.launch);
  log.playerVoiceFrames.forEach(assertVoiceFrame);
  log.turns.forEach((turn, index) => assertTurn(turn, index + 1));
  if (expectedTickCount !== undefined) {
    if (!Number.isSafeInteger(expectedTickCount) || expectedTickCount < 0) invalidInput('Tick count is invalid.');
    if (log.playerVoiceFrames.length !== expectedTickCount) {
      invalidInput('Player voice frame count must match battle tick count.');
    }
  }
  return log;
}

function normalizeTopState(state: FinalTopState): FinalTopState {
  if (typeof state.alive !== 'boolean') {
    throw new BattleRecordError('INVALID_BATTLE_OUTCOME', 'Alive state must be boolean.');
  }
  return Object.freeze({
    spin: round3(state.spin, 'INVALID_BATTLE_OUTCOME'),
    integrity: round3(state.integrity, 'INVALID_BATTLE_OUTCOME'),
    stamina: round3(state.stamina, 'INVALID_BATTLE_OUTCOME'),
    spirit: round3(state.spirit, 'INVALID_BATTLE_OUTCOME'),
    burst: round3(state.burst, 'INVALID_BATTLE_OUTCOME'),
    tilt: round3(state.tilt, 'INVALID_BATTLE_OUTCOME'),
    alive: state.alive,
  });
}

export function createBattleOutcomeSummary(input: BattleOutcomeInput): BattleOutcomeSummaryV1 {
  if (!Number.isSafeInteger(input.turnCount) || input.turnCount < 0) {
    throw new BattleRecordError('INVALID_BATTLE_OUTCOME', 'Turn count is invalid.');
  }
  if (!Number.isSafeInteger(input.tickCount) || input.tickCount < 0) {
    throw new BattleRecordError('INVALID_BATTLE_OUTCOME', 'Tick count is invalid.');
  }
  return Object.freeze({
    simulationVersion: CURRENT_SIMULATION_VERSION,
    seed: parseBattleSeed(input.seed),
    winner: input.winner,
    kind: input.kind,
    turnCount: input.turnCount,
    tickCount: input.tickCount,
    player: normalizeTopState(input.player),
    enemy: normalizeTopState(input.enemy),
  });
}

export function stringifyBattleOutcomeSummary(summary: BattleOutcomeSummaryV1) {
  return JSON.stringify(summary);
}

export class BattleReplayCursor {
  private readonly log: BattleInputLogV1;

  constructor(log: BattleInputLogV1) {
    this.log = validateBattleInputLog(log);
  }

  playerVoiceAtTick(tickIndex: number) {
    const value = this.log.playerVoiceFrames[tickIndex];
    if (value === undefined) invalidInput(`Missing player voice frame at tick ${tickIndex}.`);
    return value;
  }

  turnAtDecisionTick(turnIndex: number, elapsedDecisionTicks: number) {
    const turn = this.log.turns[turnIndex - 1];
    if (!turn || turn.turnIndex !== turnIndex) invalidInput(`Missing turn ${turnIndex}.`);
    if (elapsedDecisionTicks < turn.decisionTicks) return null;
    if (elapsedDecisionTicks > turn.decisionTicks) invalidInput(`Missed replay tick for turn ${turnIndex}.`);
    return turn;
  }

  assertAiLaunch(power: number, angleDeg: number) {
    const actual = normalizeLaunchValue(power, 0, LAUNCH_MAX_POWER);
    const actualAngle = normalizeLaunchValue(angleDeg, -MAX_LAUNCH_ANGLE_DEG, MAX_LAUNCH_ANGLE_DEG);
    if (actual !== this.log.launch.enemyPower || actualAngle !== this.log.launch.enemyAngleDeg) {
      throw new BattleRecordError('AI_REPLAY_MISMATCH', 'AI launch parameters do not match the record.');
    }
  }

  assertAiAction(turnIndex: number, action: TurnAction) {
    const expected = this.log.turns[turnIndex - 1];
    if (!expected || JSON.stringify(expected.enemyAction) !== JSON.stringify(action)) {
      throw new BattleRecordError('AI_REPLAY_MISMATCH', `AI action does not match turn ${turnIndex}.`);
    }
  }
}
