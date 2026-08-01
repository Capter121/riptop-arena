import {
  PROTOCOL_VERSION,
  STATE_INTERVAL_SECONDS,
  isFiniteNetworkState,
  parseServerMessage,
  type ClientMessage,
  type ConnectionState,
  type LaunchConfig,
  type NetworkTopState,
  type OnlineLoadout,
  type OnlineRole,
  type ServerMessage,
  type TurnSnapshot,
} from './protocol';
import type { TurnResolution } from '../gameplay/battlePhysics';
import type { SkillTier, TurnAction } from '../types/battle';

type MessageListener = (message: ServerMessage) => void;
type StateListener = (state: ConnectionState) => void;

export class NetworkClient {
  private url: string;
  private socket: WebSocket | null = null;
  private connectionState: ConnectionState = 'idle';
  private readonly messageListeners = new Set<MessageListener>();
  private readonly stateListeners = new Set<StateListener>();
  private stateAccumulator = 0;
  private localSequence = 0;
  private remoteSequence = -1;
  private eventCounter = 0;
  private readonly recentEventIds: string[] = [];
  private readonly recentEventSet = new Set<string>();
  private sentStatePackets = 0;
  private receivedStatePackets = 0;

  roomId: string | null = null;
  peerId: string | null = null;
  role: OnlineRole | null = null;
  opponentLoadout: OnlineLoadout | null = null;
  opponentName = 'Online Rival';

  constructor(url = import.meta.env.VITE_WS_URL || deriveWebSocketUrl(window.location.href)) {
    this.url = url;
  }

  get state() {
    return this.connectionState;
  }

