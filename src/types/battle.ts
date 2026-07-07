export type TacticalMode = 'balance' | 'assault' | 'fortress';

export type SkillId =
  | 'wind_blade'
  | 'aqua_surge'
  | 'frost_bite'
  | 'lightning_bolt'
  | 'blazing_meteor'
  | 'phantom_clone';

export type ElementAttackSkillId = Exclude<SkillId, 'frost_bite'>;

export type BattleSide = 'player' | 'enemy';

export type TurnActionKind = 'attack' | 'evade' | 'defense' | 'charge';

export type TurnAction =
  | { kind: 'attack'; skillId: ElementAttackSkillId }
  | { kind: 'evade' }
  | { kind: 'defense' }
  | { kind: 'charge' };

export type TurnVisual = 'attack' | 'evade' | 'defense' | 'charge' | 'hit' | 'clash' | 'idle';

export type ElementAttackMeta = {
  skillId: ElementAttackSkillId;
  label: string;
  icon: string;
  tier: 1 | 2 | 3 | 4 | 5;
  spiritCost: number;
  color: string;
};

export const MAX_SPIRIT = 100;
export const TURN_CHARGE_SPIRIT = 20;

export const ELEMENT_ATTACKS: Record<ElementAttackSkillId, ElementAttackMeta> = {
  wind_blade: {
    skillId: 'wind_blade',
    label: '风刃',
    icon: '🌪️',
    tier: 1,
    spiritCost: 20,
    color: '#7ef0ff',
  },
  aqua_surge: {
    skillId: 'aqua_surge',
    label: '水波',
    icon: '💧',
    tier: 2,
    spiritCost: 40,
    color: '#32b8ff',
  },
  lightning_bolt: {
    skillId: 'lightning_bolt',
    label: '闪电',
    icon: '⚡',
    tier: 3,
    spiritCost: 60,
    color: '#f7fbff',
  },
  blazing_meteor: {
    skillId: 'blazing_meteor',
    label: '火焰',
    icon: '🔥',
    tier: 4,
    spiritCost: 80,
    color: '#ff7b3d',
  },
  phantom_clone: {
    skillId: 'phantom_clone',
    label: '分身',
    icon: '👥',
    tier: 5,
    spiritCost: 100,
    color: '#b78cff',
  },
};

export type PhysicsModifiers = {
  attackMultiplier: number;
  defenseMultiplier: number;
  staminaDrainMultiplier: number;
  burstResistanceMultiplier: number;
  collisionImpulseMultiplier: number;
  wallGripMultiplier: number;
  damageMultiplier: number;
  spinLossMultiplier: number;
  dashImpulseMultiplier: number;
  lockStabilityLossMultiplier: number;
  velocityReflectionMultiplier: number; // Added for AQUA_SURGE
};

export type SpiritState = {
  current: number;
  max: number;
};

export type TimedStatusEffect = {
  id: string;
  sourceSkill: SkillId;
  duration: number;
  remaining: number;
};

export type QueuedTagState = {
  requestedAt: number;
  nextIndex: number;
};

export type BattleFlags = {
  ignoreNextWallSlowdown: boolean;
  ignoreNextCollisionDamage: boolean;
  burstResolvedThisFrame: boolean;
  armedFrostBite: boolean;
  armedLightningBolt: boolean;
};

export const DEFAULT_TACTICAL_MODE: TacticalMode = 'balance';

export const DEFAULT_PHYSICS_MODIFIERS = (): PhysicsModifiers => ({
  attackMultiplier: 1,
  defenseMultiplier: 1,
  staminaDrainMultiplier: 1,
  burstResistanceMultiplier: 1,
  collisionImpulseMultiplier: 1,
  wallGripMultiplier: 1,
  damageMultiplier: 1,
  spinLossMultiplier: 1,
  dashImpulseMultiplier: 1,
  lockStabilityLossMultiplier: 1,
  velocityReflectionMultiplier: 1,
});

export const DEFAULT_BATTLE_FLAGS = (): BattleFlags => ({
  ignoreNextWallSlowdown: false,
  ignoreNextCollisionDamage: false,
  burstResolvedThisFrame: false,
  armedFrostBite: false,
  armedLightningBolt: false,
});
