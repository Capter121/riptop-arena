import { DEFAULT_BUILD, PARTS, type BuildSelection, type PartSlot } from '../data/parts';
import { isNssBattleLoadoutV1 } from '../nss/loadout';
import type { NssBattleLoadoutV1 } from '../nss/types';

const STORAGE_KEY = 'riptop-progression-v1';

export type UpgradeKey = 'attack' | 'defense' | 'stamina';
export type UpgradeLevels = Record<UpgradeKey, number>;
export type PartUpgradeLevels = Record<string, number>;

type ProgressionData = {
  unlockedParts: string[];
  ladderIndex: number;
  bestLadder: number;
  championshipCount: number;
  coins: number;
  build: BuildSelection;
  upgrades: UpgradeLevels;
  partUpgrades: PartUpgradeLevels;
  latestNssLoadout: NssBattleLoadoutV1 | null;
};

export type ProgressionState = ProgressionData & {
  unlockedSet: Set<string>;
};

export type UnlockReward = {
  slot: PartSlot;
  id: string;
  name: string;
};

export const TOTAL_PART_COUNT = Object.values(PARTS).reduce((sum, slotParts) => sum + slotParts.length, 0);
export const MAX_SYSTEM_UPGRADE_LEVEL = 5;
export const MAX_PART_UPGRADE_LEVEL = 4;

const SLOT_ORDER: PartSlot[] = ['attackRing', 'core', 'driver'];
const DEFAULT_UNLOCKS = ['round', 'balanced', 'grip'];
const DEFAULT_UPGRADES: UpgradeLevels = {
  attack: 0,
  defense: 0,
  stamina: 0,
};

const ALL_PART_IDS = Object.values(PARTS).flatMap((slotParts) => slotParts.map((part) => part.id));

const UNLOCK_ORDER: Array<{ slot: PartSlot; id: string }> = [
  { slot: 'attackRing', id: 'slash' },
  { slot: 'driver', id: 'drift' },
  { slot: 'core', id: 'light' },
  { slot: 'attackRing', id: 'bulwark' },
  { slot: 'core', id: 'heavy' },
  { slot: 'driver', id: 'rush' },
];

function sanitizeBuild(build?: Partial<BuildSelection>): BuildSelection {
  const next = { ...DEFAULT_BUILD };
  for (const slot of SLOT_ORDER) {
    const candidate = build?.[slot];
    if (candidate && PARTS[slot].some((part) => part.id === candidate)) {
      next[slot] = candidate;
    }
  }

  return next;
}

function sanitizeUpgrades(upgrades?: Partial<UpgradeLevels>): UpgradeLevels {
  return {
    attack: Math.min(MAX_SYSTEM_UPGRADE_LEVEL, Math.max(0, Math.floor(upgrades?.attack ?? 0))),
    defense: Math.min(MAX_SYSTEM_UPGRADE_LEVEL, Math.max(0, Math.floor(upgrades?.defense ?? 0))),
    stamina: Math.min(MAX_SYSTEM_UPGRADE_LEVEL, Math.max(0, Math.floor(upgrades?.stamina ?? 0))),
  };
}

function sanitizePartUpgrades(partUpgrades?: PartUpgradeLevels): PartUpgradeLevels {
  const next: PartUpgradeLevels = {};
  for (const id of ALL_PART_IDS) {
    next[id] = Math.min(MAX_PART_UPGRADE_LEVEL, Math.max(0, Math.floor(partUpgrades?.[id] ?? 0)));
  }
  return next;
}

function fromData(data: ProgressionData): ProgressionState {
  return {
    ...data,
    build: sanitizeBuild(data.build),
    upgrades: sanitizeUpgrades(data.upgrades),
    partUpgrades: sanitizePartUpgrades(data.partUpgrades),
    latestNssLoadout: isNssBattleLoadoutV1(data.latestNssLoadout) ? data.latestNssLoadout : null,
    unlockedSet: new Set(data.unlockedParts),
  };
}

function createDefaultState() {
  return fromData({
    unlockedParts: [...DEFAULT_UNLOCKS],
    ladderIndex: 0,
    bestLadder: 0,
    championshipCount: 0,
    coins: 0,
    build: DEFAULT_BUILD,
    upgrades: DEFAULT_UPGRADES,
    partUpgrades: {},
    latestNssLoadout: null,
  });
}

export function loadProgression(): ProgressionState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();

    const parsed = JSON.parse(raw) as Partial<ProgressionData>;
    return fromData({
      unlockedParts: Array.isArray(parsed.unlockedParts) ? parsed.unlockedParts.filter((value) => typeof value === 'string') : [...DEFAULT_UNLOCKS],
      ladderIndex: typeof parsed.ladderIndex === 'number' ? Math.max(0, Math.floor(parsed.ladderIndex)) : 0,
      bestLadder: typeof parsed.bestLadder === 'number' ? Math.max(0, Math.floor(parsed.bestLadder)) : 0,
      championshipCount: typeof parsed.championshipCount === 'number' ? Math.max(0, Math.floor(parsed.championshipCount)) : 0,
      coins: typeof parsed.coins === 'number' ? Math.max(0, Math.floor(parsed.coins)) : 0,
      build: sanitizeBuild(parsed.build),
      upgrades: sanitizeUpgrades(parsed.upgrades),
      partUpgrades: sanitizePartUpgrades(parsed.partUpgrades),
      latestNssLoadout: isNssBattleLoadoutV1(parsed.latestNssLoadout) ? parsed.latestNssLoadout : null,
    });
  } catch {
    return createDefaultState();
  }
}

