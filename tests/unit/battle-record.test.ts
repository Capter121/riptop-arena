import { describe, expect, it } from 'vitest';
import {
  MAX_DECISION_TICKS,
  BattleRecordError,
  BattleReplayCursor,
  appendBattleTurn,
  appendPlayerVoiceFrame,
  createBattleInputLog,
  createBattleOutcomeSummary,
  setBattleTurnQteFinal,
  stringifyBattleOutcomeSummary,
  validateBattleInputLog,
} from '../../src/sim/battleRecord';

const SEED = '0123456789abcdef0123456789abcdef';
const LAUNCH = {
  playerPower: 0.82345,
  playerAngleDeg: 12.3456,
  enemyPower: 1.5,
  enemyAngleDeg: -50,
};

function validLog() {
  const log = createBattleInputLog(SEED, LAUNCH);
  appendPlayerVoiceFrame(log, 0);
  appendPlayerVoiceFrame(log, 255);
  appendBattleTurn(log, {
    turnIndex: 1,
    decisionTicks: 12,
    playerAction: { kind: 'attack', skillId: 'wind_blade' },
    enemyAction: { kind: 'defense' },
  });
  return log;
}

describe('battle input records', () => {
  it('creates a normalized versioned record', () => {
    const log = createBattleInputLog(SEED, LAUNCH);
    expect(log).toEqual({
      simulationVersion: 1,
      seed: SEED,
      launch: {
        playerPower: 0.823,
        playerAngleDeg: 12.346,
        enemyPower: 1,
        enemyAngleDeg: -35,
      },
      playerVoiceFrames: [],
      turns: [],
    });
  });

  it('accepts sequential turns and completes QTE scores', () => {
    const log = validLog();
    appendBattleTurn(log, {
      turnIndex: 2,
      decisionTicks: 0,
      playerAction: { kind: 'heavy_reflect' },
      enemyAction: { kind: 'attack', skillId: 'blazing_meteor' },
    });
    setBattleTurnQteFinal(log, 2, { playerScore: 101.25, enemyScore: 99.75 });
    expect(log.turns[1]?.qteFinal).toEqual({ playerScore: 101.25, enemyScore: 99.75 });
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, MAX_DECISION_TICKS + 1])(
    'rejects invalid decision ticks %s',
    (decisionTicks) => {
      const log = createBattleInputLog(SEED, LAUNCH);
      expect(() => appendBattleTurn(log, {
        turnIndex: 1,
        decisionTicks,
        playerAction: { kind: 'charge' },
        enemyAction: { kind: 'evade' },
      })).toThrowError(expect.objectContaining({ code: 'INVALID_BATTLE_INPUT' }));
    },
  );

  it('rejects missing, duplicate, or out-of-order turn indexes', () => {
    const log = validLog();
    for (const turnIndex of [1, 3]) {
      expect(() => appendBattleTurn(log, {
        turnIndex,
        decisionTicks: 0,
        playerAction: { kind: 'charge' },
        enemyAction: { kind: 'charge' },
      })).toThrowError(BattleRecordError);
    }
  });

  it('rejects invalid voice frames and invalid runtime actions', () => {
    const log = createBattleInputLog(SEED, LAUNCH);
    for (const value of [-1, 1.5, 256]) {
      expect(() => appendPlayerVoiceFrame(log, value)).toThrowError(BattleRecordError);
    }
    expect(() => appendBattleTurn(log, {
      turnIndex: 1,
      decisionTicks: 0,
      playerAction: { kind: 'attack', skillId: 'unknown' },
      enemyAction: { kind: 'charge' },
    } as never)).toThrowError(BattleRecordError);
  });

  it('validates voice frame count and finite QTE scores', () => {
    const log = validLog();
    expect(() => validateBattleInputLog(log, 3)).toThrowError(BattleRecordError);
    expect(() => setBattleTurnQteFinal(log, 1, {
      playerScore: Number.NaN,
      enemyScore: 20,
    })).toThrowError(BattleRecordError);
    expect(validateBattleInputLog(log, 2)).toBe(log);
  });

  it('replays saved tick inputs and rejects mismatched AI decisions', () => {
    const log = validLog();
    const replay = new BattleReplayCursor(log);
    expect(replay.playerVoiceAtTick(0)).toBe(0);
    expect(replay.playerVoiceAtTick(1)).toBe(255);
    expect(replay.turnAtDecisionTick(1, 11)).toBeNull();
    expect(replay.turnAtDecisionTick(1, 12)).toEqual(log.turns[0]);
    expect(() => replay.assertAiAction(1, { kind: 'evade' })).toThrowError(
      expect.objectContaining({ code: 'AI_REPLAY_MISMATCH' }),
    );
    expect(() => replay.assertAiLaunch(0.2, 0)).toThrowError(
      expect.objectContaining({ code: 'AI_REPLAY_MISMATCH' }),
    );
  });
});

describe('battle outcome summaries', () => {
  it('normalizes finite values, negative zero, and field order', () => {
    const summary = createBattleOutcomeSummary({
      seed: SEED,
      winner: 'player',
      kind: 'burst finish',
      turnCount: 2,
      tickCount: 180,
      player: { spin: 100.1236, integrity: -0, stamina: 80, spirit: 50, burst: 2, tilt: 0.12349, alive: true },
      enemy: { spin: 0, integrity: 0, stamina: 20.5555, spirit: 10, burst: 100, tilt: 1.2, alive: false },
    });
    expect(summary.player).toEqual({
      spin: 100.124,
      integrity: 0,
      stamina: 80,
      spirit: 50,
      burst: 2,
      tilt: 0.123,
      alive: true,
    });
    expect(stringifyBattleOutcomeSummary(summary)).toBe(JSON.stringify(summary));
    expect(stringifyBattleOutcomeSummary(summary)).toContain('"simulationVersion":1,"seed"');
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite outcome values %s',
    (spin) => {
      expect(() => createBattleOutcomeSummary({
        seed: SEED,
        winner: 'enemy',
        kind: 'timeout',
        turnCount: 1,
        tickCount: 60,
        player: { spin, integrity: 1, stamina: 1, spirit: 1, burst: 1, tilt: 1, alive: true },
        enemy: { spin: 1, integrity: 1, stamina: 1, spirit: 1, burst: 1, tilt: 1, alive: true },
      })).toThrowError(expect.objectContaining({ code: 'INVALID_BATTLE_OUTCOME' }));
    },
  );
});
