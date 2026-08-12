import type { LocalIdentity } from '../auth/localIdentity';
import { CAMPAIGN_OPPONENT_BY_ID } from '../data/campaign/opponents';
import type { CampaignAiProfileId, CampaignArena } from '../data/campaign/opponents';
import { isNssBattleLoadoutV2 } from '../nss/loadout';
import type { NssBattleLoadoutV2 } from '../nss/types';
import { parseServerProgression, type ServerProgressionV1 } from '../progression/progressionClient';

type FetchOptions = { baseUrl?: string; fetchImpl?: typeof fetch };
type JsonRecord = Record<string, unknown>;
type UpgradeLevels = { attack: number; defense: number; stamina: number };
export type SurvivalReward =
  | { kind: 'growth'; id: 'attack-calibration' | 'coordination' | 'affinity-tuning' | 'pickup-tuning'; level: number }
  | { kind: 'instant'; id: 'emergency-repair' | 'burst-vent' | 'temporary-overdrive' | 'temporary-bulwark' | 'temporary-endurance' }
  | { kind: 'risk'; id: 'risk-contract'; level: number };
export type SurvivalResultRequest = {
  requestId: string;
  configVersion: 'survival-v1';
  simulationVersion: 1;
  battleRulesVersion: 2;
  wave: number;
  outcome: Record<string, unknown>;
};

export type SurvivalGrowthLevels = {
  'attack-calibration': number;
  coordination: number;
  'affinity-tuning': number;
  'pickup-tuning': number;
};

export interface SurvivalWave {
  configVersion: 'survival-v1';
  simulationVersion: 1;
  seed: string;
  wave: number;
  chapter: number;
  type: 'normal' | 'elite' | 'boss';
  sourceOpponentId: string;
  sourceLoadoutIndex: number;
  enemy: NssBattleLoadoutV2;
  arena: CampaignArena;
  aiProfileId: CampaignAiProfileId;
  riskLevel: number;
  strengthMultiplier: number;
}

export interface SurvivalCheckpoint {
  currentWave: number;
  integrity: number;
  burstRisk: number;
  persistentDebuffs: string[];
  growthLevels: SurvivalGrowthLevels;
  nextWaveEffect: 'temporary-overdrive' | 'temporary-bulwark' | 'temporary-endurance' | null;
  riskLevel: number;
  score: number;
  flawlessStreak: number;
  bossesDefeated: number;
}

