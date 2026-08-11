import { describe, expect, it } from 'vitest';
import { CAMPAIGN_OPPONENTS } from '../../src/data/campaign/opponents';
import {
  campaignEventUuid,
  campaignWinCoins,
  compareCampaignOutcomes,
  evaluateCampaignStars,
  mergeCampaignStars,
  nextCampaignOpponentIndex,
  selectCampaignRotation,
} from '../../src/data/campaign/campaignRules';

const outcome = (overrides: Record<string, unknown> = {}) => ({
  winner: 'player',
  kind: 'spin finish',
  turnCount: 6,
  tickCount: 900,
  player: { integrity: 50, tilt: 0.6 },
  ...overrides,
});

describe('campaign deterministic rules', () => {
  it('selects a stable zero-based loadout and arena rotation', () => {
    expect(selectCampaignRotation(0, 2, 1)).toEqual({ loadoutIndex: 0, arenaIndex: 0 });
    expect(selectCampaignRotation(1, 2, 1)).toEqual({ loadoutIndex: 1, arenaIndex: 0 });
    expect(selectCampaignRotation(2, 2, 1)).toEqual({ loadoutIndex: 0, arenaIndex: 0 });
    expect(selectCampaignRotation(4, 3, 3)).toEqual({ loadoutIndex: 1, arenaIndex: 1 });
    expect(() => selectCampaignRotation(-1, 2, 1)).toThrow();
  });

  it('evaluates approved star boundaries only for wins', () => {
    expect(evaluateCampaignStars(CAMPAIGN_OPPONENTS[0], { primary: 'WATER', resonance: 'offense' }, outcome())).toBe(7);
    expect(evaluateCampaignStars(CAMPAIGN_OPPONENTS[0], { primary: 'WATER', resonance: 'offense' }, outcome({ turnCount: 7 }))).toBe(3);
    expect(evaluateCampaignStars(CAMPAIGN_OPPONENTS[1], { primary: 'WOOD', resonance: 'offense' }, outcome({ player: { integrity: 50, tilt: 1 } }), 100)).toBe(7);
    expect(evaluateCampaignStars(CAMPAIGN_OPPONENTS[1], { primary: 'WOOD', resonance: 'offense' }, outcome({ player: { integrity: 49.999, tilt: 1 } }), 100)).toBe(3);
    expect(evaluateCampaignStars(CAMPAIGN_OPPONENTS[5], { primary: 'DARK', resonance: 'offense' }, outcome({ turnCount: 5 }))).toBe(7);
    expect(evaluateCampaignStars(CAMPAIGN_OPPONENTS[6], { primary: 'LIGHT', resonance: 'offense' }, outcome())).toBe(7);
    expect(evaluateCampaignStars(CAMPAIGN_OPPONENTS[7], { primary: 'LIGHT', resonance: 'harmony' }, outcome({ player: { integrity: 40, tilt: 1 } }), 100)).toBe(7);
    expect(evaluateCampaignStars(CAMPAIGN_OPPONENTS[0], { primary: 'WATER', resonance: 'offense' }, outcome({ winner: 'enemy' }))).toBe(0);
  });

  it('accumulates stars and unlocks only the next sequential rival', () => {
    expect(mergeCampaignStars(1, 2)).toBe(3);
    expect(mergeCampaignStars(3, 4)).toBe(7);
    expect(nextCampaignOpponentIndex([])).toBe(0);
    expect(nextCampaignOpponentIndex([true, false, true])).toBe(1);
    expect(nextCampaignOpponentIndex(Array(8).fill(true))).toBe(7);
  });

  it('calculates the approved server victory formula', () => {
    expect(campaignWinCoins(0, 'ring out')).toBe(155);
    expect(campaignWinCoins(2, 'spin finish')).toBe(215);
    expect(campaignWinCoins(4, 'burst finish')).toBe(310);
    expect(campaignWinCoins(7, 'timeout')).toBe(565);
  });

  it('compares winning best outcomes deterministically', () => {
    const baseline = outcome();
    expect(compareCampaignOutcomes(outcome({ turnCount: 5 }), baseline)).toBeGreaterThan(0);
    expect(compareCampaignOutcomes(outcome({ player: { integrity: 60, tilt: 2 } }), baseline)).toBeGreaterThan(0);
    expect(compareCampaignOutcomes(outcome({ tickCount: 800 }), baseline)).toBeGreaterThan(0);
    expect(compareCampaignOutcomes(outcome({ kind: 'burst finish' }), baseline)).toBeGreaterThan(0);
    expect(compareCampaignOutcomes(outcome({ winner: 'enemy' }), baseline)).toBeLessThan(0);
  });

  it('maps readable reward keys to stable RFC 4122 UUIDs', () => {
    const key = 'campaign:blaze-fang:first-win';
    expect(campaignEventUuid(key)).toBe(campaignEventUuid(key));
    expect(campaignEventUuid(key)).not.toBe(campaignEventUuid('campaign:blaze-fang:star:2'));
    expect(campaignEventUuid(key)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
