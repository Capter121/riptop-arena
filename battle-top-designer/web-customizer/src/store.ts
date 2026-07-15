import { create } from 'zustand';
import {
  combinationId, isCombination, partById, presentationOffsets, stormAttack,
  type CameraPreset, type Combination, type Family, type FocusMode,
} from './domain';
import { sceneDiagnostics } from './diagnostics';
import { resolveInitialCombination } from './sharing/combinationUrl';

export const combinationStorageKey = 'nova-spin:phase3a:combination:v1';

interface CustomizerState {
  combination: Combination;
  selectedFamily: Family;
  cameraPreset: CameraPreset;
  focus: FocusMode;
  exploded: boolean;
  debugAxis: boolean;
  loadState: 'loading' | 'ready' | 'error';
  error: string | null;
  canUndo: boolean;
  canRedo: boolean;
  historyDepth: number;
  historyPast: Combination[];
  historyFuture: Combination[];
  pendingPrevious: Combination | null;
  startupNotice: string | null;
  testMode: boolean;
  hydrate: (search: string, savedText?: string | null) => void;
  selectFamily: (family: Family) => void;
  selectPart: (id: string) => void;
  setCamera: (preset: CameraPreset) => void;
  setExploded: (value: boolean) => void;
  restorePresentation: () => void;
  setDebugAxis: (value: boolean) => void;
  setLoadState: (state: 'loading' | 'ready' | 'error', error?: string) => void;
  replaceCombination: (combination: Combination) => void;
  reset: () => void;
  save: () => void;
  restoreSaved: () => boolean;
  undo: () => void;
  redo: () => void;
}

function focusFor(family: Family): FocusMode {
  return family === 'assist' || family === 'gear' || family === 'tip' ? family : null;
}

export const useCustomizer = create<CustomizerState>((set, get) => ({
  combination: stormAttack,
  selectedFamily: 'blade',
  cameraPreset: 'perspective',
  focus: null,
  exploded: false,
  debugAxis: false,
  loadState: 'loading',
  error: null,
  canUndo: false,
  canRedo: false,
  historyDepth: 0,
  historyPast: [],
  historyFuture: [],
  pendingPrevious: null,
  startupNotice: null,
  testMode: false,
  hydrate: (search, savedText) => {
    const resolution = resolveInitialCombination(search, savedText === undefined ? localStorage.getItem(combinationStorageKey) : savedText);
    set({
      combination: resolution.combination,
      startupNotice: resolution.invalidUrl ? 'Invalid share link. Storm Attack was restored.' : null,
      testMode: resolution.testMode,
      loadState: 'loading',
      error: null,
      canUndo: false,
      canRedo: false,
      historyDepth: 0,
      historyPast: [],
      historyFuture: [],
      pendingPrevious: null,
    });
  },
  selectFamily: selectedFamily => set({ selectedFamily }),
  selectPart: id => {
    const part = partById.get(id);
    if (!part) return set({ loadState: 'error', error: `Unknown part: ${id}` });
    const focus = focusFor(part.family);
    const cameraPreset = focus === 'gear' ? 'side' : focus === 'tip' ? 'bottom' : 'perspective';
    set(state => ({
      combination: { ...state.combination, [part.family]: id },
      selectedFamily: part.family,
      focus,
      cameraPreset,
      exploded: false,
      loadState: 'loading',
      error: null,
      pendingPrevious: state.pendingPrevious ?? state.combination,
    }));
  },
  setCamera: cameraPreset => set({ cameraPreset, focus: null }),
  setExploded: exploded => set({ exploded, focus: null }),
  restorePresentation: () => set({ focus: null, exploded: false, cameraPreset: 'perspective' }),
  setDebugAxis: debugAxis => set({ debugAxis }),
  setLoadState: (loadState, error) => set(state => {
    if (loadState === 'ready' && state.pendingPrevious) {
      const changed = combinationId(state.pendingPrevious) !== combinationId(state.combination);
      const historyPast = changed ? [...state.historyPast, state.pendingPrevious].slice(-50) : state.historyPast;
      const historyFuture = changed ? [] : state.historyFuture;
      return {
        loadState,
        error: null,
        pendingPrevious: null,
        historyPast,
        historyFuture,
        historyDepth: historyPast.length,
        canUndo: historyPast.length > 0,
        canRedo: historyFuture.length > 0,
      };
    }
    return { loadState, error: error ?? null, pendingPrevious: loadState === 'error' ? null : state.pendingPrevious };
  }),
  replaceCombination: combination => {
    if (!isCombination(combination)) return set({ loadState: 'error', error: 'Illegal combination.' });
    set(state => ({ combination, focus: null, exploded: false, cameraPreset: 'perspective', loadState: 'loading', error: null, pendingPrevious: state.pendingPrevious ?? state.combination }));
  },
  reset: () => set(state => ({ combination: stormAttack, focus: null, exploded: false, cameraPreset: 'perspective', loadState: 'loading', error: null, pendingPrevious: state.pendingPrevious ?? state.combination })),
  save: () => localStorage.setItem(combinationStorageKey, JSON.stringify({ schemaVersion: 1, combination: get().combination })),
  restoreSaved: () => {
    try {
      const saved = JSON.parse(localStorage.getItem(combinationStorageKey) ?? 'null');
      if (saved?.schemaVersion !== 1 || !isCombination(saved.combination)) return false;
      get().replaceCombination(saved.combination);
      return true;
    } catch { return false; }
  },
  undo: () => set(state => {
    if (!state.historyPast.length || state.pendingPrevious) return state;
    const combination = state.historyPast.at(-1)!;
    const historyPast = state.historyPast.slice(0, -1);
    const historyFuture = [...state.historyFuture, state.combination];
    return { combination, historyPast, historyFuture, historyDepth: historyPast.length, canUndo: historyPast.length > 0, canRedo: true, loadState: 'loading', error: null, focus: null, exploded: false, cameraPreset: 'perspective' };
  }),
  redo: () => set(state => {
    if (!state.historyFuture.length || state.pendingPrevious) return state;
    const combination = state.historyFuture.at(-1)!;
    const historyFuture = state.historyFuture.slice(0, -1);
    const historyPast = [...state.historyPast, state.combination].slice(-50);
    return { combination, historyPast, historyFuture, historyDepth: historyPast.length, canUndo: true, canRedo: historyFuture.length > 0, loadState: 'loading', error: null, focus: null, exploded: false, cameraPreset: 'perspective' };
  }),
}));

export function currentSnapshot() {
  const state = useCustomizer.getState();
  return {
    combination: state.combination,
    combinationId: combinationId(state.combination),
    selectedFamily: state.selectedFamily,
    cameraPreset: state.cameraPreset,
    focus: state.focus,
    exploded: state.exploded,
    debugAxis: state.debugAxis,
    loadState: state.loadState,
    error: state.error,
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    historyDepth: state.historyDepth,
    startupNotice: state.startupNotice,
    testMode: state.testMode,
    activeRoots: 5,
    presentationTargets: presentationOffsets(state.exploded, state.focus),
    ...sceneDiagnostics(),
  };
}
