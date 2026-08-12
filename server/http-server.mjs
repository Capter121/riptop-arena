import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';
import { authenticateRequest } from './auth/auth-middleware.mjs';
import { AuthError, redeemInvite } from './auth/invite-service.mjs';
import { ProgressionError, syncProgression } from './progression/progression-service.mjs';
import { ChallengeError, createChallengeService } from './challenges/challenge-service.mjs';
import { CampaignError, createCampaignService } from './campaign/campaign-service.mjs';
import { SurvivalError, createSurvivalService } from './survival/survival-service.mjs';

const DEFAULT_JSON_BODY_BYTES = 64 * 1024;
const CHALLENGE_RESULT_BODY_BYTES = 2 * 1024 * 1024;
const UUID_PATH = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const OFFER_PATH = new RegExp(`^/api/challenge-offers/(${UUID_PATH})(?:/(claim|revoke))?$`);
const CHALLENGE_PATH = new RegExp(`^/api/challenges/(${UUID_PATH})(?:/(results|rematch))?$`);
const CAMPAIGN_RESULT_PATH = new RegExp(`^/api/campaign/attempts/(${UUID_PATH})/result$`);
const SURVIVAL_ABANDON_PATH = new RegExp(`^/api/survival/runs/(${UUID_PATH})/abandon$`);
const SURVIVAL_WAVE_PATH = new RegExp(`^/api/survival/runs/(${UUID_PATH})/waves/([1-9][0-9]*)/(result|reward)$`);
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
const COMPRESSIBLE_TYPES = new Set(['.css', '.html', '.js', '.json', '.mjs', '.svg']);
const COMPRESSION_THRESHOLD_BYTES = 1024;
const HASHED_ASSET_PATH = /(?:^|\/)assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[^/]+$/;

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function encodeBody(request, body, compressible) {
  if (!compressible || body.length < COMPRESSION_THRESHOLD_BYTES) return { body, encoding: null };
  const accepted = String(request.headers['accept-encoding'] ?? '').toLowerCase();
  if (/(?:^|,)\s*br(?:\s*;[^,]*)?(?:,|$)/.test(accepted) && !/br\s*;\s*q=0(?:\.0*)?(?:,|$)/.test(accepted)) {
    return {
      body: brotliCompressSync(body, {
        params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 },
      }),
      encoding: 'br',
    };
  }
  if (/(?:^|,)\s*gzip(?:\s*;[^,]*)?(?:,|$)/.test(accepted) && !/gzip\s*;\s*q=0(?:\.0*)?(?:,|$)/.test(accepted)) {
    return { body: gzipSync(body), encoding: 'gzip' };
  }
  return { body, encoding: null };
}

