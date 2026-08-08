import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_JSON_BODY_BYTES = 64 * 1024;
const DEFAULT_SITE_ROOT = fileURLToPath(new URL('../dist/site/', import.meta.url));
const CONTENT_TYPES = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'x-content-type-options': 'nosniff',
  });
  response.end(body);
}

function sendError(response, status, code, message) {
  sendJson(response, status, { error: { code, message } });
}

async function readJsonBody(request, maxBytes) {
  const contentType = request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    request.resume();
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.');
  }
  const contentLength = Number(request.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    request.resume();
    throw new HttpError(413, 'BODY_TOO_LARGE', `JSON body exceeds the ${maxBytes} byte limit.`);
  }

  const chunks = [];
  let size = 0;
  let tooLarge = false;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      tooLarge = true;
      continue;
    }
    chunks.push(chunk);
  }
  if (tooLarge) throw new HttpError(413, 'BODY_TOO_LARGE', `JSON body exceeds the ${maxBytes} byte limit.`);
  if (size === 0) return null;

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }
}

async function serveStatic(request, response, siteRoot, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, 'INVALID_PATH', 'Request path is invalid.');
  }

  const root = resolve(siteRoot);
  const relativePath = decodedPath.replace(/^\/+/, '');
  let filePath = resolve(root, relativePath || 'index.html');
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) return false;

  try {
    const entry = await stat(filePath);
    if (entry.isDirectory()) filePath = resolve(filePath, 'index.html');
    else if (!entry.isFile()) return false;
    const body = await readFile(filePath);
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'content-length': body.length,
      'x-content-type-options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export function createArenaHttpServer(options = {}) {
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const siteRoot = options.siteRoot ?? process.env.SITE_ROOT ?? DEFAULT_SITE_ROOT;
  const maxJsonBodyBytes = options.maxJsonBodyBytes ?? DEFAULT_JSON_BODY_BYTES;

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (request.method === 'GET' && url.pathname === '/health') {
        sendJson(response, 200, { status: 'ok' });
        return;
      }

      if (url.pathname.startsWith('/api/')) {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          await readJsonBody(request, maxJsonBodyBytes);
        }
        sendError(response, 404, 'NOT_FOUND', 'Resource not found.');
        return;
      }

      if (production && (request.method === 'GET' || request.method === 'HEAD')) {
        if (await serveStatic(request, response, siteRoot, url.pathname)) return;
      }
      sendError(response, 404, 'NOT_FOUND', 'Resource not found.');
    } catch (error) {
      if (error instanceof HttpError) {
        sendError(response, error.status, error.code, error.message);
        return;
      }
      console.error('HTTP request failed.', error);
      sendError(response, 500, 'INTERNAL_ERROR', 'Internal server error.');
    }
  });
}
