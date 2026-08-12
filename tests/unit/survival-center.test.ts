import { describe, expect, it } from 'vitest';
import type { SurvivalHistoryEntry, SurvivalLeaderboardEntry } from '../../src/survival/survivalClient';
import { CAMPAIGN_OPPONENTS } from '../../src/data/campaign/opponents';
import { mergeSurvivalHistory, mergeSurvivalLeaderboard } from '../../src/ui/survivalCenter';

const loadout = { schemaVersion: 2 as const, interfaceId: 'NSS-V1' as const, ...CAMPAIGN_OPPONENTS[0].loadouts[0] };
const best = {
  runId: '11111111-1111-4111-8111-111111111111', score: 100, highestCompletedWave: 2,
  bossesDefeated: 0, finalIntegrity: 10, riskLevel: 1, loadoutSummary: loadout,
  achievedAt: '2026-08-12T10:00:00.000Z',
} satisfies SurvivalHistoryEntry;

describe('survival center pagination', () => {
  it('deduplicates leaderboard entries by player identity', () => {
    const first = { ...best, rank: 1, playerId: '22222222-2222-4222-8222-222222222222', displayName: 'Nova' } satisfies SurvivalLeaderboardEntry;
    expect(mergeSurvivalLeaderboard([first], [first, { ...first, rank: 2, playerId: '33333333-3333-4333-8333-333333333333' }])).toHaveLength(2);
  });

  it('deduplicates history entries by run identity', () => {
    expect(mergeSurvivalHistory([best], [best, { ...best, runId: '44444444-4444-4444-8444-444444444444' }])).toHaveLength(2);
  });
});
