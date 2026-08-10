import { describe, expect, it, vi } from 'vitest';
import type { LocalIdentity } from '../../src/auth/localIdentity';
import {
  ChallengeApiError,
  createChallengeClient,
} from '../../src/challenges/challengeClient';

const identity: LocalIdentity = {
  version: 1,
  playerId: '11111111-1111-4111-8111-111111111111',
  displayName: 'Nova',
  deviceToken: 'A'.repeat(43),
};
const offerId = '22222222-2222-4222-8222-222222222222';
const challengeId = '33333333-3333-4333-8333-333333333333';

const offer = {
  id: offerId,
  status: 'open',
  targetPlayerId: null,
  parentChallengeId: null,
  claimedChallengeId: null,
  expiresAt: '2026-08-11T00:00:00.000Z',
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
  offer: { mode: 'fair' },
  actions: { canClaim: true, canRevoke: false },
};
const challenge = {
  id: challengeId,
  status: 'pending',
  creatorPlayerId: identity.playerId,
  recipientPlayerId: offerId,
  offerId,
  parentChallengeId: null,
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
  completedAt: null,
  input: { mode: 'fair' },
  result: null,
  actions: { canBattle: true, canRematch: false },
};

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('challenge client', () => {
  it('uses authenticated methods and exact endpoint paths', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json(offer, 201))
      .mockResolvedValueOnce(json(offer))
      .mockResolvedValueOnce(json(challenge, 201))
      .mockResolvedValueOnce(json({ ...offer, status: 'revoked', actions: { canClaim: false, canRevoke: false } }))
      .mockResolvedValueOnce(json({ items: [{ kind: 'challenge', ...challenge }], nextCursor: 'opaque', pendingCount: 1 }))
      .mockResolvedValueOnce(json(challenge))
      .mockResolvedValueOnce(json({ ...challenge, status: 'completed', completedAt: '2026-08-10T00:01:00.000Z', result: {} }))
      .mockResolvedValueOnce(json({ ...offer, status: 'open', targetPlayerId: identity.playerId }, 201));
    const client = createChallengeClient(identity, { baseUrl: 'https://arena.test/', fetchImpl });
    await client.createOffer({ requestId: offerId, mode: 'fair', arena: 'classic_grid', message: '' });
    await client.getOffer(offerId);
    await client.claimOffer(offerId);
    await client.revokeOffer(offerId);
    const list = await client.listChallenges({ group: 'waiting_me', cursor: 'opaque+/=', limit: 10 });
    await client.getChallenge(challengeId);
    await client.submitResult(challengeId, { submissionId: offerId, inputLog: {}, outcome: {} });
    await client.createRematch(challengeId);

    expect(list.nextCursor).toBe('opaque');
    expect(fetchImpl.mock.calls.map(call => [call[0], call[1]?.method ?? 'GET'])).toEqual([
      ['https://arena.test/api/challenge-offers', 'POST'],
      [`https://arena.test/api/challenge-offers/${offerId}`, 'GET'],
      [`https://arena.test/api/challenge-offers/${offerId}/claim`, 'POST'],
      [`https://arena.test/api/challenge-offers/${offerId}/revoke`, 'POST'],
      ['https://arena.test/api/challenges?group=waiting_me&cursor=opaque%2B%2F%3D&limit=10', 'GET'],
      [`https://arena.test/api/challenges/${challengeId}`, 'GET'],
      [`https://arena.test/api/challenges/${challengeId}/results`, 'POST'],
      [`https://arena.test/api/challenges/${challengeId}/rematch`, 'POST'],
    ]);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init.headers).toMatchObject({
        Authorization: `Bearer ${identity.deviceToken}`,
        'X-Player-Id': identity.playerId,
      });
    }
  });

  it('maps API, non-JSON, and invalid response errors', async () => {
    const apiClient = createChallengeClient(identity, {
      fetchImpl: vi.fn().mockResolvedValue(json({ error: { code: 'OFFER_EXPIRED', message: 'Expired.' } }, 409)),
    });
    await expect(apiClient.getOffer(offerId)).rejects.toMatchObject<Partial<ChallengeApiError>>({ status: 409, code: 'OFFER_EXPIRED' });

    const textClient = createChallengeClient(identity, {
      fetchImpl: vi.fn().mockResolvedValue(new Response('nope', { status: 200 })),
    });
    await expect(textClient.getOffer(offerId)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });

    const invalidClient = createChallengeClient(identity, {
      fetchImpl: vi.fn().mockResolvedValue(json({ ...offer, status: 'surprise' })),
    });
    await expect(invalidClient.getOffer(offerId)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
