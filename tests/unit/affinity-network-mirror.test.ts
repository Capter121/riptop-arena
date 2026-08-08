import { describe, expect, it } from 'vitest';
import type { TurnResolution } from '../../src/gameplay/battlePhysics';
import type { DamageResult } from '../../src/gameplay/damage';
import {
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  mirrorTurnResolutionForGuest,
  parseServerMessage,
  type ServerMessage,
} from '../../src/network/protocol';

const damage: DamageResult = {
  skillTier: 5,
  skillBaseDamage: 52,
  attackBonus: 125,
  contextMultiplier: 1.25,
  rawDamage: 221.25,
  finalDamage: 148,
  armorReduced: 73,
  physicalDamage: 109,
  elementalDamage: 39,
  attackerAffinity: 'LIGHT',
  defenderAffinity: 'DARK',
  affinityRelation: 'advantage',
  resonanceContribution: 7,
  relationContribution: 9,
  didCrit: true,
  didMiss: false,
  lockDamage: 50,
  tags: ['crit', 'clash'],
  defender: 'enemy',
};

const resolution: TurnResolution = {
  kind: 'attack_overpower',
  playerAction: { kind: 'attack', skillId: 'fire_burst' },
  aiAction: { kind: 'defense' },
  winner: 'player',
  loser: 'enemy',
  playerSpiritDelta: -30,
  enemySpiritDelta: -10,
  playerVisual: 'attack',
  enemyVisual: 'defense',
  safeNoSpinDamage: false,
  knockbackBoost: 1.4,
  firePenetration: true,
  damageResults: [damage],
  log: 'mirror test',
};

describe('affinity network mirror gates', () => {
  it('mirrors perspective while preserving every affinity damage field', () => {
    const mirrored = mirrorTurnResolutionForGuest(resolution);
    expect(mirrored).toMatchObject({
      playerAction: resolution.aiAction,
      aiAction: resolution.playerAction,
      winner: 'enemy',
      loser: 'player',
      playerSpiritDelta: resolution.enemySpiritDelta,
      enemySpiritDelta: resolution.playerSpiritDelta,
      playerVisual: resolution.enemyVisual,
      enemyVisual: resolution.playerVisual,
      knockbackBoost: resolution.knockbackBoost,
      firePenetration: resolution.firePenetration,
    });
    expect(mirrored.damageResults?.[0]).toEqual({ ...damage, defender: 'player' });
  });

  it('round-trips extended TURN_RESOLVED fields below the 16 KiB limit', () => {
    const message: ServerMessage = {
      v: PROTOCOL_VERSION,
      type: 'TURN_RESOLVED',
      roomId: 'room-affinity',
      turnId: 12,
      resolution,
      snapshot: {
        host: { integrity: 900, spirit: 70, lockStability: 80, spin: 600, alive: true },
        guest: { integrity: 852, spirit: 90, lockStability: 50, spin: 560, alive: true },
      },
    };
    const raw = JSON.stringify(message);
    const parsed = parseServerMessage(raw);

    expect(new TextEncoder().encode(raw).byteLength).toBeLessThan(MAX_MESSAGE_BYTES);
    expect(parsed).toEqual(message);
    expect(parsed?.type === 'TURN_RESOLVED' ? parsed.resolution.damageResults?.[0] : null).toEqual(damage);
  });
});
