import { describe, expect, it } from 'vitest';
import type { TopEntity } from '../../src/gameplay/top';
import { buildStats } from '../../src/gameplay/build';
import { DEFAULT_BUILD } from '../../src/data/parts';
import { calculateTurnDamage } from '../../src/gameplay/damage';
import { resolveModifiers } from '../../src/gameplay/modifiers';
import { calculatePickupRecovery } from '../../src/gameplay/pickups';
import type { RandomSource } from '../../src/sim/rng';
import {
  applySurvivalBattleRuntime,
  createSurvivalBattleRuntime,
  resolveSurvivalCombatTuning,
} from '../../src/gameplay/survival/survivalRun';
import type { SurvivalRun } from '../../src/survival/survivalClient';

const run = {
  player: { maximumIntegrity: 2000 },
  wave: { strengthMultiplier: 1.32 },
  checkpoint: {
    integrity: 1234,
    burstRisk: 18,
    persistentDebuffs: ['scuffed'],
    growthLevels: {
      'attack-calibration': 3,
      coordination: 3,
      'affinity-tuning': 3,
      'pickup-tuning': 3,
    },
    nextWaveEffect: 'temporary-overdrive',
    riskLevel: 2,
  },
} as SurvivalRun;

function top() {
  const state = { position: [0, 0], velocity: [0, 0] };
  return {
    entity: {
    stats: { maxIntegrity: 1660, maxSpin: 120 },
    position: { set: (x: number, y: number) => { state.position = [x, y]; } },
    velocity: { set: (x: number, y: number) => { state.velocity = [x, y]; } },
    spin: 20,
    stamina: 10,
    spirit: 90,
    integrity: 400,
    burst: 70,
    survivalCombatTuning: null,
    survivalPersistentDebuffs: [],
    } as unknown as TopEntity,
    state,
  };
}

const random: RandomSource = {
  nextFloat: () => 0.5,
  nextUint32: () => 0x80000000,
  nextInt: (min, max) => min + Math.floor((max - min) / 2),
};

