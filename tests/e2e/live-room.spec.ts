import { expect, test } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import WebSocket from 'ws';

const port = 8094;
const wsUrl = `ws://127.0.0.1:${port}/`;
let matchServer: ChildProcessWithoutNullStreams;
const loadout = {
  kind: 'legacy',
  build: { attackRing: 'round', core: 'balanced', driver: 'grip' },
  upgrades: { attack: 0, defense: 0, stamina: 0 },
  partUpgrades: {},
};

function connectRaw() {
  return new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function sendRaw(socket: WebSocket, message: object) {
  socket.send(JSON.stringify({ v: 2, ...message }));
}

function waitForRaw(socket: WebSocket, type: string, timeoutMs = 60_000) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const onMessage = (data: WebSocket.RawData) => {
      const message = JSON.parse(data.toString()) as Record<string, unknown>;
      if (message.type === 'ERROR' && type !== 'ERROR') {
        clearTimeout(timer);
        socket.off('message', onMessage);
        reject(new Error(`Server error ${String(message.code)}: ${String(message.message)}`));
        return;
      }
      if (message.type !== type) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(message);
    };
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`Timed out waiting for ${type}`));
    }, timeoutMs);
    socket.on('message', onMessage);
  });
}

test.beforeAll(async () => {
  matchServer = spawn(process.execPath, ['server/match-server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: ':memory:',
      READY_TIMEOUT_MS: '60000',
      TURN_TIMEOUT_MS: '15000',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Live-room match server did not start.')), 5_000);
    matchServer.stdout.on('data', (data) => {
      if (!data.toString().includes('Match server listening')) return;
      clearTimeout(timer);
      resolve();
    });
    matchServer.once('exit', code => reject(new Error(`Live-room match server exited early with ${code}.`)));
  });
});

test.afterAll(() => {
  matchServer?.kill();
});

test('creates and joins directed rooms through real browser controls', async ({ browser }) => {
  test.setTimeout(180_000);
  const creatorContext = await browser.newContext();
  let rawGuest: WebSocket | null = null;
  let rawLate: WebSocket | null = null;
  let rawHost: WebSocket | null = null;
  try {
    await creatorContext.addInitScript(() => {
      localStorage.setItem('nss.inviteIdentity.v1', JSON.stringify({
        version: 1,
        playerId: '123e4567-e89b-42d3-a456-426614174000',
        displayName: 'Nova',
        deviceToken: 'A'.repeat(43),
      }));
    });
    const creator = await creatorContext.newPage();
    const creatorErrors: string[] = [];
    creator.on('pageerror', error => creatorErrors.push(error.message));
    await creator.goto('/arena/');
    await creator.getByRole('button', { name: /真人联机/ }).click();
    await expect(creator.getByLabel('联机昵称')).toHaveValue('Nova');
    await expect(creator.getByLabel('联机昵称')).toBeDisabled();
    await creator.getByLabel('匹配服务器地址').fill(wsUrl);
    await creator.getByRole('button', { name: '🔗 创建好友房间' }).click();
    const share = creator.getByLabel('好友房间链接');
    await expect(share).toHaveValue(/\/arena\/\?room=[A-Za-z0-9_-]{24}$/);
    const roomToken = new URL(await share.inputValue()).searchParams.get('room');
    expect(roomToken).toMatch(/^[A-Za-z0-9_-]{24}$/);

    rawGuest = await connectRaw();
    const guestMatched = waitForRaw(rawGuest, 'MATCHED');
    sendRaw(rawGuest, { type: 'JOIN_PRIVATE_ROOM', roomToken, displayName: 'Rin', loadout });
    expect(await guestMatched).toMatchObject({ opponentName: 'Nova', role: 'guest' });
    rawLate = await connectRaw();
    const lateError = waitForRaw(rawLate, 'ERROR');
    sendRaw(rawLate, { type: 'JOIN_PRIVATE_ROOM', roomToken, displayName: 'Late', loadout });
    expect(await lateError).toMatchObject({ code: 'PRIVATE_ROOM_NOT_FOUND' });
    await creator.screenshot({ path: 'output/playwright/live-room-matched.png', fullPage: true });
    expect(creatorErrors).toEqual([]);

    await creatorContext.close();
    rawGuest.close();
    rawLate.close();
    rawGuest = null;
    rawLate = null;

    rawHost = await connectRaw();
    const createdByRaw = waitForRaw(rawHost, 'PRIVATE_ROOM_CREATED');
    sendRaw(rawHost, { type: 'CREATE_PRIVATE_ROOM', displayName: 'Nova', loadout });
    const rawRoomToken = (await createdByRaw).roomToken;
    expect(rawRoomToken).toMatch(/^[A-Za-z0-9_-]{24}$/);

    const guestContext = await browser.newContext();
    try {
      const guest = await guestContext.newPage();
      const guestErrors: string[] = [];
      guest.on('pageerror', error => guestErrors.push(error.message));
      await guest.goto(`/arena/?room=${rawRoomToken}`);
      await expect(guest.getByRole('button', { name: '⚔️ 加入指定房间' })).toBeVisible({ timeout: 60_000 });
      await guest.getByLabel('联机昵称').fill('Rin');
      await guest.getByLabel('匹配服务器地址').fill(wsUrl);
      const hostMatched = waitForRaw(rawHost, 'MATCHED');
      await guest.getByRole('button', { name: '⚔️ 加入指定房间' }).click();
      expect(await hostMatched).toMatchObject({ opponentName: 'Rin', role: 'host' });
      expect(await guest.evaluate(() => localStorage.getItem('nss.onlineGuestName.v1'))).toBe('Rin');
      expect(guestErrors).toEqual([]);
    } finally {
      await guestContext.close();
    }
  } finally {
    if (creatorContext.pages().length > 0) await creatorContext.close();
    rawGuest?.close();
    rawLate?.close();
    rawHost?.close();
  }
});
