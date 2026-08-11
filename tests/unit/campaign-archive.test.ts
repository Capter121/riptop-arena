import { describe, expect, it } from 'vitest';
import {
  campaignBestText,
  campaignCardStatus,
  campaignPortalText,
  campaignStarStates,
  selectedCampaignOpponentId,
} from '../../src/ui/campaignArchive';
import type { CampaignArchiveOpponent } from '../../src/campaign/campaignClient';

describe('campaign archive read model', () => {
  it('distinguishes locked, unlocked, and defeated rivals', () => {
    expect(campaignCardStatus({ unlocked: false, defeated: false })).toBe('locked');
    expect(campaignCardStatus({ unlocked: true, defeated: false })).toBe('available');
    expect(campaignCardStatus({ unlocked: true, defeated: true })).toBe('defeated');
  });

  it('renders independent star masks without assuming one-run completion', () => {
    expect(campaignStarStates(0)).toEqual([false, false, false]);
    expect(campaignStarStates(3)).toEqual([true, true, false]);
    expect(campaignStarStates(5)).toEqual([true, false, true]);
    expect(campaignStarStates(7)).toEqual([true, true, true]);
  });

  it('formats no record and deterministic best records', () => {
    expect(campaignBestText(null)).toBe('尚无胜利记录');
    expect(campaignBestText({ winner: 'player', kind: 'burst finish', turnCount: 4, tickCount: 720, player: { integrity: 1234, tilt: 0.2 } }))
      .toBe('4 回合 · 爆裂终结 · 完整度 1234');
  });

  it('summarizes portal progress and preserves the current unlocked rival', () => {
    expect(campaignPortalText(7, '森之冠', 0)).toBe('7 / 24 星 · 当前 森之冠');
    expect(campaignPortalText(7, '森之冠', 2)).toBe('7 / 24 星 · 当前 森之冠 · 2 待同步');
    const opponents = [
      { id: 'open', unlocked: true },
      { id: 'locked', unlocked: false },
    ] as CampaignArchiveOpponent[];
    expect(selectedCampaignOpponentId(opponents, 'open', 'open')).toBe('open');
    expect(selectedCampaignOpponentId(opponents, 'open', 'locked')).toBe('open');
    expect(selectedCampaignOpponentId(opponents, 'open', 'missing')).toBe('open');
  });
});
