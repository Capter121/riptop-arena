import type { PartUpgradeLevels, UpgradeLevels } from '../app/progression';
import type { BuildSelection } from '../data/parts';
import type { TurnResolution } from '../gameplay/battlePhysics';
import type { SkillTier, TurnAction } from '../types/battle';

export const PROTOCOL_VERSION = 1 as const;
export const MAX_MESSAGE_BYTES = 16 * 1024;
export const STATE_INTERVAL_SECONDS = 0.05;

export type OnlineRole = 'host' | 'guest';
export type ConnectionState = 'idle' | 'connecting' | 'queued' | 'matched' | 'in_battle' | 'closed';

export type OnlineLoadout = {
  build: BuildSelection;
  upgrades: UpgradeLevels;
  partUpgrades: PartUpgradeLevels;
};

export type NetworkTopState = {
  seq: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  spin: number;
  hp: number;
  alive: boolean;
};

export type ActorSnapshot = {
  integrity: number;
  spirit: number;
  lockStability: number;
  spin: number;
  alive: boolean;
};

export type TurnSnapshot = {
  host: ActorSnapshot;
  guest: ActorSnapshot;
};

export type LaunchConfig = {
  hostX: number;
  guestX: number;
  z: number;
  hostPower: number;
  guestPower: number;
};

type VersionedMessage<T extends string> = { v: typeof PROTOCOL_VERSION; type: T };
type RoomMessage<T extends string> = VersionedMessage<T> & { roomId: string };

export type ClientMessage =
  | (VersionedMessage<'JOIN_QUEUE'> & { displayName: string; loadout: OnlineLoadout })
  | VersionedMessage<'CANCEL_QUEUE'>
  | RoomMessage<'CLIENT_READY'>
  | (RoomMessage<'MATCH_START'> & { startDelayMs: number; launchConfig: LaunchConfig })
  | (RoomMessage<'STATE'> & NetworkTopState)
  | (RoomMessage<'TURN_OPEN'> & { turnId: number })
  | (RoomMessage<'TURN_ACTION'> & { turnId: number; action: TurnAction })
  | (RoomMessage<'TURN_RESOLVED'> & {
      turnId: number;
      resolution: TurnResolution;
      snapshot: TurnSnapshot;
    })
  | (RoomMessage<'CLASH_QTE_START'> & {
      turnId: number;
      resolution: TurnResolution;
    })
  | (RoomMessage<'CLASH_QTE_SCORE'> & {
      turnId: number;
      score: number;
      final: boolean;
    })
  | (RoomMessage<'CRIT_TRIGGERED'> & {
      eventId: string;
      turnId: number;
      attacker: OnlineRole;
      target: OnlineRole;
      damage: number;
      skillTier: SkillTier;
      position: { x: number; z: number };
    })
  | (RoomMessage<'SUBSTITUTE_HERO'> & {
      eventId: string;
      actor: OnlineRole;
      position: { x: number; z: number };
    });

export type ServerMessage =
  | (VersionedMessage<'QUEUED'> & { peerId: string })
  | (RoomMessage<'MATCHED'> & {
      peerId: string;
      role: OnlineRole;
      opponentLoadout: OnlineLoadout;
      opponentName: string;
    })
  | RoomMessage<'ALL_READY'>
  | (RoomMessage<'MATCH_START'> & { startDelayMs: number; launchConfig: LaunchConfig })
  | (RoomMessage<'STATE'> & NetworkTopState)
  | (RoomMessage<'TURN_OPEN'> & { turnId: number; deadline: number })
  | (RoomMessage<'TURN_ACTION_SET'> & {
      turnId: number;
      hostAction: TurnAction;
      guestAction: TurnAction;
    })
  | (RoomMessage<'TURN_RESOLVED'> & {
      turnId: number;
      resolution: TurnResolution;
      snapshot: TurnSnapshot;
    })
  | (RoomMessage<'CLASH_QTE_START'> & {
      turnId: number;
      resolution: TurnResolution;
    })
  | (RoomMessage<'CLASH_QTE_SCORE'> & {
      turnId: number;
      score: number;
      final: boolean;
    })
  | (RoomMessage<'CRIT_TRIGGERED'> & {
      eventId: string;
      turnId: number;
      attacker: OnlineRole;
      target: OnlineRole;
      damage: number;
      skillTier: SkillTier;
      position: { x: number; z: number };
    })
  | (RoomMessage<'SUBSTITUTE_HERO'> & {
      eventId: string;
      actor: OnlineRole;
      position: { x: number; z: number };
    })
  | (RoomMessage<'TURN_TIMEOUT'> & { turnId: number; loser: OnlineRole; winner: OnlineRole })
  | (RoomMessage<'PEER_DISCONNECTED'> & { reason: string })
  | (VersionedMessage<'ERROR'> & { code: string; message: string; roomId?: string });

const SERVER_MESSAGE_TYPES = new Set<ServerMessage['type']>([
  'QUEUED',
  'MATCHED',
  'ALL_READY',
  'MATCH_START',
  'STATE',
  'TURN_OPEN',
  'TURN_ACTION_SET',
  'TURN_RESOLVED',
  'CLASH_QTE_START',
  'CLASH_QTE_SCORE',
  'CRIT_TRIGGERED',
  'SUBSTITUTE_HERO',
  'TURN_TIMEOUT',
  'PEER_DISCONNECTED',
  'ERROR',
]);

export function parseServerMessage(raw: string): ServerMessage | null {
  if (new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES) return null;

  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const message = value as Record<string, unknown>;
    if (message.v !== PROTOCOL_VERSION || typeof message.type !== 'string') return null;
    if (!SERVER_MESSAGE_TYPES.has(message.type as ServerMessage['type'])) return null;
    return message as ServerMessage;
  } catch {
    return null;
  }
}

export function isFiniteNetworkState(state: NetworkTopState) {
  return Number.isSafeInteger(state.seq)
    && state.seq >= 0
    && [state.x, state.z, state.vx, state.vz, state.spin, state.hp].every(Number.isFinite)
    && typeof state.alive === 'boolean';
}

export function oppositeRole(role: OnlineRole): OnlineRole {
  return role === 'host' ? 'guest' : 'host';
}
