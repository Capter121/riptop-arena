import type { LocalIdentity } from '../auth/localIdentity';
import { CAMPAIGN_AI_PROFILE_WEIGHTS, CAMPAIGN_OPPONENT_BY_ID, type CampaignOpponent } from '../data/campaign/opponents';
import { isNssBattleLoadoutV2 } from '../nss/loadout';
import { parseServerProgression, type ServerProgressionV1 } from '../progression/progressionClient';
import type { CampaignOutcome } from '../data/campaign/campaignRules';

type FetchOptions = { baseUrl?: string; fetchImpl?: typeof fetch };
type JsonRecord = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEED = /^[0-9a-f]{32}$/;
const FINISHES = ['ring out', 'spin finish', 'burst finish', 'timeout'];

export type CampaignArchiveOpponent = CampaignOpponent & {
  unlocked: boolean;
  starsMask: number;
  defeated: boolean;
  attemptCount: number;
  bestOutcome: CampaignOutcome | null;
};

export interface CampaignArchive {
  configVersion: 'campaign-v1';
  aiProfiles: typeof CAMPAIGN_AI_PROFILE_WEIGHTS;
  opponents: CampaignArchiveOpponent[];
  totalStars: number;
  nextOpponentId: string;
  championshipCount: number;
}

export interface CampaignAttempt {
  attemptId: string;
  configVersion: 'campaign-v1';
  simulationVersion: 1;
  seed: string;
  loadoutIndex: number;
  arena: 'classic_grid' | 'neon_magma' | 'absolute_zero';
  aiProfileId: string;
  opponent: { id: string; index: number; name: string; theme: string; tutorial: string };
  objectives: CampaignOpponent['objectives'];
  player: { playerId: string; displayName: string; loadout: ReturnType<typeof requireNssLoadout>; upgrades: UpgradeLevels; maxIntegrity: number };
  enemy: { displayName: string; loadout: ReturnType<typeof requireNssLoadout>; upgrades: UpgradeLevels };
  startedAt: string;
}

type UpgradeLevels = { attack: number; defense: number; stamina: number };

export interface CampaignSettlement {
  attemptId: string;
  opponentId: string;
  earnedStarsMask: number;
  newStarsMask: number;
  rewards: {
    battleCoins: number;
    firstWinCoins: number;
    starCoins: number;
    partUnlocked: string | null;
    partConversionCoins: number;
    championshipCrowns: number;
  };
  rewardEvents: Array<{ eventId: string; logicalKey: string; amount: number; kind: string }>;
  progression: ServerProgressionV1;
  progress: CampaignArchive;
  completedAt: string;
}

export class CampaignApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'CampaignApiError';
    this.status = status;
    this.code = code;
  }
}

