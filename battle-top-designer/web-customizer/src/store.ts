import { create } from 'zustand';
import {
  combinationId, isCombination, partById, presentationOffsets, stormAttack,
  type CameraPreset, type Combination, type Family, type FocusMode,
} from './domain';
import { sceneDiagnostics } from './diagnostics';

const storageKey = 'nova-spin:phase3a:combination:v1';

interface CustomizerState {
  combination: Combination;
  selectedFamily: Family;
  cameraPreset: CameraPreset;
  focus: FocusMode;
  exploded: boolean;
  debugAxis: boolean;
  loadState: 'loading' | 'ready' | 'error';
  error: string | null;
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
    }));
  },
  setCamera: cameraPreset => set({ cameraPreset, focus: null }),
  setExploded: exploded => set({ exploded, focus: null }),
  restorePresentation: () => set({ focus: null, exploded: false, cameraPreset: 'perspective' }),
  setDebugAxis: debugAxis => set({ debugAxis }),
  setLoadState: (loadState, error) => set({ loadState, error: error ?? null }),
  replaceCombination: combination => {
    if (!isCombination(combination)) return set({ loadState: 'error', error: 'Illegal combination.' });
    set({ combination, focus: null, exploded: false, cameraPreset: 'perspective', loadState: 'loading', error: null });
  },
  reset: () => set({ combination: stormAttack, focus: null, exploded: false, cameraPreset: 'perspective', loadState: 'loading', error: null }),
  save: () => localStorage.setItem(storageKey, JSON.stringify({ schemaVersion: 1, combination: get().combination })),
  restoreSaved: () => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (saved?.schemaVersion !== 1 || !isCombination(saved.combination)) return false;
      get().replaceCombination(saved.combination);
      return true;
    } catch { return false; }
  },
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
    activeRoots: 5,
    presentationTargets: presentationOffsets(state.exploded, state.focus),
    ...sceneDiagnostics(),
  };
}
