import { create } from 'zustand';
import {
  combinationId, isCombination, partById, presentationOffsets, stormAttack,
  type CameraPreset, type Combination, type Family,
} from './domain';
import { sceneDiagnostics } from './diagnostics';
import { focusObjectId, recordFocusDiagnostic } from './focusDiagnostics';
import {
  beginFocusSession, cancelFocusSession, completeFocusPresentation as transitionFocusPresentation,
  completeFocusSession, endFocusPulse as transitionFocusPulse, focusStateViolations, idleFocusState,
  markFocusActiveFramePainted as transitionFocusActiveFrame, markFocusModelReady,
  markFocusReadoutCommitted as transitionFocusReadoutCommit, type FocusSessionState, type FocusTarget,
} from './focusLifecycle';
import { resolveInitialCombination } from './sharing/combinationUrl';
import type { ShowcaseCameraPreset, TurntableSpeed } from './rendering/showcasePolicy';

export const combinationStorageKey = 'nova-spin:phase3a:combination:v1';
const lowPerformanceStorageKey = 'nova-spin:phase3b:low-performance:v1';

interface CustomizerState {
  combination: Combination;
  selectedFamily: Family;
  cameraPreset: CameraPreset;
  focusState: FocusSessionState;
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
  loadProgress: number;
  lowPerformance: boolean;
  showcaseEnabled: boolean;
  showcaseCameraPreset: ShowcaseCameraPreset;
  turntableEnabled: boolean;
  turntablePausedByInteraction: boolean;
  turntableSpeed: TurntableSpeed;
  solarWolfBadgeEnabled: boolean;
  stormFangPatternEnabled: boolean;
  voidFalconBadgeEnabled: boolean;
  ironBastionPatternEnabled: boolean;
  orbitHaloPatternEnabled: boolean;
  dualCometPatternEnabled: boolean;
  startupNotice: string | null;
  testMode: boolean;
  hydrate: (search: string, savedText?: string | null) => void;
  selectFamily: (family: Family) => void;
  selectPart: (id: string) => void;
  setCamera: (preset: CameraPreset) => void;
  setExploded: (value: boolean) => void;
  restorePresentation: () => void;
  markFocusReadoutCommitted: (session: number) => void;
  endFocusPulse: (session: number) => void;
  markFocusActiveFramePainted: (session: number) => void;
  completeFocusPresentation: (session: number) => void;
  completeFocusExit: (session: number) => void;
  setDebugAxis: (value: boolean) => void;
  setLoadState: (state: 'loading' | 'ready' | 'error', error?: string) => void;
  setLoadProgress: (progress: number) => void;
  setLowPerformance: (value: boolean) => void;
  setShowcaseEnabled: (value: boolean) => void;
  setShowcaseCameraPreset: (preset: ShowcaseCameraPreset) => void;
  setTurntableEnabled: (value: boolean) => void;
  setTurntablePausedByInteraction: (value: boolean) => void;
  setTurntableSpeed: (speed: TurntableSpeed) => void;
  setSolarWolfBadgeEnabled: (value: boolean) => void;
  setStormFangPatternEnabled: (value: boolean) => void;
  setVoidFalconBadgeEnabled: (value: boolean) => void;
  setIronBastionPatternEnabled: (value: boolean) => void;
  setOrbitHaloPatternEnabled: (value: boolean) => void;
  setDualCometPatternEnabled: (value: boolean) => void;
  replaceCombination: (combination: Combination) => void;
  reset: () => void;
  save: () => void;
  restoreSaved: () => boolean;
  undo: () => void;
  redo: () => void;
}

function focusFor(family: Family): FocusTarget | null {
  return family === 'assist' || family === 'gear' || family === 'tip' ? family : null;
}

