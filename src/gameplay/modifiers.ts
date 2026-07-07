import {
  DEFAULT_PHYSICS_MODIFIERS,
  type PhysicsModifiers,
  type TacticalMode,
} from '../types/battle';
import type { TopEntity } from './top';

const TACTICAL_MODE_MODIFIERS: Record<TacticalMode, Partial<PhysicsModifiers>> = {
  balance: {},
  assault: {
    attackMultiplier: 1.24,
    collisionImpulseMultiplier: 1.26,
    damageMultiplier: 1.2,
    burstResistanceMultiplier: 0.88,
    defenseMultiplier: 0.94,
    lockStabilityLossMultiplier: 1.16,
  },
  fortress: {
    defenseMultiplier: 1.26,
    burstResistanceMultiplier: 1.22,
    dashImpulseMultiplier: 0.86,
    wallGripMultiplier: 1.12,
    staminaDrainMultiplier: 0.9,
    damageMultiplier: 0.94,
  },
};

function applyModifierPatch(base: PhysicsModifiers, patch: Partial<PhysicsModifiers>) {
  return {
    attackMultiplier: patch.attackMultiplier ?? base.attackMultiplier,
    defenseMultiplier: patch.defenseMultiplier ?? base.defenseMultiplier,
    staminaDrainMultiplier: patch.staminaDrainMultiplier ?? base.staminaDrainMultiplier,
    burstResistanceMultiplier: patch.burstResistanceMultiplier ?? base.burstResistanceMultiplier,
    collisionImpulseMultiplier: patch.collisionImpulseMultiplier ?? base.collisionImpulseMultiplier,
    wallGripMultiplier: patch.wallGripMultiplier ?? base.wallGripMultiplier,
    damageMultiplier: patch.damageMultiplier ?? base.damageMultiplier,
    spinLossMultiplier: patch.spinLossMultiplier ?? base.spinLossMultiplier,
    dashImpulseMultiplier: patch.dashImpulseMultiplier ?? base.dashImpulseMultiplier,
    lockStabilityLossMultiplier: patch.lockStabilityLossMultiplier ?? base.lockStabilityLossMultiplier,
    velocityReflectionMultiplier: patch.velocityReflectionMultiplier ?? base.velocityReflectionMultiplier,
  };
}

function multiplyModifiers(base: PhysicsModifiers, patch: Partial<PhysicsModifiers>) {
  return {
    attackMultiplier: base.attackMultiplier * (patch.attackMultiplier ?? 1),
    defenseMultiplier: base.defenseMultiplier * (patch.defenseMultiplier ?? 1),
    staminaDrainMultiplier: base.staminaDrainMultiplier * (patch.staminaDrainMultiplier ?? 1),
    burstResistanceMultiplier: base.burstResistanceMultiplier * (patch.burstResistanceMultiplier ?? 1),
    collisionImpulseMultiplier: base.collisionImpulseMultiplier * (patch.collisionImpulseMultiplier ?? 1),
    wallGripMultiplier: base.wallGripMultiplier * (patch.wallGripMultiplier ?? 1),
    damageMultiplier: base.damageMultiplier * (patch.damageMultiplier ?? 1),
    spinLossMultiplier: base.spinLossMultiplier * (patch.spinLossMultiplier ?? 1),
    dashImpulseMultiplier: base.dashImpulseMultiplier * (patch.dashImpulseMultiplier ?? 1),
    lockStabilityLossMultiplier: base.lockStabilityLossMultiplier * (patch.lockStabilityLossMultiplier ?? 1),
    velocityReflectionMultiplier: base.velocityReflectionMultiplier * (patch.velocityReflectionMultiplier ?? 1),
  };
}

function resolveStatusEffectPatch(top: TopEntity, effectId: string): Partial<PhysicsModifiers> {
  switch (effectId) {
    case 'aqua_surge':
      return {
        velocityReflectionMultiplier: 0.5,
      };
    default:
      return top.hasRubberTip
        ? {
            wallGripMultiplier: 1.04,
          }
        : {};
  }
}

export function resolveModifiers(top: TopEntity): PhysicsModifiers {
  let resolved = DEFAULT_PHYSICS_MODIFIERS();
  resolved = applyModifierPatch(resolved, TACTICAL_MODE_MODIFIERS[top.tacticalMode]);

  for (const effect of top.statusEffects) {
    if (effect.remaining <= 0) continue;
    resolved = multiplyModifiers(resolved, resolveStatusEffectPatch(top, effect.id));
  }

  if (top.flags.ignoreNextCollisionDamage) {
    resolved = multiplyModifiers(resolved, {
      defenseMultiplier: 1.15,
      burstResistanceMultiplier: 1.1,
    });
  }

  if (top.hasRubberTip) {
    resolved = multiplyModifiers(resolved, {
      wallGripMultiplier: 1.08,
    });
  }

  return resolved;
}
