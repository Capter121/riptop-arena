import type { SurvivalRun, SurvivalGrowthLevels } from '../../survival/survivalClient';
import type { TopEntity } from '../top';

export interface SurvivalBattleRuntime {
  maximumIntegrity: number;
  integrity: number;
  burstRisk: number;
  persistentDebuffs: string[];
  growthLevels: SurvivalGrowthLevels;
  nextWaveEffect: SurvivalRun['checkpoint']['nextWaveEffect'];
  riskLevel: number;
  strengthMultiplier: number;
}

export interface SurvivalCombatTuning {
  outputMultiplier: number;
  defenseMultiplier: number;
  stabilityLossMultiplier: number;
  spinLossMultiplier: number;
  mobilityMultiplier: number;
  affinityEffectMultiplier: number;
  pickupEffectMultiplier: number;
}

export function createSurvivalBattleRuntime(run: SurvivalRun): SurvivalBattleRuntime {
  return {
    maximumIntegrity: run.player.maximumIntegrity,
    integrity: run.checkpoint.integrity,
    burstRisk: run.checkpoint.burstRisk,
    persistentDebuffs: [...run.checkpoint.persistentDebuffs],
    growthLevels: { ...run.checkpoint.growthLevels },
    nextWaveEffect: run.checkpoint.nextWaveEffect,
    riskLevel: run.checkpoint.riskLevel,
    strengthMultiplier: run.wave.strengthMultiplier,
  };
}

export function resolveSurvivalCombatTuning(runtime: SurvivalBattleRuntime) {
  const growth = runtime.growthLevels;
  const overdrive = runtime.nextWaveEffect === 'temporary-overdrive';
  const bulwark = runtime.nextWaveEffect === 'temporary-bulwark';
  const endurance = runtime.nextWaveEffect === 'temporary-endurance';
  const playerStability = growth.coordination * 0.06 + (bulwark ? 0.1 : 0);
  const playerSpinEfficiency = growth.coordination * 0.05 + (endurance ? 0.1 : 0);
  const strength = runtime.strengthMultiplier;

  return {
    player: {
      outputMultiplier: 1 + growth['attack-calibration'] * 0.06 + (overdrive ? 0.1 : 0),
      defenseMultiplier: 1 + (bulwark ? 0.1 : 0),
      stabilityLossMultiplier: 1 / (1 + playerStability),
      spinLossMultiplier: 1 / (1 + playerSpinEfficiency),
      mobilityMultiplier: 1 + (overdrive ? 0.1 : 0),
      affinityEffectMultiplier: 1 + growth['affinity-tuning'] * 0.08,
      pickupEffectMultiplier: 1 + growth['pickup-tuning'] * 0.15 + (endurance ? 0.1 : 0),
    },
    enemy: {
      outputMultiplier: strength,
      defenseMultiplier: strength,
      stabilityLossMultiplier: 1 / strength,
      spinLossMultiplier: 1 / strength,
      mobilityMultiplier: strength,
      affinityEffectMultiplier: 1,
      pickupEffectMultiplier: 1,
    },
  } satisfies Record<'player' | 'enemy', SurvivalCombatTuning>;
}

export function applySurvivalBattleRuntime(
  player: TopEntity,
  enemy: TopEntity,
  runtime: SurvivalBattleRuntime,
  playerX = -6,
  enemyX = 6,
) {
  const tuning = resolveSurvivalCombatTuning(runtime);
  player.stats.maxIntegrity = runtime.maximumIntegrity;
  player.position.set(playerX, 0);
  player.velocity.set(0, 0);
  player.spin = player.stats.maxSpin;
  player.stamina = player.stats.maxSpin;
  player.spirit = 0;
  player.integrity = Math.min(runtime.integrity, runtime.maximumIntegrity);
  player.burst = runtime.burstRisk;
  player.survivalPersistentDebuffs = [...runtime.persistentDebuffs];
  player.survivalCombatTuning = tuning.player;

  enemy.position.set(enemyX, 0);
  enemy.velocity.set(0, 0);
  enemy.spin = enemy.stats.maxSpin;
  enemy.stamina = enemy.stats.maxSpin;
  enemy.spirit = 0;
  enemy.survivalCombatTuning = tuning.enemy;
}
