import versions from '../../battle-top-designer/shared/nss/versions.json';
import { createMulberry32, hashString32, type RandomSource } from './rng';

export const CURRENT_SIMULATION_VERSION = versions.simulationVersion as 1;
export const BATTLE_RANDOM_DOMAINS = ['combat', 'ai', 'physics', 'spawn'] as const;

export type BattleSeed = string & { readonly __battleSeed: unique symbol };
export type BattleRandomDomain = (typeof BATTLE_RANDOM_DOMAINS)[number];

export type BattleSimulationContext = {
  simulationVersion: typeof CURRENT_SIMULATION_VERSION;
  seed: BattleSeed;
  random: Record<BattleRandomDomain, RandomSource>;
};

export type BattleSeedErrorCode = 'INVALID_BATTLE_SEED' | 'UNSUPPORTED_SIMULATION_VERSION';

export class BattleSeedError extends Error {
  readonly code: BattleSeedErrorCode;

  constructor(code: BattleSeedErrorCode, message: string) {
    super(message);
    this.name = 'BattleSeedError';
    this.code = code;
  }
}

export function parseBattleSeed(value: string): BattleSeed {
  if (!/^[0-9a-f]{32}$/.test(value)) {
    throw new BattleSeedError('INVALID_BATTLE_SEED', 'Battle seed must be 32 lowercase hexadecimal characters.');
  }
  return value as BattleSeed;
}

export function createBattleSeed(): BattleSeed {
  const bytes = new Uint8Array(16);
  if (!globalThis.crypto?.getRandomValues) {
    throw new BattleSeedError('INVALID_BATTLE_SEED', 'Secure random seed generation is unavailable.');
  }
  globalThis.crypto.getRandomValues(bytes);
  return parseBattleSeed(Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''));
}

function createDomainRandom(seed: BattleSeed, domain: BattleRandomDomain, simulationVersion: number) {
  return createMulberry32(hashString32(`nss-arena|simulation-v${simulationVersion}|${seed}|${domain}`));
}

export function createBattleSimulationContext(
  rawSeed: string,
  simulationVersion: number = CURRENT_SIMULATION_VERSION,
): BattleSimulationContext {
  if (simulationVersion !== CURRENT_SIMULATION_VERSION) {
    throw new BattleSeedError(
      'UNSUPPORTED_SIMULATION_VERSION',
      `Unsupported simulation version: ${simulationVersion}`,
    );
  }
  const seed = parseBattleSeed(rawSeed);
  return {
    simulationVersion: CURRENT_SIMULATION_VERSION,
    seed,
    random: {
      combat: createDomainRandom(seed, 'combat', simulationVersion),
      ai: createDomainRandom(seed, 'ai', simulationVersion),
      physics: createDomainRandom(seed, 'physics', simulationVersion),
      spawn: createDomainRandom(seed, 'spawn', simulationVersion),
    },
  };
}
