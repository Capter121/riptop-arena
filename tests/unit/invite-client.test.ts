import { describe, expect, it, vi } from 'vitest';
import { InviteApiError, fetchCurrentPlayer, redeemInvite } from '../../src/auth/inviteClient';
import type { LocalIdentity } from '../../src/auth/localIdentity';

const identity: LocalIdentity = {
  version: 1,
  playerId: '123e4567-e89b-42d3-a456-426614174000',
  displayName: 'Nova',
  deviceToken: 'A'.repeat(43),
};

describe('invite API client', () => {
  it('redeems an invite and validates the returned local identity', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ identity }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    }));
    await expect(redeemInvite({ inviteCode: 'VALID01', displayName: 'Nova' }, {
      baseUrl: 'https://arena.example/',
      fetchImpl,
    })).resolves.toEqual(identity);
    expect(fetchImpl).toHaveBeenCalledWith('https://arena.example/api/invites/redeem', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ inviteCode: 'VALID01', displayName: 'Nova' }),
    }));
  });

  it('sends player id and bearer token when loading the current player', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      player: { playerId: identity.playerId, displayName: identity.displayName },
    }), { status: 200 }));
    await expect(fetchCurrentPlayer(identity, { fetchImpl })).resolves.toEqual({
      playerId: identity.playerId,
      displayName: identity.displayName,
    });
    expect(fetchImpl).toHaveBeenCalledWith('/api/me', {
      headers: {
        Authorization: `Bearer ${identity.deviceToken}`,
        'X-Player-Id': identity.playerId,
      },
    });
  });

  it('surfaces the server error code without exposing response internals', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'INVITE_EXHAUSTED', message: 'Invite has reached its use limit.' },
    }), { status: 409 }));
    await expect(redeemInvite({ inviteCode: 'FULL001', displayName: 'Nova' }, { fetchImpl }))
      .rejects.toMatchObject<Partial<InviteApiError>>({
        name: 'InviteApiError',
        code: 'INVITE_EXHAUSTED',
        status: 409,
      });
  });
});
