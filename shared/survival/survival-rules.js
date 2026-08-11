import { createMulberry32, hashString32 } from '../sim/rng.js';

export const SURVIVAL_ARENAS = ['classic_grid', 'neon_magma', 'absolute_zero'];
export const SURVIVAL_AI_PROFILE_IDS = ['assault', 'skirmisher', 'control', 'sustain', 'ringout', 'counter', 'mixup', 'fortress'];

const EXPECTED = {
  wavePattern: ['normal', 'normal', 'elite', 'elite', 'boss'],
  waveTypeMultipliers: { normal: 1, elite: 1.12, boss: 1.28 },
  difficulty: { chapterSize: 5, chapterStep: 0.08, maximumMultiplier: 2 },
  growthRewards: [
    { id: 'attack-calibration', maximumLevel: 3, outputPerLevel: 0.06 },
    { id: 'coordination', maximumLevel: 3, stabilityPerLevel: 0.06, spinEfficiencyPerLevel: 0.05 },
    { id: 'affinity-tuning', maximumLevel: 3, affinityEffectPerLevel: 0.08 },
    { id: 'pickup-tuning', maximumLevel: 3, pickupEffectPerLevel: 0.15 },
  ],
  instantRewards: [
    { id: 'emergency-repair', integrityRatio: 0.18 },
    { id: 'burst-vent', burstReduction: 15, clearDebuffCount: 1 },
    { id: 'temporary-overdrive', durationWaves: 1, output: 0.1, mobility: 0.1 },
  ],
  riskLevels: [
    { level: 0, scoreMultiplier: 1, enemyStrength: 0 },
    { level: 1, scoreMultiplier: 1.25, enemyStrength: 0.08 },
    { level: 2, scoreMultiplier: 1.55, enemyStrength: 0.16 },
    { level: 3, scoreMultiplier: 1.9, enemyStrength: 0.24 },
  ],
  scoring: {
    base: 100,
    waveStep: 25,
    waveTypeBonus: { normal: 0, elite: 75, boss: 200 },
    finishBonus: { 'ring out': 35, 'spin finish': 25, 'burst finish': 50, timeout: 15 },
    flawless: 100,
    flawlessStreakStep: 40,
    flawlessStreakMaximum: 5,
  },
  milestones: [
    { wave: 5, coins: 100 },
    { wave: 10, coins: 200 },
    { wave: 15, coins: 350 },
    { wave: 20, coins: 500 },
  ],
};

function same(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export function assertSurvivalCatalog(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid survival catalog');
  if (value.schemaVersion !== 1 || value.configVersion !== 'survival-v1'
    || value.sourceCatalogVersion !== 'campaign-v1'
    || value.simulationVersion !== 1 || value.battleRulesVersion !== 2) {
    throw new Error('Invalid survival catalog version');
  }
  if (!same(value.arenas, SURVIVAL_ARENAS) || !same(value.aiProfileIds, SURVIVAL_AI_PROFILE_IDS)) {
    throw new Error('Invalid survival catalog references');
  }
  for (const [key, expected] of Object.entries(EXPECTED)) {
    if (!same(value[key], expected)) throw new Error(`Invalid survival catalog field: ${key}`);
  }
}

function requireWaveInputs(seed, wave, riskLevel, campaignCatalog) {
  if (typeof seed !== 'string' || !/^[0-9a-f]{32}$/.test(seed)) throw new Error('Invalid survival seed');
  if (!Number.isSafeInteger(wave) || wave < 1) throw new Error('Invalid survival wave');
  if (!Number.isSafeInteger(riskLevel) || riskLevel < 0 || riskLevel > 3) throw new Error('Invalid survival risk level');
  if (!campaignCatalog || campaignCatalog.configVersion !== 'campaign-v1'
    || !Array.isArray(campaignCatalog.opponents)) throw new Error('Invalid survival source catalog');
}

export function generateSurvivalWave(config, campaignCatalog, seed, wave, riskLevel) {
  assertSurvivalCatalog(config);
  requireWaveInputs(seed, wave, riskLevel, campaignCatalog);
  const loadouts = campaignCatalog.opponents.flatMap(opponent => opponent.loadouts.map((enemy, sourceLoadoutIndex) => ({
    enemy,
    sourceOpponentId: opponent.id,
    sourceLoadoutIndex,
  })));
  if (loadouts.length !== 17) throw new Error('Invalid survival loadout pool');

  const random = createMulberry32(hashString32(`nss-arena|survival-v1|${seed}|${wave}`));
  const battleSeed = Array.from({ length: 4 }, () => random.nextUint32().toString(16).padStart(8, '0')).join('');
  const selected = loadouts[random.nextInt(0, loadouts.length)];
  const chapter = Math.floor((wave - 1) / config.difficulty.chapterSize) + 1;
  const type = config.wavePattern[(wave - 1) % config.wavePattern.length];
  const chapterMultiplier = 1 + (chapter - 1) * config.difficulty.chapterStep;
  const strengthMultiplier = Number(Math.min(
    config.difficulty.maximumMultiplier,
    chapterMultiplier * config.waveTypeMultipliers[type] + config.riskLevels[riskLevel].enemyStrength,
  ).toFixed(4));

  return {
    configVersion: config.configVersion,
    simulationVersion: config.simulationVersion,
    seed: battleSeed,
    wave,
    chapter,
    type,
    sourceOpponentId: selected.sourceOpponentId,
    sourceLoadoutIndex: selected.sourceLoadoutIndex,
    enemy: selected.enemy,
    arena: config.arenas[random.nextInt(0, config.arenas.length)],
    aiProfileId: config.aiProfileIds[random.nextInt(0, config.aiProfileIds.length)],
    riskLevel,
    strengthMultiplier,
  };
}
