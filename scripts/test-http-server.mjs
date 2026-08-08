import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8092;
const URL = `http://127.0.0.1:${PORT}`;
const siteRoot = await mkdtemp(join(tmpdir(), 'nss-http-server-'));
const arenaRoot = join(siteRoot, 'arena');
await mkdir(arenaRoot);
await writeFile(join(siteRoot, 'index.html'), '<!doctype html><title>NSS Portal</title>', 'utf8');
await writeFile(join(arenaRoot, 'index.html'), '<!doctype html><title>RIPTOP Arena</title>', 'utf8');

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
  assert.deepEqual(await health.json(), { status: 'ok' });

  const missing = await fetch(`${URL}/api/missing`);
  assert.equal(missing.status, 404);
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
  assert.equal(await portal.text(), '<!doctype html><title>NSS Portal</title>');

  const arena = await fetch(`${URL}/arena/`);
  assert.equal(arena.status, 200);
  assert.equal(await arena.text(), '<!doctype html><title>RIPTOP Arena</title>');

  console.log('HTTP server smoke tests passed.');
} finally {
  server.kill();
  await unlink(join(arenaRoot, 'index.html'));
  await unlink(join(siteRoot, 'index.html'));
  await rmdir(arenaRoot);
  await rmdir(siteRoot);
}
