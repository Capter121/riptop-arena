import { describe, expect, it } from 'vitest';
import versions from '../../battle-top-designer/shared/nss/versions.json';
import { AFFINITIES } from '../../battle-top-designer/shared/nss/affinity';
import { CAMPAIGN_OPPONENTS } from '../../src/data/campaign/opponents';
import {
  SURVIVAL_AI_PROFILE_IDS,
  SURVIVAL_ARENAS,
  SURVIVAL_CONFIG,
  assertSurvivalCatalog,
} from '../../src/data/survival/survivalConfig';
import { nssPartById } from '../../src/nss/catalog';

describe('survival-v1 catalog', () => {
  it('pins the approved versions, arenas, AI profiles, and five-wave pattern', () => {
    expect(SURVIVAL_CONFIG.schemaVersion).toBe(1);
    expect(SURVIVAL_CONFIG.configVersion).toBe('survival-v1');
    expect(SURVIVAL_CONFIG.sourceCatalogVersion).toBe('campaign-v1');
    expect(SURVIVAL_CONFIG.simulationVersion).toBe(versions.simulationVersion);
    expect(SURVIVAL_CONFIG.battleRulesVersion).toBe(versions.battleRulesVersion);
    expect(SURVIVAL_ARENAS).toEqual(['classic_grid', 'neon_magma', 'absolute_zero']);
    expect(SURVIVAL_AI_PROFILE_IDS).toEqual([
      'assault', 'skirmisher', 'control', 'sustain', 'ringout', 'counter', 'mixup', 'fortress',
    ]);
    expect(SURVIVAL_CONFIG.wavePattern).toEqual(['normal', 'normal', 'elite', 'elite', 'boss']);
    expect(SURVIVAL_CONFIG.waveTypeMultipliers).toEqual({ normal: 1, elite: 1.12, boss: 1.28 });
    expect(SURVIVAL_CONFIG.difficulty).toEqual({ chapterSize: 5, chapterStep: 0.08, maximumMultiplier: 2 });
  });

  it('locks the approved growth, instant, and risk rewards without duplicate IDs', () => {
    expect(SURVIVAL_CONFIG.growthRewards).toEqual([
      { id: 'attack-calibration', maximumLevel: 3, outputPerLevel: 0.06 },
      { id: 'coordination', maximumLevel: 3, stabilityPerLevel: 0.06, spinEfficiencyPerLevel: 0.05 },
      { id: 'affinity-tuning', maximumLevel: 3, affinityEffectPerLevel: 0.08 },
      { id: 'pickup-tuning', maximumLevel: 3, pickupEffectPerLevel: 0.15 },
    ]);
    expect(SURVIVAL_CONFIG.instantRewards).toEqual([
      { id: 'emergency-repair', integrityRatio: 0.18 },
      { id: 'burst-vent', burstReduction: 15, clearDebuffCount: 1 },
      { id: 'temporary-overdrive', durationWaves: 1, output: 0.1, mobility: 0.1 },
    ]);
    expect(SURVIVAL_CONFIG.riskLevels).toEqual([
      { level: 0, scoreMultiplier: 1, enemyStrength: 0 },
      { level: 1, scoreMultiplier: 1.25, enemyStrength: 0.08 },
      { level: 2, scoreMultiplier: 1.55, enemyStrength: 0.16 },
      { level: 3, scoreMultiplier: 1.9, enemyStrength: 0.24 },
    ]);
    const ids = [
      ...SURVIVAL_CONFIG.growthRewards.map(reward => reward.id),
      ...SURVIVAL_CONFIG.instantRewards.map(reward => reward.id),
      'risk-contract',
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('locks scoring and finite permanent milestones', () => {
    expect(SURVIVAL_CONFIG.scoring).toEqual({
      base: 100,
      waveStep: 25,
      waveTypeBonus: { normal: 0, elite: 75, boss: 200 },
      finishBonus: { 'ring out': 35, 'spin finish': 25, 'burst finish': 50, timeout: 15 },
      flawless: 100,
      flawlessStreakStep: 40,
      flawlessStreakMaximum: 5,
    });
    expect(SURVIVAL_CONFIG.milestones).toEqual([
      { wave: 5, coins: 100 },
      { wave: 10, coins: 200 },
      { wave: 15, coins: 350 },
      { wave: 20, coins: 500 },
    ]);
  });

  it('uses the immutable 17-loadout campaign pool with only formal parts and affinities', () => {
    const loadouts = CAMPAIGN_OPPONENTS.flatMap(opponent => opponent.loadouts);
    expect(loadouts).toHaveLength(17);
    for (const loadout of loadouts) {
      for (const [family, partId] of Object.entries(loadout.combination)) {
        expect(nssPartById.get(partId)?.family).toBe(family);
      }
      for (const affinity of Object.values(loadout.affinities)) expect(AFFINITIES).toContain(affinity);
    }
    expect(() => assertSurvivalCatalog()).not.toThrow();
  });
});
