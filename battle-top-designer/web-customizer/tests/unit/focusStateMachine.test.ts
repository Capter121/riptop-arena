import { describe, expect, it } from 'vitest';
import {
  FocusExitFrameGate, beginFocusSession, completeFocusPresentation, completeFocusSession, endFocusPulse,
  focusReadoutTarget, focusStateViolations, idleFocusState, markFocusActiveFramePainted,
  markFocusModelReady, markFocusReadoutCommitted,
} from '../../src/focusLifecycle';

const active = (target: 'assist' | 'gear' | 'tip', partId: string) => {
  const entering = beginFocusSession(idleFocusState(), target, partId);
  return markFocusModelReady(entering, entering.sessionId);
};

describe('focus session state machine', () => {
  it('mounts the assist readout while entering', () => {
    expect(focusReadoutTarget(beginFocusSession(idleFocusState(), 'assist', 'assist_guard'))).toBe('assist');
  });

  it('mounts the assist readout while active', () => {
    expect(focusReadoutTarget(active('assist', 'assist_guard'))).toBe('assist');
  });

  it('mounts the assist readout while exiting', () => {
    const state = active('assist', 'assist_guard');
    const committed = markFocusReadoutCommitted(state, state.sessionId);
    const painted = markFocusActiveFramePainted(committed, committed.sessionId);
    expect(focusReadoutTarget(completeFocusPresentation(painted, painted.sessionId))).toBe('assist');
  });

  it('unmounts the readout only after idle', () => {
    const state = active('assist', 'assist_guard');
    const committed = markFocusReadoutCommitted(state, state.sessionId);
    const painted = markFocusActiveFramePainted(committed, committed.sessionId);
    const exiting = completeFocusPresentation(painted, painted.sessionId);
    expect(focusReadoutTarget(completeFocusSession(exiting, exiting.sessionId))).toBeNull();
  });

  it('keeps the tip readout through all non-idle phases', () => {
    const entering = beginFocusSession(idleFocusState(), 'tip', 'tip_needle_stamina');
    const current = markFocusModelReady(entering, entering.sessionId);
    const committed = markFocusReadoutCommitted(current, current.sessionId);
    const painted = markFocusActiveFramePainted(committed, committed.sessionId);
    expect([entering, current, completeFocusPresentation(painted, painted.sessionId)].map(focusReadoutTarget)).toEqual(['tip', 'tip', 'tip']);
  });

  it('keeps the gear readout through all non-idle phases', () => {
    const entering = beginFocusSession(idleFocusState(), 'gear', 'gear_high');
    const current = markFocusModelReady(entering, entering.sessionId);
    const committed = markFocusReadoutCommitted(current, current.sessionId);
    const painted = markFocusActiveFramePainted(committed, committed.sessionId);
    expect([entering, current, completeFocusPresentation(painted, painted.sessionId)].map(focusReadoutTarget)).toEqual(['gear', 'gear', 'gear']);
  });

  it('prevents an old session callback from closing a new assist session', () => {
    const old = active('assist', 'assist_guard');
    const current = beginFocusSession(old, 'assist', 'assist_air');
    expect(endFocusPulse(current, old.sessionId)).toBe(current);
  });

  it('prevents an old assist session from closing a new tip session', () => {
    const old = active('assist', 'assist_guard');
    const current = beginFocusSession(old, 'tip', 'tip_taper_balance');
    expect(completeFocusSession(current, old.sessionId)).toBe(current);
  });

  it('makes stale cleanup callbacks side-effect free', () => {
    const old = active('gear', 'gear_high');
    const current = beginFocusSession(old, 'assist', 'assist_heavy');
    expect(completeFocusSession(endFocusPulse(current, old.sessionId), old.sessionId)).toBe(current);
  });

  it('handles model-ready before and after a new session without activating the wrong one', () => {
    const idle = idleFocusState(8);
    expect(markFocusModelReady(idle, 8)).toBe(idle);
    const entering = beginFocusSession(idle, 'assist', 'assist_guard');
    expect(markFocusModelReady(entering, 8)).toBe(entering);
    expect(markFocusModelReady(entering, entering.sessionId).phase).toBe('active');
  });

  it('ends the pulse without unmounting the readout', () => {
    const state = active('assist', 'assist_guard');
    const pulseEnded = endFocusPulse(state, state.sessionId);
    expect(pulseEnded).toMatchObject({ phase: 'active', pulseActive: false });
    expect(focusReadoutTarget(pulseEnded)).toBe('assist');
    const committed = markFocusReadoutCommitted(pulseEnded, pulseEnded.sessionId);
    const painted = markFocusActiveFramePainted(committed, committed.sessionId);
    const exiting = completeFocusPresentation(painted, painted.sessionId);
    expect(exiting.phase).toBe('exiting');
  });

  it('requires presentation complete to enter exiting', () => {
    const state = active('assist', 'assist_guard');
    const committed = markFocusReadoutCommitted(state, state.sessionId);
    const painted = markFocusActiveFramePainted(committed, committed.sessionId);
    expect(completeFocusPresentation(painted, painted.sessionId)).toMatchObject({ phase: 'exiting', presentationCompleteRequested: true });
  });

  it('rejects presentation complete before readout commit', () => {
    const state = active('assist', 'assist_guard');
    expect(completeFocusPresentation(state, state.sessionId)).toBe(state);
  });

  it('rejects presentation complete before an active frame is painted', () => {
    const state = active('assist', 'assist_guard');
    const committed = markFocusReadoutCommitted(state, state.sessionId);
    expect(completeFocusPresentation(committed, committed.sessionId)).toBe(committed);
  });

  it('returns a new immutable object and increments revision for every semantic transition', () => {
    const idle = idleFocusState();
    const entering = beginFocusSession(idle, 'assist', 'assist_guard');
    const current = markFocusModelReady(entering, entering.sessionId);
    const committed = markFocusReadoutCommitted(current, current.sessionId);
    const pulseEnded = endFocusPulse(committed, committed.sessionId);
    const painted = markFocusActiveFramePainted(pulseEnded, pulseEnded.sessionId);
    const exiting = completeFocusPresentation(painted, painted.sessionId);
    const complete = completeFocusSession(exiting, exiting.sessionId);
    const states = [idle, entering, current, pulseEnded, exiting, complete];
    expect(states.map(state => state.revision)).toEqual([0, 1, 2, 4, 6, 7]);
    expect(new Set(states).size).toBe(states.length);
    expect(states.every(Object.isFrozen)).toBe(true);
  });

  it('never mutates the previous focus object', () => {
    const previous = active('tip', 'tip_taper_balance');
    const snapshot = structuredClone(previous);
    endFocusPulse(previous, previous.sessionId);
    expect(previous).toEqual(snapshot);
  });

  it('rejects split legacy fixtures and reused mutable semantic references', () => {
    const invalid = { ...idleFocusState(), target: 'assist' as const };
    expect(focusStateViolations(invalid)).toContain('idle-target');
    const current = active('assist', 'assist_guard');
    expect(completeFocusPresentation(current, current.sessionId)).toBe(current);
  });

  it('keeps a pulse-ended entering session valid until the model becomes ready', () => {
    const entering = beginFocusSession(idleFocusState(), 'assist', 'assist_guard');
    const pulseEnded = endFocusPulse(entering, entering.sessionId);
    const committed = markFocusReadoutCommitted(pulseEnded, pulseEnded.sessionId);
    const current = markFocusModelReady(committed, committed.sessionId);
    const painted = markFocusActiveFramePainted(current, current.sessionId);
    expect(completeFocusPresentation(painted, painted.sessionId).phase).toBe('exiting');
  });

  it('keeps a model-ready session valid when the pulse ends later', () => {
    const entering = beginFocusSession(idleFocusState(), 'tip', 'tip_taper_balance');
    const committed = markFocusReadoutCommitted(entering, entering.sessionId);
    const current = markFocusModelReady(committed, committed.sessionId);
    const painted = markFocusActiveFramePainted(current, current.sessionId);
    const pulseEnded = endFocusPulse(painted, painted.sessionId);
    expect(completeFocusPresentation(pulseEnded, pulseEnded.sessionId).phase).toBe('exiting');
  });

  it('requires a painted restoration frame in reduced-motion mode', () => {
    const gate = new FocusExitFrameGate();
    expect(gate.observe(3, true)).toBe(false);
    expect(gate.observe(3, true)).toBe(true);
  });

  it('requires a painted restoration frame in low-performance mode', () => {
    const gate = new FocusExitFrameGate();
    expect(gate.observe(4, true)).toBe(false);
    expect(gate.observe(4, true)).toBe(true);
  });


  it('derives readout state from the session after a component remount', () => {
    const state = active('tip', 'tip_taper_balance');
    expect(focusReadoutTarget(structuredClone(state))).toBe('tip');
  });

  it('keeps 1000 rapid assist and tip replacements valid', () => {
    let state = idleFocusState();
    for (let index = 0; index < 1000; index += 1) {
      const target = index % 2 === 0 ? 'assist' : 'tip';
      state = beginFocusSession(state, target, target === 'assist' ? 'assist_guard' : 'tip_taper_balance');
      expect(focusStateViolations(state)).toEqual([]);
    }
  });

  it('gives App and Scene the same authoritative target and session', () => {
    const state = active('assist', 'assist_guard');
    const app = { target: focusReadoutTarget(state), sessionId: state.sessionId };
    const scene = { target: state.target, sessionId: state.sessionId };
    expect(app).toEqual(scene);
  });
});
