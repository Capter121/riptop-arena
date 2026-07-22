import type { TopEntity } from './top';
import { SKILL_BASE_DAMAGE, type SkillTier } from '../types/battle';

const ARMOR_K = 30;
const ATTACK_DAMAGE_FACTOR = 25;
const COUNTER_MULTIPLIER = 1.75;
const DAMAGE_ROUND_EPSILON = 1e-9;

export type DamageResult = {
  skillTier: SkillTier;
  skillBaseDamage: number;
  attackBonus: number;
  contextMultiplier: number;
  rawDamage: number;
  finalDamage: number;
  armorReduced: number;
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

  const result: DamageResult = {
    skillTier,
    skillBaseDamage,
    attackBonus,
    contextMultiplier: effectiveContextMultiplier,
    rawDamage: 0,
    finalDamage: 0,
    armorReduced: 0,
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

  const armor = Math.max(0, defender.stats.armor);
  const damageReduction = armor / (armor + ARMOR_K);
  result.finalDamage = Math.max(1, Math.round(rawDamage * (1 - damageReduction) + DAMAGE_ROUND_EPSILON));
  result.armorReduced = Math.max(0, Math.round(result.rawDamage - result.finalDamage));

  return result;
}

export function applyDamageResult(defender: TopEntity, result: DamageResult) {
  if (result.didMiss || result.finalDamage <= 0) return;

  defender.integrity = Math.max(0, defender.integrity - result.finalDamage);
  defender.lockStability = Math.max(0, defender.lockStability - result.lockDamage);
}