export const useCustomizer = create<CustomizerState>((set, get) => ({
  combination: stormAttack,
  selectedFamily: 'blade',
  cameraPreset: 'perspective',
  focusState: idleFocusState(),
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
  loadProgress: 0,
  lowPerformance: false,
  showcaseEnabled: false,
  showcaseCameraPreset: 'hero',
  turntableEnabled: false,
  turntablePausedByInteraction: false,
  turntableSpeed: 'slow',
  solarWolfBadgeEnabled: true,
  stormFangPatternEnabled: true,
  voidFalconBadgeEnabled: true,
  ironBastionPatternEnabled: true,
  orbitHaloPatternEnabled: true,
  dualCometPatternEnabled: true,
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
      focusState: cancelFocusSession(get().focusState),
      loadProgress: 0,
      lowPerformance: (() => { try { return localStorage.getItem(lowPerformanceStorageKey) === 'true'; } catch { return false; } })(),
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
      focusState: focus ? beginFocusSession(state.focusState, focus, id) : cancelFocusSession(state.focusState),
      cameraPreset,
      exploded: false,
      loadState: 'loading',
      error: null,
      pendingPrevious: state.pendingPrevious ?? state.combination,
      loadProgress: 10,
    }));
  },
  setCamera: cameraPreset => set(state => ({ cameraPreset, focusState: cancelFocusSession(state.focusState) })),
  setExploded: exploded => set(state => ({ exploded, focusState: cancelFocusSession(state.focusState) })),
  restorePresentation: () => set(state => ({ focusState: cancelFocusSession(state.focusState), exploded: false, cameraPreset: 'perspective' })),
  markFocusReadoutCommitted: session => set(state => {
    const focusState = transitionFocusReadoutCommit(state.focusState, session);
    return focusState === state.focusState ? state : { focusState };
  }),
  endFocusPulse: session => set(state => {
    const focusState = transitionFocusPulse(state.focusState, session);
    return focusState === state.focusState ? state : { focusState };
  }),
  markFocusActiveFramePainted: session => set(state => {
    const focusState = transitionFocusActiveFrame(state.focusState, session);
    return focusState === state.focusState ? state : { focusState };
  }),
  completeFocusPresentation: session => set(state => {
    const focusState = transitionFocusPresentation(state.focusState, session);
    return focusState === state.focusState ? state : { focusState };
  }),
  completeFocusExit: session => set(state => {
    const focusState = completeFocusSession(state.focusState, session);
    return focusState === state.focusState ? state : { focusState, exploded: false, cameraPreset: 'perspective' };
  }),
  setDebugAxis: debugAxis => set({ debugAxis }),
  setLoadState: (loadState, error) => set(state => {
    if (loadState === 'ready' && state.pendingPrevious) {
      const changed = combinationId(state.pendingPrevious) !== combinationId(state.combination);
      const historyPast = changed ? [...state.historyPast, state.pendingPrevious].slice(-50) : state.historyPast;
      const historyFuture = changed ? [] : state.historyFuture;
      return {
        loadState,
        error: null,
        loadProgress: 100,
        pendingPrevious: null,
        historyPast,
        historyFuture,
        historyDepth: historyPast.length,
        canUndo: historyPast.length > 0,
        canRedo: historyFuture.length > 0,
        focusState: markFocusModelReady(state.focusState, state.focusState.sessionId),
      };
    }
    return { loadState, error: error ?? null, loadProgress: loadState === 'ready' ? 100 : state.loadProgress, pendingPrevious: loadState === 'error' ? null : state.pendingPrevious, focusState: loadState === 'ready' ? markFocusModelReady(state.focusState, state.focusState.sessionId) : state.focusState };
  }),
  setLoadProgress: progress => set(state => ({ loadProgress: Math.max(state.loadProgress, Math.min(100, Math.max(0, Math.round(progress)))) })),
  setLowPerformance: lowPerformance => {
    try { localStorage.setItem(lowPerformanceStorageKey, String(lowPerformance)); } catch { /* Mode still applies for this session. */ }
    set({ lowPerformance });
  },
  setShowcaseEnabled: showcaseEnabled => set(state => ({ showcaseEnabled, turntableEnabled: showcaseEnabled ? state.turntableEnabled : false, turntablePausedByInteraction: false })),
  setShowcaseCameraPreset: showcaseCameraPreset => set({ showcaseCameraPreset }),
  setTurntableEnabled: turntableEnabled => set(state => ({ turntableEnabled: state.showcaseEnabled && turntableEnabled })),
  setTurntablePausedByInteraction: turntablePausedByInteraction => set({ turntablePausedByInteraction }),
  setTurntableSpeed: turntableSpeed => set({ turntableSpeed }),
  setSolarWolfBadgeEnabled: solarWolfBadgeEnabled => set({ solarWolfBadgeEnabled }),
  setStormFangPatternEnabled: stormFangPatternEnabled => set({ stormFangPatternEnabled }),
  setVoidFalconBadgeEnabled: voidFalconBadgeEnabled => set({ voidFalconBadgeEnabled }),
  setIronBastionPatternEnabled: ironBastionPatternEnabled => set({ ironBastionPatternEnabled }),
  setOrbitHaloPatternEnabled: orbitHaloPatternEnabled => set({ orbitHaloPatternEnabled }),
  setDualCometPatternEnabled: dualCometPatternEnabled => set({ dualCometPatternEnabled }),
  replaceCombination: combination => {
    if (!isCombination(combination)) return set({ loadState: 'error', error: 'Illegal combination.' });
    set(state => ({ combination, focusState: cancelFocusSession(state.focusState), exploded: false, cameraPreset: 'perspective', loadState: 'loading', loadProgress: 10, error: null, pendingPrevious: state.pendingPrevious ?? state.combination }));
  },
  reset: () => set(state => ({ combination: stormAttack, focusState: cancelFocusSession(state.focusState), exploded: false, cameraPreset: 'perspective', loadState: 'loading', loadProgress: 10, error: null, pendingPrevious: state.pendingPrevious ?? state.combination })),
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
    return { combination, historyPast, historyFuture, historyDepth: historyPast.length, canUndo: historyPast.length > 0, canRedo: true, loadState: 'loading', loadProgress: 10, error: null, focusState: cancelFocusSession(state.focusState), exploded: false, cameraPreset: 'perspective' };
  }),
  redo: () => set(state => {
    if (!state.historyFuture.length || state.pendingPrevious) return state;
    const combination = state.historyFuture.at(-1)!;
    const historyFuture = state.historyFuture.slice(0, -1);
    const historyPast = [...state.historyPast, state.combination].slice(-50);
    return { combination, historyPast, historyFuture, historyDepth: historyPast.length, canUndo: true, canRedo: historyFuture.length > 0, loadState: 'loading', loadProgress: 10, error: null, focusState: cancelFocusSession(state.focusState), exploded: false, cameraPreset: 'perspective' };
  }),
}));

