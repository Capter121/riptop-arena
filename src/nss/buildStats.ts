import type { UpgradeLevels } from '../app/progression';
import type { BattleStats } from '../gameplay/build';
import { nssBattlePartById } from './battleCatalog';
import type { NssBattleLoadout } from './types';

export type NssBattleStats = BattleStats & { collisionRadius: number };

export function buildNssBattleStats(
  loadout: NssBattleLoadout,
  upgrades: UpgradeLevels = { attack: 0, defense: 0, stamina: 0 },
): NssBattleStats {
  const parts = Object.values(loadout.combination).map(id => {
    const part = nssBattlePartById.get(id);
    if (!part) throw new Error(`Unknown NSS battle part: ${id}`);
    return part;
  });
  const combined = parts.reduce(
    (stats, part) => {
      stats.attack += part.stats.attack;
      stats.defense += part.stats.defense;
      stats.stamina += part.stats.stamina;
      stats.mobility += part.stats.mobility;
      stats.burstResist += part.stats.burstResist;
      return stats;
    },
    { attack: 0, defense: 0, stamina: 0, mobility: 0, burstResist: 0 },
  );

  combined.attack += upgrades.attack;
  combined.defense += upgrades.defense;
  combined.burstResist += upgrades.defense;
  combined.stamina += upgrades.stamina;
  combined.mobility += upgrades.stamina * 0.5;

  const blade = nssBattlePartById.get(loadout.combination.blade)!;
  return {
    ...combined,
    maxSpin: 74 + combined.stamina * 6 + combined.mobility * 2,
    maxIntegrity: 1000 + combined.defense * 60 + combined.burstResist * 50,
    weight: parts.reduce((total, part) => total + part.physics.weight, 0),
    collisionRadius: blade.physics.collisionRadius!,
    armor: combined.defense * 2 + combined.burstResist,
    evasion: Math.min(0.4, combined.mobility * 0.02),
    critChance: Math.min(0.5, combined.attack * 0.02 + combined.mobility * 0.005),
    critMultiplier: 1.5 + combined.attack * 0.05,
    spiritRegenBonus: combined.stamina * 0.5,
    attributes: {},
    perks: [],
    guardStamina: 3,
    guardCrush: false,
    hasStealthEffect: false,
  };
}
