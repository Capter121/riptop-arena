import { describe, expect, it } from 'vitest';
import {
  compareSurvivalBest,
  createSurvivalSummary,
  scoreSurvivalWave,
} from '../../src/data/survival/survivalConfig';

describe('deterministic survival scoring', () => {
  it('scores wave growth, wave types, and all finish kinds', () => {
    expect(scoreSurvivalWave({ wave: 1, type: 'normal', finishKind: 'spin finish', flawless: false, flawlessStreak: 0, riskLevel: 0 }).score).toBe(125);
    expect(scoreSurvivalWave({ wave: 3, type: 'elite', finishKind: 'burst finish', flawless: false, flawlessStreak: 0, riskLevel: 0 }).score).toBe(275);
    expect(scoreSurvivalWave({ wave: 5, type: 'boss', finishKind: 'ring out', flawless: false, flawlessStreak: 0, riskLevel: 0 }).score).toBe(435);
    expect(scoreSurvivalWave({ wave: 2, type: 'normal', finishKind: 'timeout', flawless: false, flawlessStreak: 0, riskLevel: 0 }).score).toBe(140);
  });

  it('caps flawless streak at five and applies risk only after subtotal', () => {
    expect(scoreSurvivalWave({ wave: 1, type: 'normal', finishKind: 'spin finish', flawless: true, flawlessStreak: 1, riskLevel: 0 }).score).toBe(265);
    expect(scoreSurvivalWave({ wave: 1, type: 'normal', finishKind: 'spin finish', flawless: true, flawlessStreak: 5, riskLevel: 0 }).score).toBe(425);
    expect(scoreSurvivalWave({ wave: 1, type: 'normal', finishKind: 'spin finish', flawless: true, flawlessStreak: 6, riskLevel: 0 }).score).toBe(425);
    expect(scoreSurvivalWave({ wave: 1, type: 'normal', finishKind: 'spin finish', flawless: false, flawlessStreak: 0, riskLevel: 1 }).score).toBe(156);
  });

  it('returns an auditable score breakdown', () => {
    expect(scoreSurvivalWave({ wave: 5, type: 'boss', finishKind: 'burst finish', flawless: true, flawlessStreak: 2, riskLevel: 2 })).toEqual({
      base: 200,
      waveTypeBonus: 200,
      finishBonus: 50,
      flawlessBonus: 100,
      flawlessStreakBonus: 80,
      subtotal: 630,
      riskMultiplier: 1.55,
      score: 977,
    });
  });

  it('matches the server scoring entrypoint', async () => {
    const server = await import('../../server/survival/survival-config.mjs');
    const input = { wave: 10, type: 'boss' as const, finishKind: 'ring out' as const, flawless: true, flawlessStreak: 3, riskLevel: 2 };
    expect(server.scoreSurvivalWave(input)).toEqual(scoreSurvivalWave(input));
  });

  it('creates totals, completed-wave and boss counts, including abandonment', () => {
    const scores = [
      { wave: 1, type: 'normal' as const, score: 125 },
      { wave: 2, type: 'normal' as const, score: 150 },
      { wave: 5, type: 'boss' as const, score: 435 },
    ];
    expect(createSurvivalSummary(scores, 42.5, 2, '2026-08-12T00:00:00.000Z', true)).toEqual({
      score: 710,
      highestCompletedWave: 5,
      bossesDefeated: 1,
      finalIntegrity: 42.5,
      riskLevel: 2,
      achievedAt: '2026-08-12T00:00:00.000Z',
      abandoned: true,
    });
  });

  it('orders best scores by all five approved ranking fields', () => {
    const baseline = createSurvivalSummary([{ wave: 5, type: 'boss', score: 1000 }], 40, 1, '2026-08-12T01:00:00.000Z');
    expect(compareSurvivalBest({ ...baseline, score: 1001 }, baseline)).toBeGreaterThan(0);
    expect(compareSurvivalBest({ ...baseline, highestCompletedWave: 6 }, baseline)).toBeGreaterThan(0);
    expect(compareSurvivalBest({ ...baseline, bossesDefeated: 2 }, baseline)).toBeGreaterThan(0);
    expect(compareSurvivalBest({ ...baseline, finalIntegrity: 41 }, baseline)).toBeGreaterThan(0);
    expect(compareSurvivalBest({ ...baseline, achievedAt: '2026-08-12T00:59:59.000Z' }, baseline)).toBeGreaterThan(0);
    expect(compareSurvivalBest(baseline, baseline)).toBe(0);
    expect(compareSurvivalBest(baseline, null)).toBeGreaterThan(0);
  });

  it('rejects impossible score inputs and meaningless best replacements', () => {
    expect(() => scoreSurvivalWave({ wave: 0, type: 'normal', finishKind: 'spin finish', flawless: false, flawlessStreak: 0, riskLevel: 0 })).toThrow();
    expect(() => scoreSurvivalWave({ wave: 1, type: 'normal', finishKind: 'unknown' as never, flawless: false, flawlessStreak: 0, riskLevel: 0 })).toThrow();
    expect(() => scoreSurvivalWave({ wave: 1, type: 'normal', finishKind: 'spin finish', flawless: false, flawlessStreak: 1, riskLevel: 0 })).toThrow();
    expect(() => createSurvivalSummary([{ wave: 1, type: 'normal', score: -1 }], 10, 0, 'bad-date')).toThrow();
  });
});
