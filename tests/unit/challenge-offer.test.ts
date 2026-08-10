import { describe, expect, it, vi } from 'vitest';
import { loadChallengeOffer, offerViewerRole } from '../../src/ui/challengeOffer';

const creatorId = '11111111-1111-4111-8111-111111111111';
const friendId = '22222222-2222-4222-8222-222222222222';
const view = {
  id: friendId,
  status: 'open',
  targetPlayerId: null,
  parentChallengeId: null,
  claimedChallengeId: null,
  expiresAt: '2026-08-11T00:00:00.000Z',
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
  offer: { creator: { playerId: creatorId, displayName: '<img src=x>' }, mode: 'fair' },
  actions: { canClaim: true, canRevoke: false },
} as const;

describe('challenge offer model', () => {
  it('loads without claiming and derives creator/responder roles', async () => {
    const getOffer = vi.fn().mockResolvedValue(view);
    const claimOffer = vi.fn();
    expect((await loadChallengeOffer({ getOffer, claimOffer } as never, view.id)).view).toBe(view);
    expect(getOffer).toHaveBeenCalledWith(view.id);
    expect(claimOffer).not.toHaveBeenCalled();
    expect(offerViewerRole(view as never, creatorId)).toBe('creator');
    expect(offerViewerRole(view as never, friendId)).toBe('responder');
  });
});
