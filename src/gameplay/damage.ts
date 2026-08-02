import type { TopEntity } from './top';
import { SKILL_BASE_DAMAGE, type SkillTier } from '../types/battle';
import {
  calculateAffinityDamage,
  calculateArmoredDamage,
  emptyAffinityDamage,
} from './affinityDamage';
import type { AffinityRelation, PartAffinity } from '../../battle-top-designer/shared/nss/affinity';

const ATTACK_DAMAGE_FACTOR = 25;
const COUNTER_MULTIPLIER = 1.75;

export type DamageResult = {
  skillTier: SkillTier;
  skillBaseDamage: number;
  attackBonus: number;
  contextMultiplier: number;
  rawDamage: number;
  finalDamage: number;
  armorReduced: number;
  physicalDamage: number;
  elementalDamage: number;
  attackerAffinity: PartAffinity | null;
  defenderAffinity: PartAffinity | null;
  affinityRelation: AffinityRelation;
  resonanceContribution: number;
  relationContribution: number;
  didCrit: boolean;
  didMiss: boolean;
  lockDamage: number;
  tags: Array<'hit' | 'crit' | 'miss' | 'block' | 'counter' | 'clash'>;
  defender: 'player' | 'enemy';
};

export type DamageContext = {
  attacker: TopEntity;
  defender: TopEntity;
  isCounter: boolean;
  isClash: boolean;
  isBlockOrMiss: boolean;
  skillTier: SkillTier;
  contextMultiplier?: number;
  random?: () => number;
};

export function calculateTurnDamage(ctx: DamageContext): DamageResult {
  const {
    attacker,
    defender,
    isCounter,
    isClash,
    isBlockOrMiss,
    skillTier,
    contextMultiplier = 1,
    random = Math.random,
  } = ctx;

  const skillBaseDamage = SKILL_BASE_DAMAGE[skillTier];
  const attackBonus = attacker.stats.attack * ATTACK_DAMAGE_FACTOR;
  const effectiveContextMultiplier = isCounter ? COUNTER_MULTIPLIER : contextMultiplier;
  const emptyDamage = emptyAffinityDamage(attacker.stats.affinity, defender.stats.affinity);

  const result: DamageResult = {
    skillTier,
    skillBaseDamage,
    attackBonus,
    contextMultiplier: effectiveContextMultiplier,
    rawDamage: 0,
    ...emptyDamage,
    didCrit: false,
    didMiss: false,
    lockDamage: 0,
    tags: [],
    defender: defender.side === 'player' ? 'player' : 'enemy',
  };

  if (isBlockOrMiss) {
    result.didMiss = true;
    result.tags.push('block');
    return result;
  }

  let rawDamage = (skillBaseDamage + attackBonus) * effectiveContextMultiplier;

  if (!isCounter && !isClash) {
    if (random() < defender.stats.evasion) {
      result.didMiss = true;
      result.tags.push('miss');
      return result;
    }
  }

  const isCrit = !isCounter && !isClash && random() < attacker.stats.critChance;

  if (isCounter) {
    result.tags.push('counter');
    result.lockDamage += 50;
  } else if (isCrit) {
    rawDamage *= attacker.stats.critMultiplier;
    result.didCrit = true;
    result.tags.push('crit');
    result.lockDamage += 50;
  } else {
    result.tags.push('hit');
    result.lockDamage += 10;
  }

  if (isClash) {
    result.tags.push('clash');
  }

  result.rawDamage = rawDamage;
  Object.assign(result, calculateAffinityDamage(
    rawDamage,
    attacker.stats.affinity,
    defender.stats.affinity,
    defender.stats.armor,
  ));

  return result;
}

export function scaleDamageResult(
  result: DamageResult,
  ratio: number,
  defender: 'player' | 'enemy',
): DamageResult {
  const finalDamage = Math.max(0, Math.round(result.finalDamage * ratio));
  const physicalDamage = Math.min(finalDamage, Math.max(0, Math.round(result.physicalDamage * ratio)));
  const totalContribution = Math.round((result.resonanceContribution + result.relationContribution) * ratio);
  const resonanceContribution = Math.round(result.resonanceContribution * ratio);
  return {
    ...result,
    contextMultiplier: result.contextMultiplier * ratio,
    rawDamage: result.rawDamage * ratio,
    finalDamage,
    armorReduced: Math.max(0, Math.round(result.armorReduced * ratio)),
    physicalDamage,
    elementalDamage: finalDamage - physicalDamage,
    resonanceContribution,
    relationContribution: totalContribution - resonanceContribution,
    lockDamage: result.lockDamage * ratio,
    defender,
  };
}

export function createNeutralRecoilDamage(
  result: DamageResult,
  ratio: number,
  defender: TopEntity,
): DamageResult {
  const rawDamage = result.rawDamage * ratio;
  const armored = calculateArmoredDamage(rawDamage, defender.stats.armor);
  return {
    ...result,
    contextMultiplier: result.contextMultiplier * ratio,
    rawDamage,
    ...armored,
    physicalDamage: armored.finalDamage,
    elementalDamage: 0,
    attackerAffinity: null,
    defenderAffinity: defender.stats.affinity.primary,
    affinityRelation: 'neutral',
    resonanceContribution: 0,
    relationContribution: 0,
    didCrit: false,
    didMiss: false,
    lockDamage: result.lockDamage * ratio,
    tags: ['hit'],
    defender: defender.side === 'player' ? 'player' : 'enemy',
  };
}

export function applyDamageResult(defender: TopEntity, result: DamageResult) {
  if (result.didMiss || result.finalDamage <= 0) return;

  defender.integrity = Math.max(0, defender.integrity - result.finalDamage);
  defender.lockStability = Math.max(0, defender.lockStability - result.lockDamage);
}
