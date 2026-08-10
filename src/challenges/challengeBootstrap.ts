import versions from '../../battle-top-designer/shared/nss/versions.json';
import type { UpgradeLevels } from '../app/progression';
import { loadLocalIdentity, type LocalIdentity } from '../auth/localIdentity';
import { NSS_BATTLE_CATALOG_SHA256 } from '../nss/battleCatalog';
import { isNssBattleLoadoutV2 } from '../nss/loadout';
import type { NssBattleLoadoutV2 } from '../nss/types';
import { parseBattleSeed, type BattleSeed } from '../sim/battleSeed';
import { ChallengeApiError, createChallengeClient, type ChallengeClient } from './challengeClient';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const INPUT_KEYS = ['challengeSchemaVersion', 'catalogVersion', 'catalogSha256', 'affinityRulesVersion', 'battleRulesVersion', 'simulationVersion', 'offerId', 'parentChallengeId', 'seed', 'mode', 'arena', 'aiConfig', 'player', 'enemy'];
const PARTICIPANT_KEYS = ['playerId', 'displayName', 'loadout', 'upgrades'];
const UPGRADE_SNAPSHOT_KEYS = ['upgrades', 'partUpgrades'];
const SYSTEM_UPGRADE_KEYS = ['attack', 'defense', 'stamina'];
const PART_UPGRADE_KEYS = ['balanced', 'bulwark', 'drift', 'grip', 'heavy', 'light', 'round', 'rush', 'slash'];

type RecordValue = Record<string, unknown>;

export interface GameChallengeParticipant {
  playerId: string;
  displayName: string;
  loadout: NssBattleLoadoutV2;
  upgrades: UpgradeLevels;
}

export interface GameChallengeOptions {
  id: string;
  mode: 'fair' | 'full_power';
  arena: 'classic_grid' | 'neon_magma' | 'absolute_zero';
  seed: BattleSeed;
  player: GameChallengeParticipant;
  enemy: GameChallengeParticipant;
  identity: LocalIdentity;
  client: ChallengeClient;
}

export type ChallengeBootstrapResult =
  | { kind: 'ready'; options: GameChallengeOptions }
  | { kind: 'invalid_link' | 'missing_identity' | 'forbidden' | 'completed' | 'unsupported' | 'offline' };

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: unknown, keys: string[]): value is RecordValue {
  return isRecord(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

function invalid(message = 'Invalid challenge input'): never {
  throw new Error(message);
}

function participant(value: unknown): GameChallengeParticipant {
  if (!hasExactKeys(value, PARTICIPANT_KEYS)
    || typeof value.playerId !== 'string' || !UUID_V4.test(value.playerId)
    || typeof value.displayName !== 'string' || value.displayName.length < 1 || value.displayName.length > 32
    || !isNssBattleLoadoutV2(value.loadout)
    || !hasExactKeys(value.upgrades, UPGRADE_SNAPSHOT_KEYS)
    || !hasExactKeys(value.upgrades.upgrades, SYSTEM_UPGRADE_KEYS)
    || !hasExactKeys(value.upgrades.partUpgrades, PART_UPGRADE_KEYS)) invalid();
  const system = value.upgrades.upgrades;
  const parts = value.upgrades.partUpgrades;
  if (SYSTEM_UPGRADE_KEYS.some(key => !Number.isSafeInteger(system[key]) || (system[key] as number) < 0 || (system[key] as number) > 5)
    || PART_UPGRADE_KEYS.some(key => !Number.isSafeInteger(parts[key]) || (parts[key] as number) < 0 || (parts[key] as number) > 4)) invalid();
  return {
    playerId: value.playerId,
    displayName: value.displayName,
    loadout: value.loadout,
    upgrades: { attack: system.attack as number, defense: system.defense as number, stamina: system.stamina as number },
  };
}

export function parseGameChallengeInput(id: string, value: unknown): Omit<GameChallengeOptions, 'identity' | 'client'> {
  if (!UUID_V4.test(id) || !hasExactKeys(value, INPUT_KEYS)) invalid();
  if (value.challengeSchemaVersion !== versions.challengeSchemaVersion
    || value.catalogVersion !== versions.catalogVersion
    || value.catalogSha256 !== NSS_BATTLE_CATALOG_SHA256
    || value.affinityRulesVersion !== versions.affinityRulesVersion
    || value.battleRulesVersion !== versions.battleRulesVersion
    || value.simulationVersion !== versions.simulationVersion) invalid('Unsupported challenge version');
  if ((value.mode !== 'fair' && value.mode !== 'full_power')
    || !['classic_grid', 'neon_magma', 'absolute_zero'].includes(String(value.arena))
    || value.aiConfig !== 'deterministic-v1') invalid();
  const player = participant(value.player);
  const enemy = participant(value.enemy);
  if (value.mode === 'fair' && [...Object.values(player.upgrades), ...Object.values(enemy.upgrades)].some(level => level !== 0)) invalid();
  return {
    id,
    mode: value.mode,
    arena: value.arena as GameChallengeOptions['arena'],
    seed: parseBattleSeed(String(value.seed)),
    player,
    enemy,
  };
}

function challengeIdFromSearch(search: string) {
  const parameters = new URLSearchParams(search);
  const ids = parameters.getAll('challenge');
  return [...parameters.keys()].every(key => key === 'challenge') && ids.length === 1 && UUID_V4.test(ids[0]) ? ids[0] : null;
}

export async function bootstrapChallenge(
  search: string,
  dependencies: {
    loadIdentity?: () => LocalIdentity | null;
    createClient?: (identity: LocalIdentity) => ChallengeClient;
  } = {},
): Promise<ChallengeBootstrapResult> {
  const id = challengeIdFromSearch(search);
  if (!id) return { kind: 'invalid_link' };
  const identity = (dependencies.loadIdentity ?? (() => loadLocalIdentity()))();
  if (!identity) return { kind: 'missing_identity' };
  const client = (dependencies.createClient ?? ((value) => createChallengeClient(value)))(identity);
  try {
    const challenge = await client.getChallenge(id);
    if (challenge.status === 'completed') return { kind: 'completed' };
    if (!challenge.actions.canBattle || challenge.recipientPlayerId !== identity.playerId) return { kind: 'forbidden' };
    return { kind: 'ready', options: { ...parseGameChallengeInput(id, challenge.input), identity, client } };
  } catch (error) {
    if (error instanceof Error && error.message === 'Unsupported challenge version') return { kind: 'unsupported' };
    if (error instanceof ChallengeApiError && error.code === 'UNSUPPORTED_CHALLENGE_VERSION') return { kind: 'unsupported' };
    if (error instanceof ChallengeApiError && (error.status === 401 || error.status === 403 || error.status === 404)) return { kind: 'forbidden' };
    return { kind: 'offline' };
  }
}
