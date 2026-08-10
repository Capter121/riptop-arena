import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetworkClient, deriveWebSocketUrl } from '../../src/network/networkClient';
import { parseServerMessage } from '../../src/network/protocol';
import type { OnlineLoadout } from '../../src/network/protocol';

const loadout: OnlineLoadout = {
  kind: 'legacy',
  build: { attackRing: 'round', core: 'balanced', driver: 'grip' },
  upgrades: { attack: 0, defense: 0, stamina: 0 },
  partUpgrades: {},
};

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  private listeners = new Map<string, Array<{ listener: (event: { data?: string }) => void; once: boolean }>>();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: { data?: string }) => void, options?: { once?: boolean }) {
    const entries = this.listeners.get(type) ?? [];
    entries.push({ listener, once: options?.once ?? false });
    this.listeners.set(type, entries);
  }

  send(value: string) {
    this.sent.push(value);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close');
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open');
  }

  receive(message: object) {
    this.emit('message', JSON.stringify({ v: 2, ...message }));
  }

  private emit(type: string, data?: string) {
    const entries = this.listeners.get(type) ?? [];
    this.listeners.set(type, entries.filter(entry => !entry.once));
    for (const entry of entries) entry.listener({ data });
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWebSocket.instances.length = 0;
});

describe('network client helpers', () => {
  it.each([
    ['https://example.com/arena/', 'wss://example.com/'],
    ['https://example.com:8443/arena/?room=secret#join', 'wss://example.com:8443/'],
    ['http://127.0.0.1:8080/arena/', 'ws://127.0.0.1:8080/'],
    ['http://192.168.1.42:4176/arena/?room=secret#join', 'ws://192.168.1.42:8080/'],
  ])('derives %s as %s', (pageUrl, expected) => {
    expect(deriveWebSocketUrl(pageUrl)).toBe(expected);
  });

  it('parses a private room creation response', () => {
    expect(parseServerMessage(JSON.stringify({
      v: 2,
      type: 'PRIVATE_ROOM_CREATED',
      roomToken: 'AbCdEfGhIjKlMnOpQrStUvWx',
    }))).toEqual({
      v: 2,
      type: 'PRIVATE_ROOM_CREATED',
      roomToken: 'AbCdEfGhIjKlMnOpQrStUvWx',
    });
  });

  it('rejects malformed private room creation responses', () => {
    expect(parseServerMessage(JSON.stringify({ v: 2, type: 'PRIVATE_ROOM_CREATED', roomToken: '../bad' }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ v: 2, type: 'UNKNOWN' }))).toBeNull();
  });

  it('creates a private room and tracks the returned token', async () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const client = new NetworkClient('ws://example.test');
    const pending = client.createPrivateRoom('Nova', loadout);
    const socket = FakeWebSocket.instances[0];
    socket.open();
    await pending;
    expect(JSON.parse(socket.sent[0])).toEqual({ v: 2, type: 'CREATE_PRIVATE_ROOM', displayName: 'Nova', loadout });
    socket.receive({ type: 'PRIVATE_ROOM_CREATED', roomToken: 'AbCdEfGhIjKlMnOpQrStUvWx' });
    expect(client.privateRoomToken).toBe('AbCdEfGhIjKlMnOpQrStUvWx');
    expect(client.state).toBe('private_waiting');
    client.cancelQueue();
    expect(client.privateRoomToken).toBeNull();
    expect(client.state).toBe('idle');
  });

  it('joins a private room with its token', async () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const client = new NetworkClient('ws://example.test');
    const pending = client.joinPrivateRoom('AbCdEfGhIjKlMnOpQrStUvWx', 'Rin', loadout);
    const socket = FakeWebSocket.instances[0];
    socket.open();
    await pending;
    expect(JSON.parse(socket.sent[0])).toEqual({
      v: 2,
      type: 'JOIN_PRIVATE_ROOM',
      roomToken: 'AbCdEfGhIjKlMnOpQrStUvWx',
      displayName: 'Rin',
      loadout,
    });
  });
});
