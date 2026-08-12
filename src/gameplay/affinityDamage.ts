import {
  AFFINITY_DAMAGE_RULES,
  getAffinityRelation,
  type AffinityRelation,
  type PartAffinity,
} from '../../battle-top-designer/shared/nss/affinity';
import type { BattleAffinityProfile } from './battleAffinity';

const ARMOR_K = 30;
const DAMAGE_ROUND_EPSILON = 1e-9;

export type AffinityDamageBreakdown = {
  finalDamage: number;
  armorReduced: number;
  physicalDamage: number;
  elementalDamage: number;
  attackerAffinity: PartAffinity | null;
  defenderAffinity: PartAffinity | null;
  affinityRelation: AffinityRelation;
  resonanceContribution: number;
  relationContribution: number;
};

export function resolveBattleAffinityRelation(
  attacker: BattleAffinityProfile,
  defender: BattleAffinityProfile,
): AffinityRelation {
  if (!attacker.primary || !defender.primary) return 'neutral';
  return getAffinityRelation(attacker.primary, defender.primary);
}

function relationMultiplier(relation: AffinityRelation) {
  if (relation === 'advantage') return AFFINITY_DAMAGE_RULES.advantageMultiplier;
  if (relation === 'disadvantage') return AFFINITY_DAMAGE_RULES.disadvantageMultiplier;
  return AFFINITY_DAMAGE_RULES.neutralMultiplier;
}

export function calculateArmoredDamage(rawDamage: number, armor: number) {
  const safeRawDamage = Math.max(0, rawDamage);
  const safeArmor = Math.max(0, armor);
  const damageReduction = safeArmor / (safeArmor + ARMOR_K);
  const finalDamage = safeRawDamage <= 0
    ? 0
    : Math.max(1, Math.round(safeRawDamage * (1 - damageReduction) + DAMAGE_ROUND_EPSILON));
  return {
    finalDamage,
    armorReduced: Math.max(0, Math.round(safeRawDamage - finalDamage)),
  };
}

function adjustedRawDamage(rawDamage: number, elementalPower: number, relation: AffinityRelation) {
  const physicalRaw = rawDamage * AFFINITY_DAMAGE_RULES.physicalShare;
  const elementalRaw = rawDamage * AFFINITY_DAMAGE_RULES.elementalShare * elementalPower * relationMultiplier(relation);
  return { physicalRaw, combinedRaw: physicalRaw + elementalRaw };
}

export function emptyAffinityDamage(
  attacker: BattleAffinityProfile,
  defender: BattleAffinityProfile,
): AffinityDamageBreakdown {
  return {
    finalDamage: 0,
    armorReduced: 0,
    physicalDamage: 0,
    elementalDamage: 0,
    attackerAffinity: attacker.primary,
    defenderAffinity: defender.primary,
    affinityRelation: resolveBattleAffinityRelation(attacker, defender),
    resonanceContribution: 0,
    relationContribution: 0,
  };
}

export function calculateAffinityDamage(
  rawDamage: number,
  attacker: BattleAffinityProfile,
  defender: BattleAffinityProfile,
  armor: number,
  affinityEffectMultiplier = 1,
): AffinityDamageBreakdown {
  if (rawDamage <= 0) return emptyAffinityDamage(attacker, defender);

  const relation = resolveBattleAffinityRelation(attacker, defender);
  const neutralRaw = adjustedRawDamage(rawDamage, 1, 'neutral').combinedRaw;
  const resonantRaw = adjustedRawDamage(rawDamage, attacker.modifiers.elementalPower, 'neutral').combinedRaw;
  const baseAdjusted = adjustedRawDamage(rawDamage, attacker.modifiers.elementalPower, relation);
  const resonantCombinedRaw = neutralRaw + (resonantRaw - neutralRaw) * affinityEffectMultiplier;
  const adjusted = {
    physicalRaw: baseAdjusted.physicalRaw,
    combinedRaw: neutralRaw + (baseAdjusted.combinedRaw - neutralRaw) * affinityEffectMultiplier,
  };
  const neutralFinal = calculateArmoredDamage(neutralRaw, armor).finalDamage;
  const resonanceFinal = calculateArmoredDamage(resonantCombinedRaw, armor).finalDamage;
  const armored = calculateArmoredDamage(adjusted.combinedRaw, armor);
  const physicalDamage = Math.min(
    armored.finalDamage,
    Math.max(0, Math.round(armored.finalDamage * adjusted.physicalRaw / adjusted.combinedRaw)),
  );

  return {
    ...armored,
    physicalDamage,
    elementalDamage: armored.finalDamage - physicalDamage,
    attackerAffinity: attacker.primary,
    defenderAffinity: defender.primary,
    affinityRelation: relation,
    resonanceContribution: resonanceFinal - neutralFinal,
    relationContribution: armored.finalDamage - resonanceFinal,
  };
}
