import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { networkInterfaces } from 'node:os';

const PROTOCOL_VERSION = 1;
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_MESSAGE_BYTES = 16 * 1024;
const READY_TIMEOUT_MS = Number(process.env.READY_TIMEOUT_MS || 10_000);
const TURN_TIMEOUT_MS = Number(process.env.TURN_TIMEOUT_MS || 15_000);
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS || 2_000);
const HEARTBEAT_DEAD_MS = Number(process.env.HEARTBEAT_DEAD_MS || 5_000);

const wss = new WebSocketServer({ host: HOST, port: PORT, maxPayload: MAX_MESSAGE_BYTES });
const clients = new Map();
const rooms = new Map();
let waitingPlayer = null;

function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ v: PROTOCOL_VERSION, ...message }));
}

function sendError(ws, code, message, roomId) {
  send(ws, { type: 'ERROR', code, message, ...(roomId ? { roomId } : {}) });
}

function clearRoomTimers(room) {
  if (room.readyTimer) clearTimeout(room.readyTimer);
  if (room.turnTimer) clearTimeout(room.turnTimer);
  if (room.startTimer) clearTimeout(room.startTimer);
  room.readyTimer = null;
  room.turnTimer = null;
  room.startTimer = null;
}

function cleanupRoom(room) {
  clearRoomTimers(room);
  rooms.delete(room.id);
  for (const ws of [room.host, room.guest]) {
    const meta = clients.get(ws);
    if (!meta || meta.roomId !== room.id) continue;
    meta.roomId = null;
    meta.role = null;
    meta.ready = false;
  }
}

function peerFor(room, ws) {
  return room.host === ws ? room.guest : room.host;
}

function broadcast(room, message) {
  send(room.host, message);
  send(room.guest, message);
}

function roomFor(ws, message) {
  const meta = clients.get(ws);
  if (!meta?.roomId || meta.roomId !== message.roomId) {
    sendError(ws, 'ROOM_MISMATCH', 'Message does not belong to this connection room.', message.roomId);
    return null;
  }
  const room = rooms.get(meta.roomId);
  if (!room) {
    sendError(ws, 'ROOM_NOT_FOUND', 'Room no longer exists.', message.roomId);
    return null;
  }
  return room;
}

function requireHost(ws, room) {
  if (room.host === ws) return true;
  sendError(ws, 'HOST_ONLY', 'Only the room host may send this message.', room.id);
  return false;
}

function validJoin(message) {
  return typeof message.displayName === 'string'
    && message.displayName.length > 0
    && message.displayName.length <= 32
    && message.loadout
    && typeof message.loadout === 'object'
    && message.loadout.build
    && typeof message.loadout.build === 'object'
    && message.loadout.upgrades
    && typeof message.loadout.upgrades === 'object'
    && message.loadout.partUpgrades
    && typeof message.loadout.partUpgrades === 'object';
}

function createRoom(host, guest) {
  const hostMeta = clients.get(host);
  const guestMeta = clients.get(guest);
  const room = {
    id: randomUUID(),
    host,
    guest,
    currentTurn: 0,
    actions: new Map(),
    started: false,
    readyTimer: null,
    turnTimer: null,
    startTimer: null,
  };
  rooms.set(room.id, room);
  hostMeta.roomId = room.id;
  hostMeta.role = 'host';
  hostMeta.ready = false;
  guestMeta.roomId = room.id;
  guestMeta.role = 'guest';
  guestMeta.ready = false;

  send(host, {
    type: 'MATCHED',
    roomId: room.id,
    peerId: hostMeta.id,
    role: 'host',
    opponentLoadout: guestMeta.loadout,
    opponentName: guestMeta.displayName,
  });
  send(guest, {
    type: 'MATCHED',
    roomId: room.id,
    peerId: guestMeta.id,
    role: 'guest',
    opponentLoadout: hostMeta.loadout,
    opponentName: hostMeta.displayName,
  });

  room.readyTimer = setTimeout(() => {
    if (!rooms.has(room.id)) return;
    for (const member of [room.host, room.guest]) {
      sendError(member, 'READY_TIMEOUT', 'Both players were not ready in time.', room.id);
    }
    cleanupRoom(room);
  }, READY_TIMEOUT_MS);
}

function openTurn(room, turnId) {
  if (!rooms.has(room.id) || !room.started || turnId <= room.currentTurn) return;
  if (room.turnTimer) clearTimeout(room.turnTimer);
  room.currentTurn = turnId;
  room.actions.clear();
  const deadline = Date.now() + TURN_TIMEOUT_MS;
  broadcast(room, { type: 'TURN_OPEN', roomId: room.id, turnId, deadline });
  room.turnTimer = setTimeout(() => {
    if (!rooms.has(room.id) || room.currentTurn !== turnId) return;
    const loser = !room.actions.has('host') ? 'host' : 'guest';
    const winner = loser === 'host' ? 'guest' : 'host';
    broadcast(room, { type: 'TURN_TIMEOUT', roomId: room.id, turnId, loser, winner });
    cleanupRoom(room);
  }, TURN_TIMEOUT_MS);
}

function handleJoin(ws, message) {
  const meta = clients.get(ws);
  if (!validJoin(message)) {
    sendError(ws, 'INVALID_LOADOUT', 'Queue request contains an invalid loadout.');
    return;
  }
  if (meta.roomId) {
    sendError(ws, 'ALREADY_MATCHED', 'Connection is already in a room.', meta.roomId);
    return;
  }
  meta.displayName = message.displayName;
  meta.loadout = message.loadout;

  if (waitingPlayer && waitingPlayer.readyState === WebSocket.OPEN && waitingPlayer !== ws) {
    const host = waitingPlayer;
    waitingPlayer = null;
    createRoom(host, ws);
    return;
  }

  waitingPlayer = ws;
  send(ws, { type: 'QUEUED', peerId: meta.id });
}

