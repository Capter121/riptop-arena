import { readFileSync } from 'node:fs';

const LEGACY_PARTS = Object.freeze({
  attackRing: Object.freeze(['bulwark', 'round', 'slash']),
  core: Object.freeze(['balanced', 'heavy', 'light']),
  driver: Object.freeze(['drift', 'grip', 'rush']),
});
const LEGACY_PART_IDS = Object.freeze(Object.values(LEGACY_PARTS).flat().sort());
const DEFAULT_UNLOCKS = Object.freeze(['balanced', 'grip', 'round']);
const DEFAULT_BUILD = Object.freeze({ attackRing: 'round', core: 'balanced', driver: 'grip' });
const UPGRADE_KEYS = Object.freeze(['attack', 'defense', 'stamina']);
const NSS_FAMILIES = Object.freeze(['assist', 'blade', 'core', 'gear', 'tip']);
const AFFINITIES = new Set(['WIND', 'FIRE', 'WATER', 'WOOD', 'EARTH', 'LIGHT', 'DARK']);
const MAX_SYSTEM_UPGRADE_LEVEL = 5;
const MAX_PART_UPGRADE_LEVEL = 4;
const MAX_LADDER_INDEX = 3;
const MAX_CHAMPIONSHIP_COUNT = 1_000_000;
const MAX_INITIAL_COINS = 1_000_000_000;
const MAX_WALLET_EVENTS = 400;
const MAX_WALLET_DELTA = 10_000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const catalog = JSON.parse(readFileSync(
  new URL('../../battle-top-designer/shared/nss/parts.catalog.json', import.meta.url),
  'utf8',
));
const nssPartFamily = new Map(catalog.parts.map(part => [part.id, part.family]));

export class ProgressionError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'ProgressionError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function invalid(message) {
  throw new ProgressionError(400, 'INVALID_PROGRESSION', message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isRecord(value)
    && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

function boundedInteger(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    invalid(`${label} is out of range.`);
  }
  return value;
}

function normalizeBuild(value) {
  const slots = Object.keys(LEGACY_PARTS);
  if (!hasExactKeys(value, slots)) invalid('Build must contain exactly three legacy slots.');
  const build = {};
  for (const slot of slots) {
    if (typeof value[slot] !== 'string' || !LEGACY_PARTS[slot].includes(value[slot])) {
      invalid(`Invalid legacy part for ${slot}.`);
    }
    build[slot] = value[slot];
  }
  return build;
}

function normalizeUpgrades(value) {
  if (!hasExactKeys(value, UPGRADE_KEYS)) invalid('Upgrades contain invalid keys.');
  return Object.fromEntries(UPGRADE_KEYS.map(key => [
    key,
    boundedInteger(value[key], 0, MAX_SYSTEM_UPGRADE_LEVEL, `Upgrade ${key}`),
  ]));
}

function normalizePartUpgrades(value) {
  if (!isRecord(value)) invalid('Part upgrades must be an object.');
  for (const key of Object.keys(value)) {
    if (!LEGACY_PART_IDS.includes(key)) invalid(`Unknown upgraded part: ${key}.`);
    boundedInteger(value[key], 0, MAX_PART_UPGRADE_LEVEL, `Part upgrade ${key}`);
  }
  return Object.fromEntries(LEGACY_PART_IDS.map(id => [id, value[id] ?? 0]));
}

function normalizeNssLoadout(value) {
  if (value === null) return null;
  if (!hasExactKeys(value, ['schemaVersion', 'interfaceId', 'combination', 'affinities'])) {
    invalid('Invalid NSS loadout keys.');
  }
  if (value.schemaVersion !== 2 || value.interfaceId !== 'NSS-V1') invalid('Unsupported NSS loadout version.');
  if (!hasExactKeys(value.combination, NSS_FAMILIES)) invalid('Invalid NSS combination keys.');
  if (!hasExactKeys(value.affinities, NSS_FAMILIES)) invalid('Invalid NSS affinity keys.');
  const combination = {};
  const affinities = {};
  for (const family of NSS_FAMILIES) {
    const partId = value.combination[family];
    if (typeof partId !== 'string' || nssPartFamily.get(partId) !== family) {
      invalid(`Invalid NSS ${family} part.`);
    }
    if (!AFFINITIES.has(value.affinities[family])) invalid(`Invalid NSS ${family} affinity.`);
    combination[family] = partId;
    affinities[family] = value.affinities[family];
  }
  return { schemaVersion: 2, interfaceId: 'NSS-V1', combination, affinities };
}

function normalizeUnlockedParts(value) {
  if (!Array.isArray(value)) invalid('Unlocked parts must be an array.');
  const unlocked = new Set();
  for (const id of value) {
    if (typeof id !== 'string' || !LEGACY_PART_IDS.includes(id)) invalid(`Unknown unlocked part: ${id}.`);
    unlocked.add(id);
  }
  return [...unlocked].sort();
}