function sendJson(response, status, value) {
  const encoded = encodeBody(response.req, Buffer.from(JSON.stringify(value)), true);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': encoded.body.length,
    'cache-control': 'no-store',
    ...(encoded.encoding ? { 'content-encoding': encoded.encoding, vary: 'Accept-Encoding' } : {}),
    'x-content-type-options': 'nosniff',
  });
  response.end(encoded.body);
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
    const extension = extname(filePath).toLowerCase();
    const encoded = encodeBody(request, body, COMPRESSIBLE_TYPES.has(extension));
    const cacheControl = extension === '.html'
      ? 'no-cache'
      : HASHED_ASSET_PATH.test(relativePath.replaceAll('\\', '/'))
        ? 'public, max-age=31536000, immutable'
        : 'no-cache';
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
      'content-length': encoded.body.length,
      'cache-control': cacheControl,
      ...(COMPRESSIBLE_TYPES.has(extension) ? { vary: 'Accept-Encoding' } : {}),
      ...(encoded.encoding ? { 'content-encoding': encoded.encoding } : {}),
      'x-content-type-options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : encoded.body);
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
  const database = options.database;
  const challengeService = database
    ? createChallengeService(database, options.challengeServiceOptions)
    : null;
  const campaignService = database
    ? createCampaignService(database, options.campaignServiceOptions)
    : null;
  const survivalService = database
    ? createSurvivalService(database, options.survivalServiceOptions)
    : null;

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (request.method === 'GET' && url.pathname === '/health') {
        sendJson(response, 200, { status: 'ok' });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/invites/redeem') {
        if (!database) throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Identity database is unavailable.');
        const identity = redeemInvite(database, await readJsonBody(request, maxJsonBodyBytes));
        sendJson(response, 201, { identity });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/me') {
        if (!database) throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Identity database is unavailable.');
        sendJson(response, 200, { player: authenticateRequest(database, request) });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/progression/sync') {
        if (!database) throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Identity database is unavailable.');
        const player = authenticateRequest(database, request);
        sendJson(response, 200, syncProgression(database, player.playerId, await readJsonBody(request, maxJsonBodyBytes)));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/survival') {
        if (!survivalService) throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Survival database is unavailable.');
        const player = authenticateRequest(database, request);
        sendJson(response, 200, survivalService.getHub(player.playerId));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/survival/runs') {
        if (!survivalService) throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Survival database is unavailable.');
        const player = authenticateRequest(database, request);
        const result = survivalService.startRun(player.playerId, await readJsonBody(request, maxJsonBodyBytes));
        sendJson(response, result.created ? 201 : 200, result);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/survival/leaderboard') {
        if (!survivalService) throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Survival database is unavailable.');
        const player = authenticateRequest(database, request);
        sendJson(response, 200, survivalService.listLeaderboard(
          player.playerId,
          Object.fromEntries(url.searchParams.entries()),
        ));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/survival/history') {
        if (!survivalService) throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Survival database is unavailable.');
        const player = authenticateRequest(database, request);
        if (url.searchParams.getAll('limit').length > 1 || url.searchParams.getAll('cursor').length > 1) {
          throw new HttpError(400, 'INVALID_SURVIVAL_REQUEST', 'Survival history query contains repeated parameters.');
        }
        sendJson(response, 200, survivalService.listHistory(
          player.playerId,
          Object.fromEntries(url.searchParams.entries()),
        ));
        return;
      }

      const survivalAbandonMatch = SURVIVAL_ABANDON_PATH.exec(url.pathname);
      if (request.method === 'POST' && survivalAbandonMatch) {
        if (!survivalService) throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Survival database is unavailable.');
        const player = authenticateRequest(database, request);
        sendJson(response, 200, survivalService.abandonRun(
          survivalAbandonMatch[1],
          player.playerId,
          await readJsonBody(request, maxJsonBodyBytes),
        ));
        return;
      }

      const survivalWaveMatch = SURVIVAL_WAVE_PATH.exec(url.pathname);
      if (request.method === 'POST' && survivalWaveMatch) {
        if (!survivalService) throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Survival database is unavailable.');
        const player = authenticateRequest(database, request);
        const wave = Number(survivalWaveMatch[2]);
        if (!Number.isSafeInteger(wave)) throw new HttpError(400, 'INVALID_SURVIVAL_REQUEST', 'Survival wave is out of range.');
        const body = await readJsonBody(request, maxJsonBodyBytes);
        if (survivalWaveMatch[3] === 'result' && body?.wave !== wave) {
          throw new HttpError(400, 'INVALID_SURVIVAL_REQUEST', 'Survival body wave does not match the request path.');
        }
        const result = survivalWaveMatch[3] === 'result'
          ? survivalService.submitWaveResult(survivalWaveMatch[1], player.playerId, body)
          : survivalService.selectReward(survivalWaveMatch[1], wave, player.playerId, body);
        sendJson(response, 200, result);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/campaign') {
        if (!campaignService) throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Campaign database is unavailable.');
        const player = authenticateRequest(database, request);
        sendJson(response, 200, campaignService.getArchive(player.playerId));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/campaign/attempts') {
        if (!campaignService) throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Campaign database is unavailable.');
        const player = authenticateRequest(database, request);
        sendJson(response, 201, campaignService.startAttempt(
          player.playerId,
          await readJsonBody(request, maxJsonBodyBytes),
        ));
        return;
      }

      const campaignResultMatch = CAMPAIGN_RESULT_PATH.exec(url.pathname);
      if (request.method === 'POST' && campaignResultMatch) {
        if (!campaignService) throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Campaign database is unavailable.');
        const player = authenticateRequest(database, request);
        sendJson(response, 200, campaignService.submitResult(
          campaignResultMatch[1],
          player.playerId,
          await readJsonBody(request, maxJsonBodyBytes),
        ));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/challenge-offers') {
        if (!challengeService) throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Challenge database is unavailable.');
        const player = authenticateRequest(database, request);
        sendJson(response, 201, challengeService.createOffer(
          player.playerId,
          await readJsonBody(request, maxJsonBodyBytes),
        ));
        return;
      }

      const offerMatch = OFFER_PATH.exec(url.pathname);
      if (offerMatch) {
        if (!challengeService) throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Challenge database is unavailable.');
        const player = authenticateRequest(database, request);
        const [, offerId, action] = offerMatch;
        if (request.method === 'GET' && action === undefined) {
          sendJson(response, 200, challengeService.getOffer(offerId, player.playerId));
          return;
        }
        if (request.method === 'POST' && action === 'claim') {
          sendJson(response, 201, challengeService.claimOffer(offerId, player.playerId));
          return;
        }
        if (request.method === 'POST' && action === 'revoke') {
          sendJson(response, 200, challengeService.revokeOffer(offerId, player.playerId));
          return;
        }
      }

      if (request.method === 'GET' && url.pathname === '/api/challenges') {
        if (!challengeService) throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Challenge database is unavailable.');
        const player = authenticateRequest(database, request);
        const optionsValue = {
          group: url.searchParams.get('group') ?? undefined,
          ...(url.searchParams.has('cursor') ? { cursor: url.searchParams.get('cursor') } : {}),
          ...(url.searchParams.has('limit') ? { limit: Number(url.searchParams.get('limit')) } : {}),
        };
        sendJson(response, 200, challengeService.listChallenges(player.playerId, optionsValue));
        return;
      }

      const challengeMatch = CHALLENGE_PATH.exec(url.pathname);
      if (challengeMatch) {
        if (!challengeService) throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Challenge database is unavailable.');
        const player = authenticateRequest(database, request);
        const [, challengeId, action] = challengeMatch;
        if (request.method === 'GET' && action === undefined) {
          sendJson(response, 200, challengeService.getChallenge(challengeId, player.playerId));
          return;
        }
        if (request.method === 'POST' && action === 'results') {
          sendJson(response, 200, challengeService.submitChallengeResult(
            challengeId,
            player.playerId,
            await readJsonBody(request, CHALLENGE_RESULT_BODY_BYTES),
          ));
          return;
        }
        if (request.method === 'POST' && action === 'rematch') {
          sendJson(response, 201, challengeService.createRematch(challengeId, player.playerId));
          return;
        }
      }

      if (url.pathname.startsWith('/api/')) {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          await readJsonBody(request, maxJsonBodyBytes);
        }
        sendError(response, 404, 'NOT_FOUND', 'Resource not found.');
        return;
      }

      if (production && (request.method === 'GET' || request.method === 'HEAD')) {
        const portalFallback = url.pathname === '/join'
          || url.pathname === '/join/'
          || url.pathname === '/challenges'
          || url.pathname === '/challenges/'
          || url.pathname === '/campaign'
          || url.pathname === '/campaign/'
          || url.pathname === '/survival'
          || url.pathname === '/survival/'
          || new RegExp(`^/challenge/${UUID_PATH}/?$`).test(url.pathname);
        const staticPathname = portalFallback
          ? '/index.html'
          : url.pathname;
        if (await serveStatic(request, response, siteRoot, staticPathname)) return;
      }
      sendError(response, 404, 'NOT_FOUND', 'Resource not found.');
    } catch (error) {
      if (error instanceof AuthError) {
        sendError(response, error.status, error.code, error.message);
        return;
      }
      if (error instanceof HttpError) {
        sendError(response, error.status, error.code, error.message);
        return;
      }
      if (error instanceof ProgressionError) {
        if (error.status === 409 && error.details?.progression) {
          sendJson(response, 409, {
            error: {
              code: error.code,
              message: error.message,
              rejectedEventId: error.details.rejectedEventId,
            },
            progression: error.details.progression,
          });
        } else {
          sendError(response, error.status, error.code, error.message);
        }
        return;
      }
      if (error instanceof ChallengeError) {
        sendError(response, error.status, error.code, error.message);
        return;
      }
      if (error instanceof CampaignError) {
        sendError(response, error.status, error.code, error.message);
        return;
      }
      if (error instanceof SurvivalError) {
        sendError(response, error.status, error.code, error.message);
        return;
      }
      console.error('HTTP request failed.', error);
      sendError(response, 500, 'INTERNAL_ERROR', 'Internal server error.');
    }
  });
}
