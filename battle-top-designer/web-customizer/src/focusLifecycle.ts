export const FOCUS_HIGHLIGHT_MS = 800;

export type FocusPhase = 'idle' | 'entering' | 'active' | 'exiting';
export type FocusTarget = 'assist' | 'gear' | 'tip';

export type FocusSessionState = {
  sessionId: number;
  revision: number;
  target: FocusTarget | null;
  phase: FocusPhase;
  partId: string | null;
  modelReady: boolean;
  pulseActive: boolean;
  readoutCommitted: boolean;
  activeFramePainted: boolean;
  presentationCompleteRequested: boolean;
};

export type FocusEvent =
  | { type: 'start'; target: FocusTarget; partId: string }
  | { type: 'model-ready'; sessionId: number }
  | { type: 'readout-committed'; sessionId: number }
  | { type: 'pulse-ended'; sessionId: number }
  | { type: 'active-frame-painted'; sessionId: number }
  | { type: 'presentation-complete'; sessionId: number }
  | { type: 'exit-complete'; sessionId: number }
  | { type: 'cancel' };

function createFocusState(state: FocusSessionState): FocusSessionState {
  return import.meta.env.DEV ? Object.freeze(state) : state;
}

export function idleFocusState(sessionId = 0, revision = 0): FocusSessionState {
  return createFocusState({
    sessionId,
    revision,
    target: null,
    phase: 'idle',
    partId: null,
    modelReady: false,
    pulseActive: false,
    readoutCommitted: false,
    activeFramePainted: false,
    presentationCompleteRequested: false,
  });
}

export function reduceFocusSession(current: FocusSessionState, event: FocusEvent): FocusSessionState {
  if (event.type === 'start') {
    return createFocusState({
      sessionId: current.sessionId + 1,
      revision: current.revision + 1,
      target: event.target,
      phase: 'entering',
      partId: event.partId,
      modelReady: false,
      pulseActive: true,
      readoutCommitted: false,
      activeFramePainted: false,
      presentationCompleteRequested: false,
    });
  }
  if (event.type === 'cancel') return idleFocusState(current.sessionId + 1, current.revision + 1);
  if (current.sessionId !== event.sessionId) return current;
  if (event.type === 'model-ready' && current.phase === 'entering') {
    return createFocusState({ ...current, revision: current.revision + 1, phase: 'active', modelReady: true });
  }
  if (event.type === 'readout-committed' && current.phase !== 'idle' && !current.readoutCommitted) {
    return createFocusState({ ...current, revision: current.revision + 1, readoutCommitted: true });
  }
  if (event.type === 'pulse-ended' && current.phase !== 'idle' && current.pulseActive) {
    return createFocusState({ ...current, revision: current.revision + 1, pulseActive: false });
  }
  if (event.type === 'active-frame-painted' && current.phase === 'active' && current.modelReady && current.readoutCommitted && !current.activeFramePainted) {
    return createFocusState({ ...current, revision: current.revision + 1, activeFramePainted: true });
  }
  if (event.type === 'presentation-complete' && current.phase === 'active' && current.modelReady && current.readoutCommitted && current.activeFramePainted && !current.presentationCompleteRequested) {
    return createFocusState({ ...current, revision: current.revision + 1, phase: 'exiting', presentationCompleteRequested: true });
  }
  if (event.type === 'exit-complete' && current.phase === 'exiting') {
    return idleFocusState(current.sessionId, current.revision + 1);
  }
  return current;
}

export function beginFocusSession(current: FocusSessionState, target: FocusTarget, partId: string): FocusSessionState {
  return reduceFocusSession(current, { type: 'start', target, partId });
}

export function cancelFocusSession(current: FocusSessionState): FocusSessionState {
  return reduceFocusSession(current, { type: 'cancel' });
}

export function markFocusModelReady(current: FocusSessionState, sessionId: number): FocusSessionState {
  return reduceFocusSession(current, { type: 'model-ready', sessionId });
}

export function markFocusReadoutCommitted(current: FocusSessionState, sessionId: number): FocusSessionState {
  return reduceFocusSession(current, { type: 'readout-committed', sessionId });
}

export function endFocusPulse(current: FocusSessionState, sessionId: number): FocusSessionState {
  return reduceFocusSession(current, { type: 'pulse-ended', sessionId });
}

export function markFocusActiveFramePainted(current: FocusSessionState, sessionId: number): FocusSessionState {
  return reduceFocusSession(current, { type: 'active-frame-painted', sessionId });
}

export function completeFocusPresentation(current: FocusSessionState, sessionId: number): FocusSessionState {
  return reduceFocusSession(current, { type: 'presentation-complete', sessionId });
}

export function completeFocusSession(current: FocusSessionState, sessionId: number): FocusSessionState {
  return reduceFocusSession(current, { type: 'exit-complete', sessionId });
}

export function focusReadoutTarget(current: FocusSessionState) {
  return current.phase === 'idle' ? null : current.target;
}

export function focusStateViolations(current: FocusSessionState) {
  const violations: string[] = [];
  if (current.phase === 'idle' && current.target !== null) violations.push('idle-target');
  if (current.phase === 'idle' && current.partId !== null) violations.push('idle-part');
  if (current.phase !== 'idle' && current.target === null) violations.push('active-target-missing');
  if (current.phase !== 'idle' && current.partId === null) violations.push('active-part-missing');
  if ((current.phase === 'active' || current.phase === 'exiting') && !current.modelReady) violations.push('model-not-ready');
  if (!Number.isInteger(current.revision) || current.revision < 0) violations.push('invalid-revision');
  if (current.phase === 'idle' && (current.readoutCommitted || current.activeFramePainted || current.presentationCompleteRequested)) violations.push('idle-presentation-state');
  if (current.activeFramePainted && (!current.modelReady || !current.readoutCommitted)) violations.push('painted-before-ready');
  if (current.phase === 'exiting' && !current.presentationCompleteRequested) violations.push('exiting-without-presentation-complete');
  if (current.phase !== 'exiting' && current.presentationCompleteRequested) violations.push('presentation-complete-outside-exit');
  return violations;
}

export class FocusExitFrameGate {
  private sessionId: number | null = null;
  private restoredFrames = 0;

  observe(sessionId: number, atTarget: boolean) {
    if (this.sessionId !== sessionId) {
      this.sessionId = sessionId;
      this.restoredFrames = 0;
    }
    if (!atTarget) {
      this.restoredFrames = 0;
      return false;
    }
    this.restoredFrames += 1;
    return this.restoredFrames >= 2;
  }

  reset() {
    this.sessionId = null;
    this.restoredFrames = 0;
  }
}

export function scheduleFocusPulseEnd(session: number, endPulse: (session: number) => void): () => void {
  const timer = window.setTimeout(() => endPulse(session), FOCUS_HIGHLIGHT_MS);
  return () => window.clearTimeout(timer);
}