function normalizeSnapshot(value) {
  const keys = [
    'saveSchemaVersion',
    'unlockedParts',
    'ladderIndex',
    'bestLadder',
    'championshipCount',
    'build',
    'upgrades',
    'partUpgrades',
    'latestNssLoadout',
  ];
  if (!hasExactKeys(value, keys)) invalid('Progression snapshot contains invalid keys.');
  if (value.saveSchemaVersion !== 2) invalid('Unsupported progression save version.');
  return {
    saveSchemaVersion: 2,
    unlockedParts: normalizeUnlockedParts(value.unlockedParts),
    ladderIndex: boundedInteger(value.ladderIndex, 0, MAX_LADDER_INDEX, 'Ladder index'),
    bestLadder: boundedInteger(value.bestLadder, 0, MAX_LADDER_INDEX, 'Best ladder'),
    championshipCount: boundedInteger(value.championshipCount, 0, MAX_CHAMPIONSHIP_COUNT, 'Championship count'),
    build: normalizeBuild(value.build),
    upgrades: normalizeUpgrades(value.upgrades),
    partUpgrades: normalizePartUpgrades(value.partUpgrades),
    latestNssLoadout: normalizeNssLoadout(value.latestNssLoadout),
  };
}

function normalizeWalletEvent(value) {
  if (!hasExactKeys(value, ['eventId', 'kind', 'delta', 'source', 'createdAt'])) {
    invalid('Wallet event contains invalid keys.');
  }
  if (typeof value.eventId !== 'string' || !UUID_V4.test(value.eventId)) invalid('Wallet event ID must be a UUID v4.');
  if (value.kind !== 'credit' && value.kind !== 'debit') invalid('Wallet event kind is invalid.');
  boundedInteger(value.delta, -MAX_WALLET_DELTA, MAX_WALLET_DELTA, 'Wallet delta');
  if (value.delta === 0 || (value.kind === 'credit' && value.delta < 0) || (value.kind === 'debit' && value.delta > 0)) {
    invalid('Wallet event delta does not match its kind.');
  }
  if (value.source !== 'local_progression') invalid('Wallet event source is invalid.');
  if (typeof value.createdAt !== 'string'
    || value.createdAt.length > 40
    || !value.createdAt.endsWith('Z')
    || !Number.isFinite(Date.parse(value.createdAt))) {
    invalid('Wallet event time must be an ISO-8601 UTC timestamp.');
  }
  return {
    eventId: value.eventId.toLowerCase(),
    kind: value.kind,
    delta: value.delta,
    source: value.source,
    createdAt: new Date(value.createdAt).toISOString(),
  };
}

export function createDefaultProgressionSnapshot() {
  return {
    saveSchemaVersion: 2,
    unlockedParts: [...DEFAULT_UNLOCKS],
    ladderIndex: 0,
    bestLadder: 0,
    championshipCount: 0,
    build: { ...DEFAULT_BUILD },
    upgrades: { attack: 0, defense: 0, stamina: 0 },
    partUpgrades: Object.fromEntries(LEGACY_PART_IDS.map(id => [id, 0])),
    latestNssLoadout: null,
  };
}

export function validateProgressionSyncInput(value) {
  if (!hasExactKeys(value, ['schemaVersion', 'snapshot', 'initialCoins', 'walletEvents'])) {
    invalid('Progression sync request contains invalid keys.');
  }
  if (value.schemaVersion !== 1) invalid('Unsupported progression sync version.');
  if (!Array.isArray(value.walletEvents)) invalid('Wallet events must be an array.');
  if (value.walletEvents.length > MAX_WALLET_EVENTS) {
    throw new ProgressionError(400, 'TOO_MANY_WALLET_EVENTS', `A sync request may contain at most ${MAX_WALLET_EVENTS} wallet events.`);
  }
  const walletEvents = value.walletEvents.map(normalizeWalletEvent);
  if (new Set(walletEvents.map(event => event.eventId)).size !== walletEvents.length) {
    throw new ProgressionError(400, 'DUPLICATE_EVENT_ID', 'A sync request contains duplicate wallet event IDs.');
  }
  return {
    schemaVersion: 1,
    snapshot: normalizeSnapshot(value.snapshot),
    initialCoins: boundedInteger(value.initialCoins, 0, MAX_INITIAL_COINS, 'Initial coins'),
    walletEvents,
  };
}

