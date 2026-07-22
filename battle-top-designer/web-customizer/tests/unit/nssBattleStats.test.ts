import { describe, expect, it } from 'vitest';
import battleCatalog from '../../../shared/nss/battle-parts.json';
import { buildPlayerStats, buildStats } from '../../../../src/gameplay/build';
import { DEFAULT_BUILD } from '../../../../src/data/parts';
import { buildNssBattleStats } from '../../../../src/nss/buildStats';
import { createNssBattleLoadout, enumerateNssCombinations } from '../../../../src/nss/loadout';

describe('NSS battle stats', () => {
  const combinations = enumerateNssCombinations();

  it('provides one independent battle entry for every NSS part', () => {
    expect(battleCatalog.parts).toHaveLength(16);
    expect(new Set(battleCatalog.parts.map(part => part.id)).size).toBe(16);
    expect(battleCatalog.parts.filter(part => part.family === 'blade').every(part => part.physics.collisionRadius)).toBe(true);
  });

  it('builds all 288 combinations deterministically with finite values', () => {
    expect(combinations).toHaveLength(288);
    for (const combination of combinations) {
      const loadout = createNssBattleLoadout(combination);
      const first = buildNssBattleStats(loadout);
      const second = buildNssBattleStats(loadout);
      expect(second).toEqual(first);
      expect(Object.values(first).filter(value => typeof value === 'number').every(Number.isFinite)).toBe(true);
      expect(first.weight).toBeGreaterThan(0);
      expect(first.collisionRadius).toBeGreaterThan(0);
    }
  });

  it('anchors the default NSS combination to the legacy battle scale', () => {
    const stats = buildNssBattleStats(createNssBattleLoadout({
      core: 'core_solar_wolf',
      blade: 'blade_storm_fang',
      assist: 'assist_heavy',
      gear: 'gear_low',
      tip: 'tip_flat_attack',
    }));
    expect(stats).toMatchObject({ attack: 9, defense: 8, stamina: 7, mobility: 10, burstResist: 8 });
    expect(stats.weight).toBeCloseTo(2.18);
    expect(stats.collisionRadius).toBe(0.83);
  });

  it('applies global upgrades while ignoring legacy per-part upgrades', () => {
    const loadout = createNssBattleLoadout(combinations[0]);
    const playerBuild = { kind: 'nss-v1' as const, loadout };
    const baseline = buildPlayerStats(playerBuild);
    const upgraded = buildPlayerStats(playerBuild, { attack: 2, defense: 3, stamina: 4 }, {
      [loadout.combination.blade]: 99,
    });
    expect(upgraded.attack).toBe(baseline.attack + 2);
    expect(upgraded.defense).toBe(baseline.defense + 3);
    expect(upgraded.burstResist).toBe(baseline.burstResist + 3);
    expect(upgraded.stamina).toBe(baseline.stamina + 4);
    expect(upgraded.mobility).toBe(baseline.mobility + 2);
  });

  it('leaves the legacy build calculation unchanged', () => {
    const upgrades = { attack: 2, defense: 1, stamina: 3 };
    const partUpgrades = { round: 2, balanced: 1, grip: 3 };
    expect(buildPlayerStats({ kind: 'legacy', build: DEFAULT_BUILD }, upgrades, partUpgrades))
      .toEqual(buildStats(DEFAULT_BUILD, upgrades, partUpgrades));
  });
});
