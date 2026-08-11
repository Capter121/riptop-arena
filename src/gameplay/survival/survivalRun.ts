import type { SurvivalRun, SurvivalGrowthLevels } from '../../survival/survivalClient';

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