let storeNotificationSequence = 0;

useCustomizer.subscribe((state, previous) => {
  if (state.focusState === previous.focusState) return;
  storeNotificationSequence += 1;
  const violations = focusStateViolations(state.focusState);
  if (import.meta.env.DEV && violations.length) throw new Error(`Invalid focus state: ${violations.join(', ')}`);
  recordFocusDiagnostic({
    type: 'store-transition',
    sessionId: state.focusState.sessionId,
    target: state.focusState.target,
    phase: state.focusState.phase,
    details: {
      previousSessionId: previous.focusState.sessionId,
      previousTarget: previous.focusState.target,
      previousPhase: previous.focusState.phase,
      revision: state.focusState.revision,
      previousRevision: previous.focusState.revision,
      newReference: state.focusState !== previous.focusState,
      focusObjectId: focusObjectId(state.focusState),
      previousFocusObjectId: focusObjectId(previous.focusState),
      storeNotificationSequence,
      partId: state.focusState.partId,
      modelReady: state.focusState.modelReady,
      pulseActive: state.focusState.pulseActive,
      readoutCommitted: state.focusState.readoutCommitted,
      activeFramePainted: state.focusState.activeFramePainted,
      presentationCompleteRequested: state.focusState.presentationCompleteRequested,
      loadState: state.loadState,
    },
  });
});

export function currentSnapshot() {
  const state = useCustomizer.getState();
  const focus = state.focusState;
  return {
    combination: state.combination,
    combinationId: combinationId(state.combination),
    selectedFamily: state.selectedFamily,
    cameraPreset: state.cameraPreset,
    focus: focus.target,
    focusPhase: focus.phase,
    focusSession: focus.sessionId,
    focusRevision: focus.revision,
    focusHighlight: focus.pulseActive,
    focusState: { ...focus },
    exploded: state.exploded,
    debugAxis: state.debugAxis,
    loadState: state.loadState,
    error: state.error,
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    historyDepth: state.historyDepth,
    loadProgress: state.loadProgress,
    lowPerformance: state.lowPerformance,
    startupNotice: state.startupNotice,
    testMode: state.testMode,
    activeRoots: 5,
    presentationTargets: presentationOffsets(state.exploded, focus.phase === 'exiting' ? null : focus.target),
    ...sceneDiagnostics(),
  };
}
