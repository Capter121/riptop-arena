import { describe, expect, it } from 'vitest';
import { CAMPAIGN_AI_WEIGHTS, getCampaignAiWeights } from '../../src/gameplay/aiProfiles';
import { pickAiTurnAction } from '../../src/gameplay/ai';
import { createBattleSimulationContext } from '../../src/sim/battleSeed';
import type { RandomSource } from '../../src/sim/rng';

const SEED = 'fedcba9876543210fedcba9876543210';

function sequenceRandom(values: number[]): RandomSource {
  let index = 0;
  const next = () => values[index++] ?? 0;
  return {
    nextFloat: next,
    nextUint32: () => Math.floor(next() * 0x1_0000_0000) >>> 0,
    nextInt: (min, maxExclusive) => min + Math.floor(next() * (maxExclusive - min)),
  };
}

describe('campaign AI profiles', () => {
  it('exposes the eight approved weight tables', () => {
    expect(Object.keys(CAMPAIGN_AI_WEIGHTS)).toEqual([
      'assault', 'skirmisher', 'control', 'sustain', 'ringout', 'counter', 'mixup', 'fortress',
    ]);
    expect(getCampaignAiWeights('assault')).toEqual({ attack: 50, dodge: 10, guard: 10, charge: 20, reflectLight: 5, reflectHeavy: 5 });
    expect(getCampaignAiWeights('fortress')).toEqual({ attack: 10, dodge: 5, guard: 30, charge: 20, reflectLight: 10, reflectHeavy: 25 });
    expect(Object.values(CAMPAIGN_AI_WEIGHTS).every(weights => Object.values(weights).reduce((sum, value) => sum + value, 0) === 100)).toBe(true);
  });

  it('filters unaffordable attacks and defensive actions before weighting', () => {
    const noResources = {
      playerHasStealthEffect: false,
      enemySpirit: 0,
      enemyFreeDefensiveMoves: 0,
      enemyTacticalMode: 'balance' as const,
      campaignAiProfileId: 'assault' as const,
    };
    expect(pickAiTurnAction(noResources, sequenceRandom([0]))).toEqual({ kind: 'charge' });
    expect(pickAiTurnAction({ ...noResources, campaignAiProfileId: 'fortress' }, sequenceRandom([0.8])))
      .toEqual({ kind: 'heavy_reflect' });
  });

  it('keeps one free defensive move eligible without spirit', () => {
    expect(pickAiTurnAction({
      playerHasStealthEffect: false,
      enemySpirit: 0,
      enemyFreeDefensiveMoves: 1,
      enemyTacticalMode: 'balance',
      campaignAiProfileId: 'fortress',
    }, sequenceRandom([0.01]))).toEqual({ kind: 'evade' });
  });

  it('replays campaign profile choices from the same deterministic stream', () => {
    const first = createBattleSimulationContext(SEED).random.ai;
    const second = createBattleSimulationContext(SEED).random.ai;
    const input = {
      playerHasStealthEffect: false,
      enemySpirit: 100,
      enemyFreeDefensiveMoves: 0,
      enemyTacticalMode: 'balance' as const,
      campaignAiProfileId: 'mixup' as const,
    };
    expect(Array.from({ length: 30 }, () => pickAiTurnAction(input, first)))
      .toEqual(Array.from({ length: 30 }, () => pickAiTurnAction(input, second)));
  });
});
