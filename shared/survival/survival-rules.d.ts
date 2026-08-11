export const SURVIVAL_ARENAS: readonly ['classic_grid', 'neon_magma', 'absolute_zero'];
export const SURVIVAL_AI_PROFILE_IDS: readonly ['assault', 'skirmisher', 'control', 'sustain', 'ringout', 'counter', 'mixup', 'fortress'];

export type SurvivalArena = (typeof SURVIVAL_ARENAS)[number];
export type SurvivalAiProfileId = (typeof SURVIVAL_AI_PROFILE_IDS)[number];
export type SurvivalWaveType = 'normal' | 'elite' | 'boss';
export type SurvivalEnemyLoadout = Readonly<{
  combination: Readonly<Record<'core' | 'blade' | 'assist' | 'gear' | 'tip', string>>;
  affinities: Readonly<Record<'core' | 'blade' | 'assist' | 'gear' | 'tip', string>>;
}>;

export type SurvivalCatalog = Readonly<{
  schemaVersion: 1;
  configVersion: 'survival-v1';
  sourceCatalogVersion: 'campaign-v1';
  simulationVersion: 1;
  battleRulesVersion: 2;
  arenas: readonly SurvivalArena[];
  aiProfileIds: readonly SurvivalAiProfileId[];
  wavePattern: readonly SurvivalWaveType[];
  waveTypeMultipliers: Readonly<Record<SurvivalWaveType, number>>;
  difficulty: Readonly<{ chapterSize: 5; chapterStep: number; maximumMultiplier: number }>;
  growthRewards: readonly Readonly<Record<string, string | number>>[];
  instantRewards: readonly Readonly<Record<string, string | number>>[];
  riskLevels: readonly Readonly<{ level: number; scoreMultiplier: number; enemyStrength: number }>[];
  scoring: Readonly<{
    base: number;
    waveStep: number;
    waveTypeBonus: Readonly<Record<SurvivalWaveType, number>>;
    finishBonus: Readonly<Record<'ring out' | 'spin finish' | 'burst finish' | 'timeout', number>>;
    flawless: number;
    flawlessStreakStep: number;
    flawlessStreakMaximum: number;
  }>;
  milestones: readonly Readonly<{ wave: number; coins: number }>[];
}>;

export function assertSurvivalCatalog(value: unknown): asserts value is SurvivalCatalog;
export function generateSurvivalWave(
  config: SurvivalCatalog,
  campaignCatalog: Readonly<{
    configVersion: 'campaign-v1';
    opponents: readonly Readonly<{ id: string; loadouts: readonly SurvivalEnemyLoadout[] }>[];
  }>,
  seed: string,
  wave: number,
  riskLevel: number,
): Readonly<{
  configVersion: 'survival-v1';
  simulationVersion: 1;
  seed: string;
  wave: number;
  chapter: number;
  type: SurvivalWaveType;
  sourceOpponentId: string;
  sourceLoadoutIndex: number;
  enemy: SurvivalEnemyLoadout;
  arena: SurvivalArena;
  aiProfileId: SurvivalAiProfileId;
  riskLevel: number;
  strengthMultiplier: number;
}>;
