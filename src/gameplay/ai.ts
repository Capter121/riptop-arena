import type { EnemyPreset } from '../data/enemies';
import { TUNING } from '../data/tuning';
import { ELEMENT_ATTACKS, type SkillTier, type TacticalMode, type TurnAction } from '../types/battle';
import { FIXED_BATTLE_DT } from '../sim/fixedStep';
import type { RandomSource } from '../sim/rng';
import type { TopEntity } from './top';

export type TurnAiInput = {
  playerHasStealthEffect: boolean;
  enemySpirit: number;
  enemyTacticalMode: TacticalMode;
};

export type AiQteInput = {
  score: number;
  aiRate: number;
  tier: SkillTier;
  tickCount: number;
};

export function pickAiTurnAction(input: TurnAiInput, random: RandomSource): TurnAction {
  const affordableAttacks = (Object.keys(ELEMENT_ATTACKS) as Array<keyof typeof ELEMENT_ATTACKS>)
    .filter(skillId => input.enemySpirit >= ELEMENT_ATTACKS[skillId].spiritCost);

  if (input.playerHasStealthEffect && random.nextFloat() < 0.3) {
    const roll = random.nextFloat();
    if (roll < 0.25) return { kind: 'charge' };
    if (roll < 0.5) return { kind: 'defense' };
    if (roll < 0.75) return { kind: 'evade' };
    if (affordableAttacks.length > 0) {
      return { kind: 'attack', skillId: affordableAttacks[random.nextInt(0, affordableAttacks.length)]! };
    }
    return { kind: 'charge' };
  }

  const isAssault = input.enemyTacticalMode === 'assault';
  const isFortress = input.enemyTacticalMode === 'fortress';

  if (input.enemySpirit < 25 || affordableAttacks.length === 0) {
    if (isFortress) {
      if (random.nextFloat() < 0.4) return { kind: 'defense' };
      return random.nextFloat() < 0.6 ? { kind: 'evade' } : { kind: 'charge' };
    }
    if (random.nextFloat() < 0.72) return { kind: 'charge' };
    return random.nextFloat() < 0.5 ? { kind: 'defense' } : { kind: 'evade' };
  }

  const roll = random.nextFloat();
  const attackThreshold = isAssault ? 0.75 : 0.58;
  if (roll < attackThreshold) {
    const weighted = affordableAttacks.flatMap((skillId) => {
      const tier = ELEMENT_ATTACKS[skillId].tier;
      return Array.from({ length: isAssault && tier === 1 ? tier * 3 : tier }, () => skillId);
    });
    return { kind: 'attack', skillId: weighted[random.nextInt(0, weighted.length)]! };
  }

  const defenseThreshold = isFortress ? 0.85 : attackThreshold + 0.16;
  if (roll < defenseThreshold) return { kind: 'defense' };
  const evadeThreshold = isFortress ? 0.95 : defenseThreshold + 0.16;
  if (roll < evadeThreshold) return { kind: 'evade' };
  return { kind: 'charge' };
}

export function pickAiLaunch(random: RandomSource) {
  return {
    power: 0.78 + random.nextFloat() * 0.12,
    angleDeg: (random.nextFloat() - 0.5) * 18,
  };
}

export function createAiQteRate(enemyPressure: number, random: RandomSource) {
  return enemyPressure * (0.88 + random.nextFloat() * 0.24);
}

export function advanceAiQteScore(input: AiQteInput, random: RandomSource) {
  const fixedTime = input.tickCount * FIXED_BATTLE_DT;
  const surge = 1 + Math.sin(fixedTime * 8.5 + input.tier) * 0.08 + random.nextFloat() * 0.12;
  return input.score + input.aiRate * surge * FIXED_BATTLE_DT;
}

export class ArenaAI {
  private readonly preset: EnemyPreset;

  constructor(preset: EnemyPreset) {
    this.preset = preset;
  }

  update(self: TopEntity, target: TopEntity, dt: number, arenaRatio: number) {
    if (!self.alive) return;

    const dx = target.position.x - self.position.x;
    const dz = target.position.y - self.position.y;
    const dist = Math.max(Math.hypot(dx, dz), 0.01);
    const seek = ((0.65 + this.preset.aggression * 0.7) * TUNING.aiSeekStrength * dt) / dist;

    self.velocity.x += dx * seek;
    self.velocity.y += dz * seek;

    if (arenaRatio > 0.82) {
      self.velocity.x -= self.position.x * dt * 1.9;
      self.velocity.y -= self.position.y * dt * 1.9;
    }
  }
}
