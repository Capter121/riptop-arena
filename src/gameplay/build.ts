import type { PartUpgradeLevels, UpgradeLevels } from '../app/progression';
import { DEFAULT_BUILD, PARTS, type BuildSelection, type Part, type PartSlot, type StatBlock } from '../data/parts';
import { BASE_COMPONENTS } from '../data/recipes';

import { type ElementAttribute, TIER_MULTIPLIERS, type InstanceComponent } from '../types/shopItems';

export type BattleStats = StatBlock & {
  maxSpin: number;
  maxIntegrity: number;
  weight: number;
  attributes: Partial<Record<ElementAttribute, number>>;
  perks: string[];
  guardStamina: number;
  guardCrush: boolean;
  hasStealthEffect?: boolean;
};

const DEFAULT_UPGRADES: UpgradeLevels = {
  attack: 0,
  defense: 0,
  stamina: 0,
};

export const cloneBuild = (build: BuildSelection = DEFAULT_BUILD): BuildSelection => ({
  attackRing: build.attackRing,
  core: build.core,
  driver: build.driver,
});

export function getPart(slot: PartSlot, id: string): Part {
  const part = PARTS[slot].find((entry) => entry.id === id);
  if (!part) {
    // If not found (e.g. it's a dynamic recipe id), fallback to the first item
    return PARTS[slot][0];
  }

  return part;
}

// In-memory inventory simulation for development/testing
export const PLAYER_INVENTORY: InstanceComponent[] = [];

export function getInstancePart(id: string): InstanceComponent | undefined {
  return PLAYER_INVENTORY.find(p => p.instanceId === id);
}

function getPartUpgradeBonus(slot: PartSlot, id: string, partUpgrades?: PartUpgradeLevels): StatBlock {
  const level = partUpgrades?.[id] ?? 0;
  if (slot === 'attackRing') {
    return { attack: level, defense: 0, stamina: 0, mobility: 0, burstResist: Math.floor(level / 2) };
  }
  if (slot === 'core') {
    return { attack: 0, defense: level, stamina: level, mobility: 0, burstResist: level };
  }
  return { attack: 0, defense: 0, stamina: level, mobility: level, burstResist: 0 };
}

export function buildStats(
  build: BuildSelection,
  upgrades: UpgradeLevels = DEFAULT_UPGRADES,
  partUpgrades?: PartUpgradeLevels,
): BattleStats {
  const parts: Array<{ slot: PartSlot, basePart: Part, instancePart?: InstanceComponent }> = [];

  const addPart = (slot: PartSlot, id: string) => {
    const instance = getInstancePart(id);
    if (instance) {
      parts.push({ slot, basePart: getPart(slot, instance.baseTemplateId), instancePart: instance });
    } else {
      parts.push({ slot, basePart: getPart(slot, id) });
    }
  };

  addPart('attackRing', build.attackRing);
  addPart('core', build.core);
  addPart('driver', build.driver);

  const attributes: Partial<Record<ElementAttribute, number>> = {};
  const perks: string[] = [];

  const combined = parts.reduce(
    (acc, { slot, basePart, instancePart }) => {
      const partBonus = getPartUpgradeBonus(slot, basePart.id, partUpgrades);
      
      const multiplier = instancePart ? TIER_MULTIPLIERS[instancePart.tier] : 1.0;

      acc.attack += (basePart.stats.attack + partBonus.attack) * multiplier;
      acc.defense += (basePart.stats.defense + partBonus.defense) * multiplier;
      acc.stamina += (basePart.stats.stamina + partBonus.stamina) * multiplier;
      acc.mobility += (basePart.stats.mobility + partBonus.mobility) * multiplier;
      acc.burstResist += (basePart.stats.burstResist + partBonus.burstResist) * multiplier;

      if (instancePart) {
        attributes[instancePart.attribute] = (attributes[instancePart.attribute] || 0) + 1;
        const baseComponentData = BASE_COMPONENTS[instancePart.baseTemplateId];
        if (baseComponentData?.perkId) {
          perks.push(baseComponentData.perkId);
        }
      }

      return acc;
    },
    { attack: 0, defense: 0, stamina: 0, mobility: 0, burstResist: 0 },
  );

  combined.attack += upgrades.attack;
  combined.defense += upgrades.defense;
  combined.burstResist += upgrades.defense;
  combined.stamina += upgrades.stamina;
  combined.mobility += upgrades.stamina * 0.5;

  return {
    ...combined,
    maxSpin: 74 + combined.stamina * 6 + combined.mobility * 2,
    maxIntegrity: 100 + combined.defense * 6 + combined.burstResist * 5,
    weight: 1 + combined.defense * 0.12 + combined.burstResist * 0.05,
    attributes,
    perks,
    guardStamina: 3,
    guardCrush: false,
    hasStealthEffect: (attributes['DARK'] || 0) >= 3,
  };
}