function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exact(value: unknown, keys: readonly string[]): value is JsonRecord {
  return record(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

function invalid(status = 0): never {
  throw new CampaignApiError(status, 'INVALID_RESPONSE', 'Server returned invalid campaign data.');
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (record(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function integer(value: unknown, minimum: number, maximum: number) {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function isoDate(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function parseTopState(value: unknown) {
  if (!exact(value, ['spin', 'integrity', 'stamina', 'spirit', 'burst', 'tilt', 'alive'])
    || typeof value.alive !== 'boolean'
    || ['spin', 'integrity', 'stamina', 'spirit', 'burst', 'tilt'].some(key => !Number.isFinite(value[key]))) invalid();
  return value;
}

export function isCampaignOutcome(value: unknown): value is CampaignOutcome & { simulationVersion: 1; seed: string; enemy: JsonRecord } {
  if (!exact(value, ['simulationVersion', 'seed', 'winner', 'kind', 'turnCount', 'tickCount', 'player', 'enemy'])
    || value.simulationVersion !== 1
    || typeof value.seed !== 'string' || !SEED.test(value.seed)
    || (value.winner !== 'player' && value.winner !== 'enemy')
    || !FINISHES.includes(String(value.kind))
    || !integer(value.turnCount, 0, 256)
    || !integer(value.tickCount, 0, 360_000)) return false;
  try { parseTopState(value.player); parseTopState(value.enemy); } catch { return false; }
  return true;
}

function parseOutcome(value: unknown): CampaignOutcome | null {
  if (value === null) return null;
  if (!isCampaignOutcome(value)) invalid();
  return value;
}

function parseArchiveOpponent(value: unknown, index: number): CampaignArchiveOpponent {
  const runtimeKeys = ['unlocked', 'starsMask', 'defeated', 'attemptCount', 'bestOutcome'];
  const staticKeys = ['index', 'id', 'name', 'theme', 'description', 'tutorial', 'coreAffinity', 'upgrades', 'aiProfileId', 'arenas', 'objectives', 'rewards', 'loadouts'];
  if (!exact(value, [...staticKeys, ...runtimeKeys]) || typeof value.id !== 'string') invalid();
  const expected = CAMPAIGN_OPPONENT_BY_ID.get(value.id);
  if (!expected || expected.index !== index) invalid();
  const staticValue = Object.fromEntries(staticKeys.map(key => [key, value[key]]));
  if (stable(staticValue) !== stable(expected)) invalid();
  if (typeof value.unlocked !== 'boolean' || typeof value.defeated !== 'boolean'
    || !integer(value.starsMask, 0, 7) || !integer(value.attemptCount, 0, Number.MAX_SAFE_INTEGER)) invalid();
  return { ...expected, unlocked: value.unlocked, starsMask: value.starsMask as number, defeated: value.defeated, attemptCount: value.attemptCount as number, bestOutcome: parseOutcome(value.bestOutcome) };
}

function parseArchive(value: unknown): CampaignArchive {
  if (!exact(value, ['configVersion', 'aiProfiles', 'opponents', 'totalStars', 'nextOpponentId', 'championshipCount'])
    || value.configVersion !== 'campaign-v1'
    || stable(value.aiProfiles) !== stable(CAMPAIGN_AI_PROFILE_WEIGHTS)
    || !Array.isArray(value.opponents) || value.opponents.length !== 8
    || !integer(value.totalStars, 0, 24)
    || typeof value.nextOpponentId !== 'string' || !CAMPAIGN_OPPONENT_BY_ID.has(value.nextOpponentId)
    || !integer(value.championshipCount, 0, 1_000_000)) invalid();
  return {
    configVersion: 'campaign-v1',
    aiProfiles: CAMPAIGN_AI_PROFILE_WEIGHTS,
    opponents: value.opponents.map(parseArchiveOpponent),
    totalStars: value.totalStars as number,
    nextOpponentId: value.nextOpponentId,
    championshipCount: value.championshipCount as number,
  };
}

function requireNssLoadout(value: unknown) {
  if (!isNssBattleLoadoutV2(value)) invalid();
  return value;
}

function parseUpgrades(value: unknown): UpgradeLevels {
  if (!exact(value, ['attack', 'defense', 'stamina'])
    || !['attack', 'defense', 'stamina'].every(key => integer(value[key], 0, 5))) invalid();
  return value as UpgradeLevels;
}

function parseAttempt(value: unknown, playerId: string): CampaignAttempt {
  const keys = ['attemptId', 'configVersion', 'simulationVersion', 'seed', 'loadoutIndex', 'arena', 'aiProfileId', 'opponent', 'objectives', 'player', 'enemy', 'startedAt'];
  if (!exact(value, keys)) invalid();
  if (typeof value.attemptId !== 'string' || !UUID.test(value.attemptId)
    || value.configVersion !== 'campaign-v1' || value.simulationVersion !== 1
    || typeof value.seed !== 'string' || !SEED.test(value.seed)
    || !integer(value.loadoutIndex, 0, 2)
    || !['classic_grid', 'neon_magma', 'absolute_zero'].includes(String(value.arena))
    || typeof value.aiProfileId !== 'string' || !isoDate(value.startedAt)) invalid();
  if (!exact(value.opponent, ['id', 'index', 'name', 'theme', 'tutorial'])
    || typeof value.opponent.id !== 'string') invalid();
  if (!exact(value.player, ['playerId', 'displayName', 'loadout', 'upgrades', 'maxIntegrity'])
    || value.player.playerId !== playerId || typeof value.player.displayName !== 'string'
    || !Number.isFinite(value.player.maxIntegrity) || Number(value.player.maxIntegrity) <= 0) invalid();
  if (!exact(value.enemy, ['displayName', 'loadout', 'upgrades']) || typeof value.enemy.displayName !== 'string') invalid();
  const opponent = CAMPAIGN_OPPONENT_BY_ID.get(value.opponent.id);
  if (!opponent || stable(value.opponent) !== stable({ id: opponent.id, index: opponent.index, name: opponent.name, theme: opponent.theme, tutorial: opponent.tutorial })
    || stable(value.objectives) !== stable(opponent.objectives)
    || value.aiProfileId !== opponent.aiProfileId
    || !opponent.arenas.includes(value.arena as never)
    || Number(value.loadoutIndex) >= opponent.loadouts.length) invalid();
  return {
    ...value,
    loadoutIndex: value.loadoutIndex as number,
    arena: value.arena as CampaignAttempt['arena'],
    player: { ...value.player, loadout: requireNssLoadout(value.player.loadout), upgrades: parseUpgrades(value.player.upgrades), maxIntegrity: value.player.maxIntegrity as number } as CampaignAttempt['player'],
    enemy: { ...value.enemy, loadout: requireNssLoadout(value.enemy.loadout), upgrades: parseUpgrades(value.enemy.upgrades) } as CampaignAttempt['enemy'],
  } as CampaignAttempt;
}

function parseSettlement(value: unknown): CampaignSettlement {
  if (!exact(value, ['attemptId', 'opponentId', 'earnedStarsMask', 'newStarsMask', 'rewards', 'rewardEvents', 'progression', 'progress', 'completedAt'])
    || typeof value.attemptId !== 'string' || !UUID.test(value.attemptId)
    || typeof value.opponentId !== 'string' || !CAMPAIGN_OPPONENT_BY_ID.has(value.opponentId)
    || !integer(value.earnedStarsMask, 0, 7) || !integer(value.newStarsMask, 0, 7)
    || !exact(value.rewards, ['battleCoins', 'firstWinCoins', 'starCoins', 'partUnlocked', 'partConversionCoins', 'championshipCrowns'])
    || !Array.isArray(value.rewardEvents)
    || typeof value.completedAt !== 'string' || !isoDate(value.completedAt)) invalid();
  const rewards = value.rewards;
  if (!['battleCoins', 'firstWinCoins', 'starCoins', 'partConversionCoins', 'championshipCrowns'].every(key => integer(rewards[key], 0, 10_000))
    || !(rewards.partUnlocked === null || typeof rewards.partUnlocked === 'string')) invalid();
  const rewardEvents = value.rewardEvents.map((event) => {
    if (!exact(event, ['eventId', 'logicalKey', 'amount', 'kind'])
      || typeof event.eventId !== 'string' || !UUID.test(event.eventId)
      || typeof event.logicalKey !== 'string' || typeof event.kind !== 'string'
      || !integer(event.amount, 1, 10_000)) invalid();
    return event as unknown as CampaignSettlement['rewardEvents'][number];
  });
  return {
    attemptId: value.attemptId,
    opponentId: value.opponentId,
    earnedStarsMask: value.earnedStarsMask as number,
    newStarsMask: value.newStarsMask as number,
    rewards: rewards as unknown as CampaignSettlement['rewards'],
    rewardEvents,
    progression: parseServerProgression(value.progression),
    progress: parseArchive(value.progress),
    completedAt: value.completedAt,
  };
}

function endpoint(baseUrl: string | undefined, path: string) {
  return baseUrl ? `${baseUrl.replace(/\/+$/, '')}${path}` : path;
}

export function createCampaignClient(identity: LocalIdentity, options: FetchOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const authHeaders = { Authorization: `Bearer ${identity.deviceToken}`, 'X-Player-Id': identity.playerId };
  async function request(path: string, init: RequestInit = {}) {
    const response = await fetchImpl(endpoint(options.baseUrl, path), { ...init, headers: { ...authHeaders, ...init.headers } });
    let body: unknown;
    try { body = await response.json(); } catch { invalid(response.status); }
    if (!response.ok) {
      const error = record(body) && record(body.error) ? body.error : null;
      throw new CampaignApiError(response.status, typeof error?.code === 'string' ? error.code : 'REQUEST_FAILED', typeof error?.message === 'string' ? error.message : 'Campaign request failed.');
    }
    return body;
  }
  const post = (path: string, body: unknown) => request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return {
    async getArchive() { return parseArchive(await request('/api/campaign')); },
    async startAttempt(input: { requestId: string; opponentId: string }) { return parseAttempt(await post('/api/campaign/attempts', input), identity.playerId); },
    async submitResult(id: string, input: { requestId: string; outcome: unknown }) { return parseSettlement(await post(`/api/campaign/attempts/${id}/result`, input)); },
  };
}

export type CampaignClient = ReturnType<typeof createCampaignClient>;