  get connected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  onMessage(listener: MessageListener) {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onStateChange(listener: StateListener) {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  async joinQueue(displayName: string, loadout: OnlineLoadout, customUrl?: string) {
    if (customUrl) {
      this.url = customUrl;
    }
    if (!this.connected) await this.connect(customUrl);
    this.send({ v: PROTOCOL_VERSION, type: 'JOIN_QUEUE', displayName, loadout });
  }

  cancelQueue() {
    if (this.connected) this.send({ v: PROTOCOL_VERSION, type: 'CANCEL_QUEUE' });
    this.disconnect();
  }

  sendReady() {
    const roomId = this.requireRoom();
    if (roomId) this.send({ v: PROTOCOL_VERSION, type: 'CLIENT_READY', roomId });
  }

  sendMatchStart(startDelayMs: number, launchConfig: LaunchConfig) {
    const roomId = this.requireRoom();
    if (roomId) this.send({ v: PROTOCOL_VERSION, type: 'MATCH_START', roomId, startDelayMs, launchConfig });
  }

  sendTurnAction(turnId: number, action: TurnAction) {
    const roomId = this.requireRoom();
    if (roomId) this.send({ v: PROTOCOL_VERSION, type: 'TURN_ACTION', roomId, turnId, action });
  }

  openTurn(turnId: number) {
    const roomId = this.requireRoom();
    if (roomId) this.send({ v: PROTOCOL_VERSION, type: 'TURN_OPEN', roomId, turnId });
  }

  sendTurnResolved(turnId: number, resolution: TurnResolution, snapshot: TurnSnapshot) {
    const roomId = this.requireRoom();
    if (roomId) this.send({ v: PROTOCOL_VERSION, type: 'TURN_RESOLVED', roomId, turnId, resolution, snapshot });
  }

  sendClashQteStart(turnId: number, resolution: TurnResolution) {
    const roomId = this.requireRoom();
    if (roomId) this.send({ v: PROTOCOL_VERSION, type: 'CLASH_QTE_START', roomId, turnId, resolution });
  }

  sendClashQteScore(turnId: number, score: number, final = false) {
    const roomId = this.requireRoom();
    if (!roomId || !Number.isFinite(score)) return;
    this.send({ v: PROTOCOL_VERSION, type: 'CLASH_QTE_SCORE', roomId, turnId, score, final });
  }

  sendCritTriggered(turnId: number, attacker: OnlineRole, target: OnlineRole, damage: number, skillTier: SkillTier, position: { x: number; z: number }) {
    const roomId = this.requireRoom();
    if (roomId) this.send({ v: PROTOCOL_VERSION, type: 'CRIT_TRIGGERED', roomId, eventId: this.createEventId('crit'), turnId, attacker, target, damage, skillTier, position });
  }

  sendSubstitution(position: { x: number; z: number }) {
    const roomId = this.requireRoom();
    if (!roomId || !this.role) return;
    this.send({ v: PROTOCOL_VERSION, type: 'SUBSTITUTE_HERO', roomId, eventId: this.createEventId('sub'), actor: this.role, position });
  }

  update(dt: number, getSnapshot: () => Omit<NetworkTopState, 'seq'>) {
    if (this.connectionState !== 'in_battle' || !this.connected || !this.roomId) return;
    this.stateAccumulator += Math.max(0, dt);
    if (this.stateAccumulator < STATE_INTERVAL_SECONDS) return;
    this.stateAccumulator %= STATE_INTERVAL_SECONDS;

    const payload: NetworkTopState = {
      ...getSnapshot(),
      seq: ++this.localSequence,
    };
    if (!isFiniteNetworkState(payload)) return;
    this.send({ v: PROTOCOL_VERSION, type: 'STATE', roomId: this.roomId, ...payload });
    this.sentStatePackets += 1;
  }

  disconnect() {
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) {
      socket.close(1000, 'Client reset');
    }
    this.resetSession();
    this.setState('idle');
  }

  getDiagnostics() {
    return {
      state: this.connectionState,
      url: this.url,
      roomId: this.roomId,
      role: this.role,
      sentStatePackets: this.sentStatePackets,
      receivedStatePackets: this.receivedStatePackets,
      localSequence: this.localSequence,
      remoteSequence: this.remoteSequence,
    };
  }

  connect(customUrl?: string) {
    if (customUrl) {
      this.url = customUrl;
    }
    this.setState('connecting');
    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      socket.addEventListener('open', () => resolve(), { once: true });
      socket.addEventListener('error', () => {
        if (this.socket === socket) this.setState('closed');
        reject(new Error(`Unable to connect to ${this.url}`));
      }, { once: true });
      socket.addEventListener('message', (event) => this.handleRawMessage(event.data));
      socket.addEventListener('close', () => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.setState('closed');
      });
    });
  }

  private handleRawMessage(data: unknown) {
    if (typeof data !== 'string') return;
    const message = parseServerMessage(data);
    if (!message) return;

    if (message.type === 'QUEUED') {
      this.peerId = message.peerId;
      this.setState('queued');
    } else if (message.type === 'MATCHED') {
      this.roomId = message.roomId;
      this.peerId = message.peerId;
      this.role = message.role;
      this.opponentLoadout = message.opponentLoadout;
      this.opponentName = message.opponentName;
      this.setState('matched');
    } else if (message.type === 'MATCH_START') {
      this.setState('in_battle');
    } else if (message.type === 'STATE') {
      if (!isFiniteNetworkState(message) || message.seq <= this.remoteSequence) return;
      this.remoteSequence = message.seq;
      this.receivedStatePackets += 1;
    } else if (message.type === 'CRIT_TRIGGERED' || message.type === 'SUBSTITUTE_HERO') {
      if (!this.rememberEvent(message.eventId)) return;
    }

    for (const listener of this.messageListeners) listener(message);
  }

  private send(message: ClientMessage) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }

  private requireRoom() {
    return this.roomId;
  }

  private setState(state: ConnectionState) {
    if (this.connectionState === state) return;
    this.connectionState = state;
    for (const listener of this.stateListeners) listener(state);
  }

  private createEventId(prefix: string) {
    return `${this.peerId ?? 'peer'}:${prefix}:${Date.now()}:${++this.eventCounter}`;
  }

  private rememberEvent(eventId: string) {
    if (this.recentEventSet.has(eventId)) return false;
    this.recentEventSet.add(eventId);
    this.recentEventIds.push(eventId);
    if (this.recentEventIds.length > 64) {
      const oldest = this.recentEventIds.shift();
      if (oldest) this.recentEventSet.delete(oldest);
    }
    return true;
  }

  private resetSession() {
    this.roomId = null;
    this.peerId = null;
    this.role = null;
    this.opponentLoadout = null;
    this.opponentName = 'Online Rival';
    this.stateAccumulator = 0;
    this.localSequence = 0;
    this.remoteSequence = -1;
    this.eventCounter = 0;
    this.recentEventIds.length = 0;
    this.recentEventSet.clear();
    this.sentStatePackets = 0;
    this.receivedStatePackets = 0;
  }
}

export function deriveWebSocketUrl(pageUrl: string) {
  const url = new URL(pageUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.port = '8080';
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url.toString();
}