export function mergeProgressionSnapshots(serverValue, localValue) {
  const server = normalizeSnapshot(serverValue);
  const local = normalizeSnapshot(localValue);
  return {
    saveSchemaVersion: 2,
    unlockedParts: [...new Set([...server.unlockedParts, ...local.unlockedParts])].sort(),
    ladderIndex: local.ladderIndex,
    bestLadder: Math.max(server.bestLadder, local.bestLadder),
    championshipCount: Math.max(server.championshipCount, local.championshipCount),
    build: { ...local.build },
    upgrades: Object.fromEntries(UPGRADE_KEYS.map(key => [key, Math.max(server.upgrades[key], local.upgrades[key])])),
    partUpgrades: Object.fromEntries(LEGACY_PART_IDS.map(id => [
      id,
      Math.max(server.partUpgrades[id], local.partUpgrades[id]),
    ])),
    latestNssLoadout: local.latestNssLoadout === null
      ? null
      : {
          ...local.latestNssLoadout,
          combination: { ...local.latestNssLoadout.combination },
          affinities: { ...local.latestNssLoadout.affinities },
        },
  };
}

function progressionFromRow(row) {
  if (!row) {
    return {
      schemaVersion: 1,
      revision: 0,
      coins: 0,
      snapshot: createDefaultProgressionSnapshot(),
    };
  }
  return {
    schemaVersion: 1,
    revision: row.revision,
    coins: row.coins,
    snapshot: normalizeSnapshot(JSON.parse(row.snapshot_json)),
  };
}

function readProgression(database, playerId) {
  return progressionFromRow(database.prepare(`
    SELECT snapshot_json, coins, revision
    FROM player_progression
    WHERE player_id = ?
  `).get(playerId));
}

export function syncProgression(database, playerId, value) {
  const input = validateProgressionSyncInput(value);
  database.exec('BEGIN IMMEDIATE');
  try {
    let row = database.prepare(`
      SELECT snapshot_json, coins, initial_coins_imported, revision
      FROM player_progression
      WHERE player_id = ?
    `).get(playerId);
    if (!row) {
      database.prepare(`
        INSERT INTO player_progression (player_id, snapshot_json)
        VALUES (?, ?)
      `).run(playerId, JSON.stringify(createDefaultProgressionSnapshot()));
      row = {
        snapshot_json: JSON.stringify(createDefaultProgressionSnapshot()),
        coins: 0,
        initial_coins_imported: 0,
        revision: 0,
      };
    }

    let coins = row.coins;
    let initialCoinsImported = row.initial_coins_imported;
    let changed = false;
    if (initialCoinsImported === 0) {
      coins = input.initialCoins;
      initialCoinsImported = 1;
      changed = true;
    }

    const acknowledgedEventIds = [];
    const findEvent = database.prepare(`
      SELECT 1 FROM wallet_events WHERE player_id = ? AND event_id = ?
    `);
    const insertEvent = database.prepare(`
      INSERT INTO wallet_events (player_id, event_id, kind, delta, metadata_json)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const event of input.walletEvents) {
      if (findEvent.get(playerId, event.eventId)) {
        acknowledgedEventIds.push(event.eventId);
        continue;
      }
      const nextCoins = coins + event.delta;
      if (nextCoins < 0) {
        throw new ProgressionError(409, 'INSUFFICIENT_COINS', 'Coin balance would become negative.', {
          rejectedEventId: event.eventId,
        });
      }
      insertEvent.run(
        playerId,
        event.eventId,
        event.kind,
        event.delta,
        JSON.stringify({ source: event.source, createdAt: event.createdAt }),
      );
      coins = nextCoins;
      changed = true;
      acknowledgedEventIds.push(event.eventId);
    }

    const storedSnapshot = normalizeSnapshot(JSON.parse(row.snapshot_json));
    const mergedSnapshot = mergeProgressionSnapshots(storedSnapshot, input.snapshot);
    const snapshotJson = JSON.stringify(mergedSnapshot);
    if (snapshotJson !== JSON.stringify(storedSnapshot)) changed = true;

    const revision = changed ? row.revision + 1 : row.revision;
    if (changed) {
      database.prepare(`
        UPDATE player_progression
        SET snapshot_json = ?, coins = ?, initial_coins_imported = ?, revision = ?,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE player_id = ?
      `).run(snapshotJson, coins, initialCoinsImported, revision, playerId);
    }
    database.exec('COMMIT');
    return {
      progression: {
        schemaVersion: 1,
        revision,
        coins,
        snapshot: mergedSnapshot,
      },
      acknowledgedEventIds,
    };
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // Preserve the original transaction error.
    }
    if (error instanceof ProgressionError && error.code === 'INSUFFICIENT_COINS') {
      throw new ProgressionError(409, error.code, error.message, {
        rejectedEventId: error.details.rejectedEventId,
        progression: readProgression(database, playerId),
      });
    }
    throw error;
  }
}