export interface SurvivalRun {
  runId: string;
  configVersion: 'survival-v1';
  simulationVersion: 1;
  battleRulesVersion: 2;
  seed: string;
  status: 'wave_ready' | 'reward_pending' | 'completed';
  player: { playerId: string; displayName: string; loadout: NssBattleLoadoutV2; upgrades: UpgradeLevels; maximumIntegrity: number };
  wave: SurvivalWave;
  checkpoint: SurvivalCheckpoint;
  finalSummary: SurvivalFinalSummary | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface SurvivalFinalSummary {
  score: number;
  highestCompletedWave: number;
  bossesDefeated: number;
  finalIntegrity: number;
  riskLevel: number;
  achievedAt: string;
  abandoned: boolean;
}

export interface SurvivalSettlement {
  run: SurvivalRun;
  score: { base: number; waveTypeBonus: number; finishBonus: number; flawlessBonus: number; flawlessStreakBonus: number; subtotal: number; riskMultiplier: number; score: number };
  rewardOptions: SurvivalReward[];
  milestone: { wave: number; coins: number; eventId: string } | null;
  progression: ServerProgressionV1;
}

export class SurvivalApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'SurvivalApiError';
    this.status = status;
    this.code = code;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEED = /^[0-9a-f]{32}$/;
const ARENAS = ['classic_grid', 'neon_magma', 'absolute_zero'];
const AI_PROFILES = ['assault', 'skirmisher', 'control', 'sustain', 'ringout', 'counter', 'mixup', 'fortress'];
const GROWTH_IDS = ['attack-calibration', 'coordination', 'affinity-tuning', 'pickup-tuning'] as const;
const INSTANT_IDS = ['emergency-repair', 'burst-vent', 'temporary-overdrive', 'temporary-bulwark', 'temporary-endurance'] as const;
const EFFECT_IDS = ['temporary-overdrive', 'temporary-bulwark', 'temporary-endurance'];

function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exact(value: unknown, keys: readonly string[]): value is JsonRecord {
  return record(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

function invalid(status = 0): never {
  throw new SurvivalApiError(status, 'INVALID_RESPONSE', 'Server returned invalid survival data.');
}

function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function finite(value: unknown, minimum = 0) {
  return Number.isFinite(value) && Number(value) >= minimum;
}

function isoDate(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function parseLoadout(value: unknown) {
  if (!isNssBattleLoadoutV2(value)) invalid();
  return value;
}

function parseUpgrades(value: unknown): UpgradeLevels {
  if (!exact(value, ['attack', 'defense', 'stamina']) || !['attack', 'defense', 'stamina'].every(key => value[key] === 0)) invalid();
  return value as UpgradeLevels;
}

function parseSummary(value: unknown, includeAbandoned: boolean) {
  const keys = ['score', 'highestCompletedWave', 'bossesDefeated', 'finalIntegrity', 'riskLevel', 'achievedAt', ...(includeAbandoned ? ['abandoned'] : [])];
  if (!exact(value, keys)
    || !integer(value.score, 0) || !integer(value.highestCompletedWave, 0) || !integer(value.bossesDefeated, 0)
    || !finite(value.finalIntegrity) || !integer(value.riskLevel, 0, 3) || !isoDate(value.achievedAt)
    || (includeAbandoned && typeof value.abandoned !== 'boolean')) invalid();
  return value;
}

function parseWave(value: unknown) {
  if (!exact(value, ['configVersion', 'simulationVersion', 'seed', 'wave', 'chapter', 'type', 'sourceOpponentId', 'sourceLoadoutIndex', 'enemy', 'arena', 'aiProfileId', 'riskLevel', 'strengthMultiplier'])
    || value.configVersion !== 'survival-v1' || value.simulationVersion !== 1
    || typeof value.seed !== 'string' || !SEED.test(value.seed)
    || !integer(value.wave, 1) || !integer(value.chapter, 1)
    || !['normal', 'elite', 'boss'].includes(String(value.type))
    || typeof value.sourceOpponentId !== 'string' || !integer(value.sourceLoadoutIndex, 0, 2)
    || !ARENAS.includes(String(value.arena)) || !AI_PROFILES.includes(String(value.aiProfileId))
    || !integer(value.riskLevel, 0, 3) || !finite(value.strengthMultiplier, 1)) invalid();
  const opponent = CAMPAIGN_OPPONENT_BY_ID.get(value.sourceOpponentId);
  if (!opponent || Number(value.sourceLoadoutIndex) >= opponent.loadouts.length) invalid();
  parseLoadout(value.enemy);
  return value as unknown as SurvivalWave;
}

function parseCheckpoint(value: unknown) {
  if (!exact(value, ['currentWave', 'integrity', 'burstRisk', 'persistentDebuffs', 'growthLevels', 'nextWaveEffect', 'riskLevel', 'score', 'flawlessStreak', 'bossesDefeated'])
    || !integer(value.currentWave, 1) || !finite(value.integrity) || !finite(value.burstRisk)
    || !Array.isArray(value.persistentDebuffs) || value.persistentDebuffs.some(item => typeof item !== 'string' || item.length === 0)
    || new Set(value.persistentDebuffs).size !== value.persistentDebuffs.length
    || !exact(value.growthLevels, GROWTH_IDS)
    || !(value.nextWaveEffect === null || EFFECT_IDS.includes(String(value.nextWaveEffect)))
    || !integer(value.riskLevel, 0, 3) || !integer(value.score, 0)
    || !integer(value.flawlessStreak, 0) || !integer(value.bossesDefeated, 0)) invalid();
  const growthLevels = value.growthLevels as JsonRecord;
  if (GROWTH_IDS.some(id => !integer(growthLevels[id], 0, 3))) invalid();
  return value as unknown as SurvivalCheckpoint;
}

function parseRun(value: unknown, playerId: string): SurvivalRun {
  if (!exact(value, ['runId', 'configVersion', 'simulationVersion', 'battleRulesVersion', 'seed', 'status', 'player', 'wave', 'checkpoint', 'finalSummary', 'createdAt', 'updatedAt', 'completedAt'])
    || typeof value.runId !== 'string' || !UUID.test(value.runId)
    || value.configVersion !== 'survival-v1' || value.simulationVersion !== 1 || value.battleRulesVersion !== 2
    || typeof value.seed !== 'string' || !SEED.test(value.seed)
    || !['wave_ready', 'reward_pending', 'completed'].includes(String(value.status))
    || !exact(value.player, ['playerId', 'displayName', 'loadout', 'upgrades', 'maximumIntegrity'])
    || value.player.playerId !== playerId || typeof value.player.displayName !== 'string' || !finite(value.player.maximumIntegrity, Number.MIN_VALUE)
    || !isoDate(value.createdAt) || !isoDate(value.updatedAt)
    || !(value.completedAt === null || isoDate(value.completedAt))) invalid();
  parseLoadout(value.player.loadout);
  parseUpgrades(value.player.upgrades);
  const wave = parseWave(value.wave);
  const checkpoint = parseCheckpoint(value.checkpoint);
  if (wave.wave !== checkpoint.currentWave || wave.riskLevel !== checkpoint.riskLevel) invalid();
  const completed = value.status === 'completed';
  if (completed !== (value.finalSummary !== null) || completed !== (value.completedAt !== null)) invalid();
  if (value.finalSummary !== null) parseSummary(value.finalSummary, true);
  return value as unknown as SurvivalRun;
}

function parseReward(value: unknown): SurvivalReward {
  if (!record(value) || typeof value.kind !== 'string') invalid();
  if (value.kind === 'growth' && exact(value, ['kind', 'id', 'level']) && GROWTH_IDS.includes(value.id as never) && integer(value.level, 1, 3)) return value as unknown as SurvivalReward;
  if (value.kind === 'risk' && exact(value, ['kind', 'id', 'level']) && value.id === 'risk-contract' && integer(value.level, 1, 3)) return value as unknown as SurvivalReward;
  if (value.kind === 'instant' && exact(value, ['kind', 'id']) && INSTANT_IDS.includes(value.id as never)) return value as unknown as SurvivalReward;
  invalid();
}

function parseBest(value: unknown) {
  if (!exact(value, ['runId', 'score', 'highestCompletedWave', 'bossesDefeated', 'finalIntegrity', 'riskLevel', 'loadoutSummary', 'achievedAt'])
    || typeof value.runId !== 'string' || !UUID.test(value.runId)) invalid();
  parseSummary({ score: value.score, highestCompletedWave: value.highestCompletedWave, bossesDefeated: value.bossesDefeated, finalIntegrity: value.finalIntegrity, riskLevel: value.riskLevel, achievedAt: value.achievedAt }, false);
  parseLoadout(value.loadoutSummary);
  return value;
}

function parseLeaderboard(value: unknown) {
  if (!exact(value, ['entries', 'nextCursor', 'currentRank']) || !Array.isArray(value.entries)
    || !(value.nextCursor === null || (typeof value.nextCursor === 'string' && value.nextCursor.length > 0 && value.nextCursor.length <= 512))
    || !(value.currentRank === null || integer(value.currentRank, 1))) invalid();
  const entries = value.entries.map((entry) => {
    if (!exact(entry, ['rank', 'playerId', 'displayName', 'runId', 'score', 'highestCompletedWave', 'bossesDefeated', 'finalIntegrity', 'riskLevel', 'loadoutSummary', 'achievedAt'])
      || !integer(entry.rank, 1) || typeof entry.playerId !== 'string' || !UUID.test(entry.playerId)
      || typeof entry.displayName !== 'string') invalid();
    parseBest({
      runId: entry.runId, score: entry.score, highestCompletedWave: entry.highestCompletedWave,
      bossesDefeated: entry.bossesDefeated, finalIntegrity: entry.finalIntegrity,
      riskLevel: entry.riskLevel, loadoutSummary: entry.loadoutSummary, achievedAt: entry.achievedAt,
    });
    return entry;
  });
  return { entries, nextCursor: value.nextCursor as string | null, currentRank: value.currentRank as number | null };
}

function parseHub(value: unknown, playerId: string) {
  if (!exact(value, ['configVersion', 'activeRun', 'personalBest', 'milestones', 'leaderboard'])
    || value.configVersion !== 'survival-v1' || !Array.isArray(value.milestones) || value.milestones.length !== 4) invalid();
  const expectedMilestones = [[5, 100], [10, 200], [15, 350], [20, 500]];
  const milestones = value.milestones.map((milestone, index) => {
    if (!exact(milestone, ['wave', 'coins', 'earned']) || milestone.wave !== expectedMilestones[index][0]
      || milestone.coins !== expectedMilestones[index][1] || typeof milestone.earned !== 'boolean') invalid();
    return milestone;
  });
  return {
    configVersion: 'survival-v1' as const,
    activeRun: value.activeRun === null ? null : parseRun(value.activeRun, playerId),
    personalBest: value.personalBest === null ? null : parseBest(value.personalBest),
    milestones,
    leaderboard: parseLeaderboard(value.leaderboard),
  };
}

function parseScore(value: unknown): SurvivalSettlement['score'] {
  const keys = ['base', 'waveTypeBonus', 'finishBonus', 'flawlessBonus', 'flawlessStreakBonus', 'subtotal', 'riskMultiplier', 'score'];
  if (!exact(value, keys) || keys.some(key => !finite(value[key]))) invalid();
  return value as unknown as SurvivalSettlement['score'];
}

function parseSettlement(value: unknown, playerId: string): SurvivalSettlement {
  if (!exact(value, ['run', 'score', 'rewardOptions', 'milestone', 'progression']) || !Array.isArray(value.rewardOptions) || value.rewardOptions.length > 3) invalid();
  let milestone = null;
  if (value.milestone !== null) {
    if (!exact(value.milestone, ['wave', 'coins', 'eventId']) || ![5, 10, 15, 20].includes(Number(value.milestone.wave))
      || !integer(value.milestone.coins, 1) || typeof value.milestone.eventId !== 'string' || !UUID.test(value.milestone.eventId)) invalid();
    milestone = value.milestone as SurvivalSettlement['milestone'];
  }
  return {
    run: parseRun(value.run, playerId),
    score: parseScore(value.score),
    rewardOptions: value.rewardOptions.map(parseReward),
    milestone,
    progression: parseServerProgression(value.progression),
  };
}

function endpoint(baseUrl: string | undefined, path: string) {
  return baseUrl ? `${baseUrl.replace(/\/+$/, '')}${path}` : path;
}

export function createSurvivalClient(identity: LocalIdentity, options: FetchOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const authHeaders = { Authorization: `Bearer ${identity.deviceToken}`, 'X-Player-Id': identity.playerId };
  async function request(path: string, init: RequestInit = {}) {
    const response = await fetchImpl(endpoint(options.baseUrl, path), { ...init, headers: { ...authHeaders, ...init.headers } });
    let body: unknown;
    try { body = await response.json(); } catch { invalid(response.status); }
    if (!response.ok) {
      const error = record(body) && record(body.error) ? body.error : null;
      throw new SurvivalApiError(response.status, typeof error?.code === 'string' ? error.code : 'REQUEST_FAILED', typeof error?.message === 'string' ? error.message : 'Survival request failed.');
    }
    return body;
  }
  const post = (path: string, body: unknown) => request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return {
    async getHub() { return parseHub(await request('/api/survival'), identity.playerId); },
    async startRun(input: { requestId: string }) {
      const value = await post('/api/survival/runs', input);
      if (!exact(value, ['created', 'run']) || typeof value.created !== 'boolean') invalid();
      return { created: value.created, run: parseRun(value.run, identity.playerId) };
    },
    async submitWaveResult(runId: string, wave: number, input: SurvivalResultRequest) { return parseSettlement(await post(`/api/survival/runs/${runId}/waves/${wave}/result`, input), identity.playerId); },
    async selectReward(runId: string, wave: number, input: { requestId: string; reward: SurvivalReward }) {
      const value = await post(`/api/survival/runs/${runId}/waves/${wave}/reward`, input);
      if (!exact(value, ['run'])) invalid();
      return { run: parseRun(value.run, identity.playerId) };
    },
    async abandonRun(runId: string, input: { requestId: string }) { return parseRun(await post(`/api/survival/runs/${runId}/abandon`, input), identity.playerId); },
    async getLeaderboard(query: { limit?: number; cursor?: string } = {}) {
      const params = new URLSearchParams();
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      if (query.cursor !== undefined) params.set('cursor', query.cursor);
      const suffix = params.size === 0 ? '' : `?${params}`;
      return parseLeaderboard(await request(`/api/survival/leaderboard${suffix}`));
    },
  };
}

export type SurvivalClient = ReturnType<typeof createSurvivalClient>;
