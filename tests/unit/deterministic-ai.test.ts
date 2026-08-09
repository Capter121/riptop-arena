import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EnemyPreset } from '../../src/data/enemies';
import {
  advanceAiQteScore,
  pickAiLaunch,
  pickAiTurnAction,
} from '../../src/gameplay/ai';
import { ClashAI } from '../../src/gameplay/clashAI';
import { createBattleSimulationContext } from '../../src/sim/battleSeed';
import { FIXED_BATTLE_DT } from '../../src/sim/fixedStep';
import type { RandomSource } from '../../src/sim/rng';

const SEED = '0123456789abcdef0123456789abcdef';

function sequenceRandom(values: number[]): RandomSource {
  let index = 0;
  const next = () => {
    const value = values[index];
    if (value === undefined) throw new Error(`Missing random value at index ${index}.`);
    index += 1;
    return value;
  };
  return {
    nextFloat: next,
    nextUint32: () => Math.floor(next() * 0x1_0000_0000) >>> 0,
    nextInt: (min, maxExclusive) => min + Math.floor(next() * (maxExclusive - min)),
  };
}

function preset(name: string): EnemyPreset {
  return {
    id: name,
    name,
    description: '',
    aggression: 1,
    crown: '',
    build: { attackRing: 'slash', core: 'light', driver: 'rush' },
  };
}

describe('deterministic turn AI', () => {
  afterEach(() => vi.restoreAllMocks());

  it('preserves stealth misdirection and weighted attack branches', () => {
    expect(pickAiTurnAction({
      playerHasStealthEffect: true,
      enemySpirit: 100,
      enemyTacticalMode: 'balance',
    }, sequenceRandom([0.2, 0.1]))).toEqual({ kind: 'charge' });

    expect(pickAiTurnAction({
      playerHasStealthEffect: true,
      enemySpirit: 100,
      enemyTacticalMode: 'balance',
    }, sequenceRandom([0.2, 0.9, 0]))).toEqual({ kind: 'attack', skillId: 'wind_blade' });

    expect(pickAiTurnAction({
      playerHasStealthEffect: false,
      enemySpirit: 100,
      enemyTacticalMode: 'assault',
    }, sequenceRandom([0.2, 0.99]))).toEqual({ kind: 'attack', skillId: 'phantom_clone' });
  });

  it('preserves low-spirit tactical branches', () => {
    expect(pickAiTurnAction({
      playerHasStealthEffect: false,
      enemySpirit: 0,
      enemyTacticalMode: 'balance',
    }, sequenceRandom([0.1]))).toEqual({ kind: 'charge' });
    expect(pickAiTurnAction({
      playerHasStealthEffect: false,
      enemySpirit: 0,
      enemyTacticalMode: 'fortress',
    }, sequenceRandom([0.2]))).toEqual({ kind: 'defense' });
  });

  it('recreates actions from the same AI stream', () => {
    const first = createBattleSimulationContext(SEED).random.ai;
    const second = createBattleSimulationContext(SEED).random.ai;
    const input = {
      playerHasStealthEffect: false,
      enemySpirit: 80,
      enemyTacticalMode: 'balance' as const,
    };
    expect(Array.from({ length: 20 }, () => pickAiTurnAction(input, first)))
      .toEqual(Array.from({ length: 20 }, () => pickAiTurnAction(input, second)));
  });

  it('creates deterministic launch parameters in the existing ranges', () => {
    const first = pickAiLaunch(createBattleSimulationContext(SEED).random.ai);
    const second = pickAiLaunch(createBattleSimulationContext(SEED).random.ai);
    expect(first).toEqual(second);
    expect(first.power).toBeGreaterThanOrEqual(0.78);
    expect(first.power).toBeLessThan(0.9);
    expect(first.angleDeg).toBeGreaterThanOrEqual(-9);
    expect(first.angleDeg).toBeLessThan(9);
  });

  it('advances QTE pressure from fixed tick time and one AI draw', () => {
    const result = advanceAiQteScore({
      score: 50,
      aiRate: 20,
      tier: 3,
      tickCount: 120,
    }, sequenceRandom([0.5]));
    const surge = 1 + Math.sin(120 * FIXED_BATTLE_DT * 8.5 + 3) * 0.08 + 0.5 * 0.12;
    expect(result).toBeCloseTo(50 + 20 * surge * FIXED_BATTLE_DT, 12);
  });

  it('never reads global randomness', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('global random used'); });
    expect(() => pickAiTurnAction({
      playerHasStealthEffect: false,
      enemySpirit: 100,
      enemyTacticalMode: 'balance',
    }, sequenceRandom([0.1, 0.2]))).not.toThrow();
    expect(() => pickAiLaunch(sequenceRandom([0.5, 0.5]))).not.toThrow();
    expect(() => advanceAiQteScore({ score: 0, aiRate: 1, tier: 1, tickCount: 1 }, sequenceRandom([0.5]))).not.toThrow();
  });
});

describe('deterministic clash AI', () => {
  it('uses the supplied stream for action and attack power', () => {
    const ai = new ClashAI(preset('Blaze Fang'));
    expect(ai.decide(3, null, false, sequenceRandom([0.1, 0.9]))).toEqual({ type: 'attack', power: 2 });
  });

  it('uses the supplied stream for stealth choices', () => {
    const ai = new ClashAI(preset('Atlas Guard'));
    expect(ai.decide(3, null, true, sequenceRandom([0.8, 0.1, 0.9]))).toEqual({ type: 'attack', power: 2 });
  });
});