function handleRoomMessage(ws, message) {
  const room = roomFor(ws, message);
  if (!room) return;
  const meta = clients.get(ws);

  switch (message.type) {
    case 'CLIENT_READY': {
      meta.ready = true;
      if (clients.get(room.host)?.ready && clients.get(room.guest)?.ready) {
        if (room.readyTimer) clearTimeout(room.readyTimer);
        room.readyTimer = null;
        send(room.host, { type: 'ALL_READY', roomId: room.id });
      }
      break;
    }
    case 'MATCH_START': {
      if (!requireHost(ws, room) || room.started) return;
      if (!clients.get(room.host)?.ready || !clients.get(room.guest)?.ready) {
        sendError(ws, 'PLAYERS_NOT_READY', 'Both players must be ready before starting.', room.id);
        return;
      }
      if (!Number.isSafeInteger(message.startDelayMs)
        || message.startDelayMs < 500
        || message.startDelayMs > 10_000
        || !message.launchConfig) {
        sendError(ws, 'INVALID_MATCH_START', 'Match start payload is invalid.', room.id);
        return;
      }
      room.started = true;
      broadcast(room, {
        type: 'MATCH_START',
        roomId: room.id,
        startDelayMs: message.startDelayMs,
        launchConfig: message.launchConfig,
      });
      room.startTimer = setTimeout(() => openTurn(room, 1), message.startDelayMs);
      break;
    }
    case 'STATE':
    case 'SUBSTITUTE_HERO': {
      send(peerFor(room, ws), message);
      break;
    }
    case 'CRIT_TRIGGERED': {
      if (!requireHost(ws, room)) return;
      send(room.guest, message);
      break;
    }
    case 'TURN_OPEN': {
      if (!requireHost(ws, room)) return;
      openTurn(room, message.turnId);
      break;
    }
    case 'TURN_ACTION': {
      if (!room.started || message.turnId !== room.currentTurn) {
        sendError(ws, 'TURN_MISMATCH', 'Action does not match the open turn.', room.id);
        return;
      }
      if (room.actions.has(meta.role)) {
        sendError(ws, 'ACTION_ALREADY_SUBMITTED', 'Only one action is allowed per turn.', room.id);
        return;
      }
      room.actions.set(meta.role, message.action);
      if (room.actions.has('host') && room.actions.has('guest')) {
        if (room.turnTimer) clearTimeout(room.turnTimer);
        room.turnTimer = null;
        send(room.host, {
          type: 'TURN_ACTION_SET',
          roomId: room.id,
          turnId: room.currentTurn,
          hostAction: room.actions.get('host'),
          guestAction: room.actions.get('guest'),
        });
      }
      break;
    }
    case 'TURN_RESOLVED': {
      if (!requireHost(ws, room) || message.turnId !== room.currentTurn) return;
      send(room.guest, message);
      break;
    }
    case 'CLASH_QTE_START': {
      if (!requireHost(ws, room) || message.turnId !== room.currentTurn) return;
      send(room.guest, message);
      break;
    }
    case 'CLASH_QTE_SCORE': {
      if (!room.started || message.turnId !== room.currentTurn) return;
      send(peerFor(room, ws), message);
      break;
    }
    default:
      sendError(ws, 'UNSUPPORTED_MESSAGE', `Unsupported room message: ${message.type}`, room.id);
  }
}

wss.on('connection', (ws) => {
  clients.set(ws, {
    id: randomUUID(),
    roomId: null,
    role: null,
    ready: false,
    displayName: '',
    loadout: null,
    lastPongAt: Date.now(),
  });

  ws.on('pong', () => {
    const meta = clients.get(ws);
    if (meta) meta.lastPongAt = Date.now();
  });

  ws.on('message', (data) => {
    const raw = data.toString();
    if (Buffer.byteLength(raw) > MAX_MESSAGE_BYTES) {
      sendError(ws, 'MESSAGE_TOO_LARGE', 'Message exceeds the 16KB limit.');
      return;
    }

    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      sendError(ws, 'INVALID_JSON', 'Message must be valid JSON.');
      return;
    }

    if (!message || message.v !== PROTOCOL_VERSION || typeof message.type !== 'string') {
      sendError(ws, 'PROTOCOL_MISMATCH', 'Unsupported protocol version or message shape.');
      return;
    }

    if (message.type === 'JOIN_QUEUE') {
      handleJoin(ws, message);
      return;
    }
    if (message.type === 'CANCEL_QUEUE') {
      if (waitingPlayer === ws) waitingPlayer = null;
      return;
    }
    handleRoomMessage(ws, message);
  });

  ws.on('close', () => {
    if (waitingPlayer === ws) waitingPlayer = null;
    const meta = clients.get(ws);
    const room = meta?.roomId ? rooms.get(meta.roomId) : null;
    if (room) {
      send(peerFor(room, ws), { type: 'PEER_DISCONNECTED', roomId: room.id, reason: 'Opponent disconnected.' });
      cleanupRoom(room);
    }
    clients.delete(ws);
  });
});

const heartbeat = setInterval(() => {
  const now = Date.now();
  for (const [ws, meta] of clients) {
    if (now - meta.lastPongAt > HEARTBEAT_DEAD_MS) {
      ws.terminate();
      continue;
    }
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }
}, HEARTBEAT_INTERVAL_MS);

wss.on('close', () => clearInterval(heartbeat));

wss.on('listening', () => {
  console.log(`Match server listening on ws://${HOST}:${PORT}`);
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        console.log(`LAN match server: ws://${address.address}:${PORT}`);
      }
    }
  }
});
