import { describe, expect, it } from 'vitest';
import {
  applySurvivalReward,
  generateSurvivalRewards,
  normalizeSurvivalRewardState,
} from '../../src/data/survival/survivalConfig';

const SEED = '00112233445566778899aabbccddeeff';

const state = (overrides: Record<string, unknown> = {}) => normalizeSurvivalRewardState({
  growthLevels: {
    'attack-calibration': 0,
    coordination: 0,
    'affinity-tuning': 0,
    'pickup-tuning': 0,
  },
  maximumIntegrity: 100,
  integrity: 60,
  burstRisk: 25,
  persistentDebuffs: ['scuff', 'drag'],
  nextWaveEffect: null,
  riskLevel: 0,
  ...overrides,
});

describe('deterministic survival rewards', () => {
  it('freezes three distinct choices from the seed, wave, and checkpoint', () => {
    const checkpoint = state();
    const first = generateSurvivalRewards(SEED, 1, checkpoint);
    expect(first).toEqual(generateSurvivalRewards(SEED, 1, checkpoint));
    expect(first).toHaveLength(3);
    expect(new Set(first.map(reward => reward.id)).size).toBe(3);
    expect(generateSurvivalRewards(SEED, 2, checkpoint)).not.toEqual(first);
  });

  it('matches the server reward entrypoint', async () => {
    const server = await import('../../server/survival/survival-config.mjs');
    expect(server.generateSurvivalRewards(SEED, 7, state())).toEqual(generateSurvivalRewards(SEED, 7, state()));
  });

  it('increments each growth reward to its fixed third-level cap', () => {
    for (const id of ['attack-calibration', 'coordination', 'affinity-tuning', 'pickup-tuning'] as const) {
      let checkpoint = state();
      checkpoint = applySurvivalReward(checkpoint, { kind: 'growth', id, level: 1 });
      checkpoint = applySurvivalReward(checkpoint, { kind: 'growth', id, level: 2 });
      checkpoint = applySurvivalReward(checkpoint, { kind: 'growth', id, level: 3 });
      expect(checkpoint.growthLevels[id]).toBe(3);
      expect(() => applySurvivalReward(checkpoint, { kind: 'growth', id, level: 4 })).toThrow();
    }
  });

  it('applies repair and vent without crossing their boundaries', () => {
    expect(applySurvivalReward(state(), { kind: 'instant', id: 'emergency-repair' }).integrity).toBe(78);
    expect(applySurvivalReward(state({ integrity: 95 }), { kind: 'instant', id: 'emergency-repair' }).integrity).toBe(100);
    const vented = applySurvivalReward(state(), { kind: 'instant', id: 'burst-vent' });
    expect(vented.burstRisk).toBe(10);
    expect(vented.persistentDebuffs).toEqual(['drag']);
  });

  it('stores each approved one-wave effect independently', () => {
    for (const id of ['temporary-overdrive', 'temporary-bulwark', 'temporary-endurance'] as const) {
      expect(applySurvivalReward(state(), { kind: 'instant', id }).nextWaveEffect).toBe(id);
    }
  });

  it('raises risk only for future waves and never beyond level three', () => {
    const raised = applySurvivalReward(state(), { kind: 'risk', id: 'risk-contract', level: 1 });
    expect(raised.riskLevel).toBe(1);
    expect(() => applySurvivalReward(raised, { kind: 'risk', id: 'risk-contract', level: 1 })).toThrow();
    expect(() => applySurvivalReward(state({ riskLevel: 3 }), { kind: 'risk', id: 'risk-contract', level: 4 })).toThrow();
  });

  it('removes no-effect choices and still returns three valid terminal choices', () => {
    const terminal = state({
      growthLevels: {
        'attack-calibration': 3,
        coordination: 3,
        'affinity-tuning': 3,
        'pickup-tuning': 3,
      },
      integrity: 100,
      burstRisk: 0,
      persistentDebuffs: [],
      riskLevel: 3,
    });
    expect(generateSurvivalRewards(SEED, 80, terminal).map(reward => reward.id).sort()).toEqual([
      'temporary-bulwark', 'temporary-endurance', 'temporary-overdrive',
    ]);
  });

  it('rejects malformed checkpoints and rewards', () => {
    expect(() => normalizeSurvivalRewardState({})).toThrow();
    expect(() => state({ integrity: 101 })).toThrow();
    expect(() => state({ burstRisk: -1 })).toThrow();
    expect(() => applySurvivalReward(state(), { kind: 'instant', id: 'unknown' } as never)).toThrow();
  });
});