describe('survival battle boundaries', () => {
  it('resolves approved permanent and one-wave effects additively', () => {
    expect(resolveSurvivalCombatTuning(createSurvivalBattleRuntime(run))).toEqual({
      player: {
        outputMultiplier: 1.28,
        defenseMultiplier: 1,
        stabilityLossMultiplier: 1 / 1.18,
        spinLossMultiplier: 1 / 1.15,
        mobilityMultiplier: 1.1,
        affinityEffectMultiplier: 1.24,
        pickupEffectMultiplier: 1.45,
      },
      enemy: {
        outputMultiplier: 1.32,
        defenseMultiplier: 1.32,
        stabilityLossMultiplier: 1 / 1.32,
        spinLossMultiplier: 1 / 1.32,
        mobilityMultiplier: 1.32,
        affinityEffectMultiplier: 1,
        pickupEffectMultiplier: 1,
      },
    });
  });

  it.each([
    ['temporary-bulwark', 1.1, 1 / 1.1, 1, 1],
    ['temporary-endurance', 1, 1, 1 / 1.1, 1.1],
    [null, 1, 1, 1, 1],
  ] as const)('applies %s without changing unrelated channels', (effect, defense, stability, spin, pickup) => {
    const runtime = createSurvivalBattleRuntime({
      ...run,
      checkpoint: {
        ...run.checkpoint,
        growthLevels: { 'attack-calibration': 0, coordination: 0, 'affinity-tuning': 0, 'pickup-tuning': 0 },
        nextWaveEffect: effect,
      },
    });
    const tuning = resolveSurvivalCombatTuning(runtime).player;
    expect(tuning).toMatchObject({
      outputMultiplier: 1,
      defenseMultiplier: defense,
      stabilityLossMultiplier: stability,
      spinLossMultiplier: spin,
      mobilityMultiplier: 1,
      affinityEffectMultiplier: 1,
      pickupEffectMultiplier: pickup,
    });
  });

  it('inherits checkpoint durability but resets per-wave combat state', () => {
    const player = top();
    const enemy = top();
    applySurvivalBattleRuntime(player.entity, enemy.entity, createSurvivalBattleRuntime(run), -6, 6);

    expect(player.entity.stats.maxIntegrity).toBe(2000);
    expect(player.entity.integrity).toBe(1234);
    expect(player.entity.burst).toBe(18);
    expect(player.entity.survivalPersistentDebuffs).toEqual(['scuffed']);
    expect(player.entity.spin).toBe(120);
    expect(player.entity.stamina).toBe(120);
    expect(player.entity.spirit).toBe(0);
    expect(player.state).toEqual({ position: [-6, 0], velocity: [0, 0] });
    expect(enemy.state).toEqual({ position: [6, 0], velocity: [0, 0] });
    expect(player.entity.survivalCombatTuning).not.toBeNull();
    expect(enemy.entity.survivalCombatTuning).not.toBeNull();
  });

  it('routes tuning into turn damage, physics modifiers, and pickup recovery', () => {
    const tuning = resolveSurvivalCombatTuning(createSurvivalBattleRuntime(run));
    const stats = buildStats(DEFAULT_BUILD);
    const attacker = { side: 'player', stats, survivalCombatTuning: tuning.player } as TopEntity;
    const defender = { side: 'enemy', stats, survivalCombatTuning: tuning.enemy } as TopEntity;
    const baseAttacker = { side: 'player', stats, survivalCombatTuning: null } as TopEntity;
    const baseDefender = { side: 'enemy', stats, survivalCombatTuning: null } as TopEntity;
    const context = { skillTier: 1 as const, isCounter: false, isClash: false, isBlockOrMiss: false, random };
    const base = calculateTurnDamage({ ...context, attacker: baseAttacker, defender: baseDefender });
    const tuned = calculateTurnDamage({ ...context, attacker, defender });

    expect(tuned.rawDamage).toBeCloseTo(base.rawDamage * 1.28 / 1.32, 10);
    expect(resolveModifiers({
      tacticalMode: 'balance', statusEffects: [], flags: { ignoreNextCollisionDamage: false }, hasRubberTip: false,
      survivalCombatTuning: tuning.player,
    } as unknown as TopEntity)).toMatchObject({
      damageMultiplier: 1.28,
      defenseMultiplier: 1,
      spinLossMultiplier: 1 / 1.15,
      dashImpulseMultiplier: 1.1,
      lockStabilityLossMultiplier: 1 / 1.18,
    });
    expect(calculatePickupRecovery(1000, tuning.player.pickupEffectMultiplier)).toBe(217.5);
  });

  it('amplifies only an existing affinity contribution', () => {
    const affinityRun = {
      ...run,
      wave: { ...run.wave, strengthMultiplier: 1 },
      checkpoint: {
        ...run.checkpoint,
        growthLevels: { 'attack-calibration': 0, coordination: 0, 'affinity-tuning': 3, 'pickup-tuning': 0 },
        nextWaveEffect: null,
      },
    };
    const tuning = resolveSurvivalCombatTuning(createSurvivalBattleRuntime(affinityRun));
    const fire = {
      source: 'nss' as const, primary: 'FIRE' as const, resonance: { kind: 'offense' as const, affinity: 'FIRE' as const, count: 5, bonus: 0.15 },
      modifiers: { elementalPower: 1.15, defenseMultiplier: 1, spinDrainMultiplier: 1, tiltGrowthMultiplier: 1 },
    };
    const wood = {
      source: 'nss' as const, primary: 'WOOD' as const, resonance: { kind: 'none' as const },
      modifiers: { elementalPower: 1, defenseMultiplier: 1, spinDrainMultiplier: 1, tiltGrowthMultiplier: 1 },
    };
    const attackerStats = { ...buildStats(DEFAULT_BUILD), affinity: fire, attack: 0, critChance: 0 };
    const defenderStats = { ...buildStats(DEFAULT_BUILD), affinity: wood, armor: 0, evasion: 0 };
    const base = calculateTurnDamage({
      attacker: { side: 'player', stats: attackerStats, survivalCombatTuning: null } as TopEntity,
      defender: { side: 'enemy', stats: defenderStats, survivalCombatTuning: null } as TopEntity,
      skillTier: 1, isCounter: false, isClash: false, isBlockOrMiss: false, random,
    });
    const tuned = calculateTurnDamage({
      attacker: { side: 'player', stats: attackerStats, survivalCombatTuning: tuning.player } as TopEntity,
      defender: { side: 'enemy', stats: defenderStats, survivalCombatTuning: tuning.enemy } as TopEntity,
      skillTier: 1, isCounter: false, isClash: false, isBlockOrMiss: false, random,
    });

    expect(tuned.rawDamage).toBe(base.rawDamage);
    expect(tuned.elementalDamage).toBeGreaterThan(base.elementalDamage);
    expect(tuned.resonanceContribution).toBeGreaterThan(base.resonanceContribution);
    expect(tuned.relationContribution).toBeGreaterThan(base.relationContribution);
  });
});
