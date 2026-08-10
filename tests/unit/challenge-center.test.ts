import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CHALLENGE_DRAFT, canCreateChallenge, loadChallengeGroup } from '../../src/ui/challengeCenter';

describe('challenge center model', () => {
  it('defaults to fair mode and a supported arena', () => {
    expect(DEFAULT_CHALLENGE_DRAFT).toEqual({ mode: 'fair', arena: 'classic_grid', message: '' });
    expect(canCreateChallenge({ latestNssLoadout: null })).toBe(false);
    expect(canCreateChallenge({ latestNssLoadout: {} })).toBe(true);
  });

  it('keeps pagination cursors opaque and group-local', async () => {
    const listChallenges = vi.fn().mockResolvedValue({ items: [], nextCursor: 'next', pendingCount: 2 });
    await expect(loadChallengeGroup({ listChallenges } as never, 'waiting_friend')).resolves.toMatchObject({ nextCursor: 'next' });
    await loadChallengeGroup({ listChallenges } as never, 'history', 'opaque+/=');
    expect(listChallenges).toHaveBeenNthCalledWith(1, { group: 'waiting_friend', limit: 20 });
    expect(listChallenges).toHaveBeenNthCalledWith(2, { group: 'history', cursor: 'opaque+/=', limit: 20 });
  });
});
