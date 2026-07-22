export type PartSlot = 'attackRing' | 'core' | 'driver';

export type StatBlock = {
  attack: number;
  defense: number;
  stamina: number;
  mobility: number;
  burstResist: number;
};

export type Part = {
  id: string;
  name: string;
  slot: PartSlot;
  rarity: 'starter' | 'rare' | 'epic';
  description: string;
  stats: StatBlock;
  color: string;
  price: number;
};

export const PARTS: Record<PartSlot, Part[]> = {
  attackRing: [
    {
      id: 'slash',
      name: '斩击',
      slot: 'attackRing',
      rarity: 'rare',
      description: '高冲击接触点，适合持续压制和爆裂输出。',
      color: '#ff7b5b',
      price: 320,
      stats: { attack: 7, defense: 2, stamina: 1, mobility: 2, burstResist: 1 },
    },
    {
      id: 'round',
      name: '圆环',
      slot: 'attackRing',
      rarity: 'starter',
      description: '圆润接触面更稳定，容易掌控碰撞节奏。',
      color: '#ffd166',
      price: 0,
      stats: { attack: 4, defense: 4, stamina: 3, mobility: 3, burstResist: 2 },
    },
    {
      id: 'bulwark',
      name: '壁垒',
      slot: 'attackRing',
      rarity: 'epic',
      description: '宽厚防御框体，专门用来硬吃重击。',
      color: '#9ad5ca',
      price: 560,
      stats: { attack: 2, defense: 7, stamina: 3, mobility: 1, burstResist: 4 },
    },
  ],
  core: [
    {
      id: 'light',
      name: '轻芯',
      slot: 'core',
      rarity: 'rare',
      description: '机动爆发很强，但续航明显偏弱。',
      color: '#80edff',
      price: 300,
      stats: { attack: 2, defense: 1, stamina: 1, mobility: 6, burstResist: 1 },
    },
    {
      id: 'balanced',
      name: '均衡',
      slot: 'core',
      rarity: 'starter',
      description: '各项属性平均，适合灵活应对不同对手。',
      color: '#b9f18c',
      price: 0,
      stats: { attack: 3, defense: 3, stamina: 3, mobility: 3, burstResist: 3 },
    },
    {
      id: 'heavy',
      name: '重轴',
      slot: 'core',
      rarity: 'epic',
      description: '额外重量带来更强稳定性和抗爆能力。',
      color: '#d4b4ff',
      price: 520,
      stats: { attack: 1, defense: 5, stamina: 5, mobility: 1, burstResist: 5 },
    },
  ],
  driver: [
    {
      id: 'rush',
      name: '突进',
      slot: 'driver',
      rarity: 'epic',
      description: '发射速度极高，进攻凶狠，但会更快耗尽体力。',
      color: '#ff6da8',
      price: 540,
      stats: { attack: 3, defense: 1, stamina: 1, mobility: 7, burstResist: 1 },
    },
    {
      id: 'grip',
      name: '抓地',
      slot: 'driver',
      rarity: 'starter',
      description: '抓地力很强，适合在场地中心持续施压。',
      color: '#58d68d',
      price: 0,
      stats: { attack: 2, defense: 4, stamina: 4, mobility: 3, burstResist: 3 },
    },
    {
      id: 'drift',
      name: '漂移',
      slot: 'driver',
      rarity: 'rare',
      description: '脚步更滑，擅长沿着边缘划出大范围弧线。',
      color: '#4cc9f0',
      price: 280,
      stats: { attack: 2, defense: 2, stamina: 3, mobility: 5, burstResist: 2 },
    },
  ],
};

export type BuildSelection = Record<PartSlot, string>;

export type PlayerBuild =
  | { kind: 'legacy'; build: BuildSelection }
  | { kind: 'nss-v1'; loadout: import('../nss/types').NssBattleLoadoutV1 };

export const DEFAULT_BUILD: BuildSelection = {
  attackRing: 'round',
  core: 'balanced',
  driver: 'grip',
};

export type NewBuildSelection = Record<import('../types/shopItems').ComponentCategory, string | null>;

export const DEFAULT_BUILD_V2: NewBuildSelection = {
  CHIP: null,
  LAYER: null,
  DISC: null,
  DRIVER: null,
  LAUNCHER: null,
};

export function getPartById(id: string) {
  for (const slotParts of Object.values(PARTS)) {
    const found = slotParts.find((part) => part.id === id);
    if (found) {
      return found;
    }
  }

  return null;
}

import type {
  ElementAttribute,
  MaterialTier,
  InstanceComponent,
} from '../types/shopItems';

import { BASE_COMPONENTS } from './recipes';

const ATTRIBUTES: ElementAttribute[] = ['WIND', 'WATER', 'ROCK', 'LIGHTNING', 'FIRE', 'DARK', 'LIGHT', 'DIVINE'];

export class ItemGenerator {
  static generateId(): string {
    return `inst_${Math.random().toString(36).substring(2, 11)}`;
  }

  static generateSpecific(baseTemplateId: string, tier: MaterialTier, attribute?: ElementAttribute): InstanceComponent | null {
    const base = BASE_COMPONENTS[baseTemplateId];
    if (!base) return null;
    return {
      instanceId: this.generateId(),
      baseTemplateId: baseTemplateId,
      category: base.category,
      attribute: attribute || ATTRIBUTES[Math.floor(Math.random() * ATTRIBUTES.length)],
      tier: tier,
    };
  }

  static generateRandom(options: { minTier?: MaterialTier; allowDivine?: boolean } = {}): InstanceComponent {
    const bases = Object.keys(BASE_COMPONENTS);
    const randomBaseId = bases[Math.floor(Math.random() * bases.length)];
    
    // Weighted random for tiers
    const tierRoll = Math.random();
    let tier: MaterialTier = 'COMMON';
    if (tierRoll > 0.95) tier = 'MYTHIC';
    else if (tierRoll > 0.85) tier = 'LEGENDARY';
    else if (tierRoll > 0.6) tier = 'RARE';
    else if (tierRoll > 0.3) tier = 'REFINED';

    // Min tier enforcement
    if (options.minTier) {
       const tierOrder = { COMMON: 1, REFINED: 2, RARE: 3, LEGENDARY: 4, MYTHIC: 5 };
       if (tierOrder[tier] < tierOrder[options.minTier]) tier = options.minTier;
    }

    // Attributes
    let validAttrs = ATTRIBUTES;
    if (!options.allowDivine) {
      validAttrs = ATTRIBUTES.filter(a => a !== 'DIVINE');
    }
    const attribute = validAttrs[Math.floor(Math.random() * validAttrs.length)];

    return this.generateSpecific(randomBaseId, tier, attribute)!;
  }
}

export const MOCK_INVENTORY: InstanceComponent[] = [];
