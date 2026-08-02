import { TUNING } from '../data/tuning';
import type { BattleAffinityProfile } from './battleAffinity';

const COLLISION_TILT_SCALE = 0.0025;
const COLLISION_TILT_MAX = 0.04;

export function calculateNaturalSpinLoss(
  baseSpinLoss: number,
  arenaMultiplier: number,
  affinity: BattleAffinityProfile,
) {
  return baseSpinLoss * arenaMultiplier * affinity.modifiers.spinDrainMultiplier;
}

export function calculateLowSpinTiltDelta(
  currentTilt: number,
  tiltTarget: number,
  dt: number,
  affinity: BattleAffinityProfile,
) {
  const growth = tiltTarget * TUNING.tiltGainScale * affinity.modifiers.tiltGrowthMultiplier;
  const recovery = currentTilt * TUNING.tiltRecoverScale;
  return (growth - recovery) * dt * 7;
}

export function calculateCollisionTiltGain(
  impulseMagnitude: number,
  affinity: BattleAffinityProfile,
  shielded: boolean,
  suppressDamage: boolean,
) {
  if (shielded || suppressDamage) return 0;
  const baseGain = Math.min(COLLISION_TILT_MAX, Math.max(0, impulseMagnitude * COLLISION_TILT_SCALE));
  return baseGain * affinity.modifiers.tiltGrowthMultiplier;
}
