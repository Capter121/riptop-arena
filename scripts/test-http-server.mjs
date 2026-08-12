import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8092;
const URL = `http://127.0.0.1:${PORT}`;
const siteRoot = await mkdtemp(join(tmpdir(), 'nss-http-server-'));
const arenaRoot = join(siteRoot, 'arena');
const arenaAssetsRoot = join(arenaRoot, 'assets');
await mkdir(arenaRoot);
await mkdir(arenaAssetsRoot);
await writeFile(join(siteRoot, 'index.html'), '<!doctype html><title>NSS Portal</title>', 'utf8');
await writeFile(join(arenaRoot, 'index.html'), '<!doctype html><title>RIPTOP Arena</title>', 'utf8');
const bundle = `export const payload = '${'compress-me-'.repeat(200)}';`;
await writeFile(join(arenaAssetsRoot, 'game-AbCd1234.js'), bundle, 'utf8');

const server = spawn(process.execPath, ['server/match-server.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(PORT),
    NODE_ENV: 'production',
    SITE_ROOT: siteRoot,
    DATABASE_PATH: ':memory:',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('HTTP server did not start.')), 2_000);
    server.stdout.on('data', (data) => {
      if (!data.toString().includes('Match server listening')) return;
      clearTimeout(timer);
      resolve();
    });
    server.once('exit', (code) => reject(new Error(`HTTP server exited early with ${code}.`)));
  });

  const health = await fetch(`${URL}/health`);
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await health.json(), { status: 'ok' });

  const missing = await fetch(`${URL}/api/missing`);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await missing.json(), {
    error: { code: 'NOT_FOUND', message: 'Resource not found.' },
  });

  const malformed = await fetch(`${URL}/api/missing`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, 'INVALID_JSON');

  const oversized = await fetch(`${URL}/api/missing`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value: 'x'.repeat(65 * 1024) }),
  });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, 'BODY_TOO_LARGE');

  const portal = await fetch(`${URL}/`);
  assert.equal(portal.status, 200);
  assert.equal(portal.headers.get('cache-control'), 'no-cache');
  assert.equal(await portal.text(), '<!doctype html><title>NSS Portal</title>');

  const join = await fetch(`${URL}/join`);
  assert.equal(join.status, 200);
  assert.equal(await join.text(), '<!doctype html><title>NSS Portal</title>');

  const joinHead = await fetch(`${URL}/join/`, { method: 'HEAD' });
  assert.equal(joinHead.status, 200);
  assert.equal(await joinHead.text(), '');

  const challenge = await fetch(`${URL}/challenge/11111111-1111-4111-8111-111111111111`);
  assert.equal(challenge.status, 200);
  assert.equal(await challenge.text(), '<!doctype html><title>NSS Portal</title>');

  const challengesHead = await fetch(`${URL}/challenges/`, { method: 'HEAD' });
  assert.equal(challengesHead.status, 200);
  assert.equal(await challengesHead.text(), '');

  const campaign = await fetch(`${URL}/campaign/`);
  assert.equal(campaign.status, 200);
  assert.equal(await campaign.text(), '<!doctype html><title>NSS Portal</title>');

  const survival = await fetch(`${URL}/survival/`);
  assert.equal(survival.status, 200);
  assert.equal(await survival.text(), '<!doctype html><title>NSS Portal</title>');

  const arena = await fetch(`${URL}/arena/`);
  assert.equal(arena.status, 200);
  assert.equal(await arena.text(), '<!doctype html><title>RIPTOP Arena</title>');

  const brotliBundle = await fetch(`${URL}/arena/assets/game-AbCd1234.js`, {
    headers: { 'accept-encoding': 'br' },
  });
  assert.equal(brotliBundle.status, 200);
  assert.equal(brotliBundle.headers.get('content-encoding'), 'br');
  assert.equal(brotliBundle.headers.get('vary'), 'Accept-Encoding');
  assert.equal(brotliBundle.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(await brotliBundle.text(), bundle);
  assert.ok(Number(brotliBundle.headers.get('content-length')) < Buffer.byteLength(bundle));

  const gzipBundle = await fetch(`${URL}/arena/assets/game-AbCd1234.js`, {
    headers: { 'accept-encoding': 'gzip' },
  });
  assert.equal(gzipBundle.headers.get('content-encoding'), 'gzip');
  assert.equal(await gzipBundle.text(), bundle);

  const identityBundle = await fetch(`${URL}/arena/assets/game-AbCd1234.js`, {
    headers: { 'accept-encoding': 'identity' },
  });
  assert.equal(identityBundle.headers.get('content-encoding'), null);
  assert.equal(identityBundle.headers.get('vary'), 'Accept-Encoding');

  const unknown = await fetch(`${URL}/unknown-route`);
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).error.code, 'NOT_FOUND');

  console.log('HTTP server smoke tests passed.');
} finally {
  server.kill();
  await unlink(join(arenaAssetsRoot, 'game-AbCd1234.js'));
  await unlink(join(arenaRoot, 'index.html'));
  await unlink(join(siteRoot, 'index.html'));
  await rmdir(arenaAssetsRoot);
  await rmdir(arenaRoot);
  await rmdir(siteRoot);
}