export function saveProgression(state: ProgressionState) {
  const payload: ProgressionData = {
    unlockedParts: [...state.unlockedSet],
    ladderIndex: state.ladderIndex,
    bestLadder: state.bestLadder,
    championshipCount: state.championshipCount,
    coins: state.coins,
    build: sanitizeBuild(state.build),
    upgrades: sanitizeUpgrades(state.upgrades),
    partUpgrades: sanitizePartUpgrades(state.partUpgrades),
    latestNssLoadout: isNssBattleLoadoutV1(state.latestNssLoadout) ? state.latestNssLoadout : null,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function replaceState(state: ProgressionState, patch: Partial<ProgressionData>): ProgressionState {
  return fromData({
    unlockedParts: patch.unlockedParts ?? [...state.unlockedSet],
    ladderIndex: patch.ladderIndex ?? state.ladderIndex,
    bestLadder: patch.bestLadder ?? state.bestLadder,
    championshipCount: patch.championshipCount ?? state.championshipCount,
    coins: patch.coins ?? state.coins,
    build: patch.build ?? state.build,
    upgrades: patch.upgrades ?? state.upgrades,
    partUpgrades: patch.partUpgrades ?? state.partUpgrades,
    latestNssLoadout: patch.latestNssLoadout ?? state.latestNssLoadout,
  });
}

export function setBuild(state: ProgressionState, build: BuildSelection): ProgressionState {
  return replaceState(state, { build: sanitizeBuild(build) });
}

export function setNssLoadout(state: ProgressionState, loadout: NssBattleLoadoutV1): ProgressionState {
  return replaceState(state, { latestNssLoadout: loadout });
}

export function awardCoins(state: ProgressionState, amount: number): ProgressionState {
  return replaceState(state, { coins: state.coins + Math.max(0, Math.floor(amount)) });
}

export function spendCoins(state: ProgressionState, amount: number): ProgressionState {
  return replaceState(state, { coins: Math.max(0, state.coins - Math.max(0, Math.floor(amount))) });
}

export function unlockPart(state: ProgressionState, id: string): ProgressionState {
  if (state.unlockedSet.has(id)) return state;
  const unlockedSet = new Set(state.unlockedSet);
  unlockedSet.add(id);
  return replaceState(state, { unlockedParts: [...unlockedSet] });
}

export function setUpgradeLevel(state: ProgressionState, key: UpgradeKey, level: number): ProgressionState {
  return replaceState(state, {
    upgrades: {
      ...state.upgrades,
      [key]: Math.min(MAX_SYSTEM_UPGRADE_LEVEL, Math.max(0, Math.floor(level))),
    },
  });
}

export function setPartUpgradeLevel(state: ProgressionState, id: string, level: number): ProgressionState {
  return replaceState(state, {
    partUpgrades: {
      ...state.partUpgrades,
      [id]: Math.min(MAX_PART_UPGRADE_LEVEL, Math.max(0, Math.floor(level))),
    },
  });
}

export function getPartUpgradeLevel(state: ProgressionState, id: string) {
  return state.partUpgrades[id] ?? 0;
}

export function unlockNextPart(state: ProgressionState): { state: ProgressionState; reward: UnlockReward | null } {
  const nextUnlock = UNLOCK_ORDER.find((entry) => !state.unlockedSet.has(entry.id));
  if (!nextUnlock) {
    return { state, reward: null };
  }

  const rewardPart = PARTS[nextUnlock.slot].find((part) => part.id === nextUnlock.id);
  if (!rewardPart) {
    return { state, reward: null };
  }

  const unlockedSet = new Set(state.unlockedSet);
  unlockedSet.add(nextUnlock.id);
  return {
    state: replaceState(state, { unlockedParts: [...unlockedSet] }),
    reward: {
      slot: nextUnlock.slot,
      id: nextUnlock.id,
      name: rewardPart.name,
    },
  };
}

export function advanceLadder(state: ProgressionState): ProgressionState {
  const ladderIndex = state.ladderIndex + 1;
  return replaceState(state, {
    ladderIndex,
    bestLadder: Math.max(state.bestLadder, ladderIndex),
  });
}

export function resetRun(state: ProgressionState): ProgressionState {
  return replaceState(state, { ladderIndex: 0 });
}

export function awardChampionship(state: ProgressionState): ProgressionState {
  return replaceState(state, { championshipCount: state.championshipCount + 1 });
}

export function isPartUnlocked(state: ProgressionState, id: string) {
  return state.unlockedSet.has(id);
}

export function getNextUnlock(state: ProgressionState): UnlockReward | null {
  const nextUnlock = UNLOCK_ORDER.find((entry) => !state.unlockedSet.has(entry.id));
  if (!nextUnlock) {
    return null;
  }

  const rewardPart = PARTS[nextUnlock.slot].find((part) => part.id === nextUnlock.id);
  if (!rewardPart) {
    return null;
  }

  return {
    slot: nextUnlock.slot,
    id: nextUnlock.id,
    name: rewardPart.name,
  };
}
