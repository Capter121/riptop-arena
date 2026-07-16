// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FOCUS_HIGHLIGHT_MS, scheduleFocusPulseEnd } from '../../src/focusLifecycle';
import { useCustomizer } from '../../src/store';

describe('focus lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useCustomizer.getState().reset();
  });

  it('runs entering, active, exiting and idle in order', () => {
    useCustomizer.getState().selectPart('assist_guard');
    const session = useCustomizer.getState().focusState.sessionId;
    expect(useCustomizer.getState().focusState.phase).toBe('entering');
    useCustomizer.getState().markFocusReadoutCommitted(session);
    useCustomizer.getState().setLoadState('ready');
    expect(useCustomizer.getState().focusState.phase).toBe('active');
    useCustomizer.getState().endFocusPulse(session);
    expect(useCustomizer.getState().focusState.phase).toBe('active');
    useCustomizer.getState().markFocusActiveFramePainted(session);
    useCustomizer.getState().completeFocusPresentation(session);
    expect(useCustomizer.getState().focusState.phase).toBe('exiting');
    useCustomizer.getState().completeFocusExit(session);
    expect(useCustomizer.getState().focusState).toMatchObject({ target: null, phase: 'idle' });
  });

  it('makes an old timeout harmless after a new session starts', () => {
    useCustomizer.getState().selectPart('assist_guard');
    const oldSession = useCustomizer.getState().focusState.sessionId;
    useCustomizer.getState().setLoadState('ready');
    scheduleFocusPulseEnd(oldSession, session => useCustomizer.getState().endFocusPulse(session));
    useCustomizer.getState().selectPart('assist_air');
    vi.advanceTimersByTime(FOCUS_HIGHLIGHT_MS);
    expect(useCustomizer.getState()).toMatchObject({ combination: { assist: 'assist_air' }, focusState: { phase: 'entering' } });
  });

  it('keeps only the last rapid Assist selection', () => {
    useCustomizer.getState().selectPart('assist_guard');
    useCustomizer.getState().selectPart('assist_air');
    expect(useCustomizer.getState()).toMatchObject({ combination: { assist: 'assist_air' }, focusState: { target: 'assist', phase: 'entering' } });
  });

  it('replaces Assist intent immediately with Tip intent', () => {
    useCustomizer.getState().selectPart('assist_guard');
    useCustomizer.getState().selectPart('tip_needle_stamina');
    expect(useCustomizer.getState()).toMatchObject({ focusState: { target: 'tip', phase: 'entering' }, cameraPreset: 'bottom' });
  });

  it('replaces Tip intent immediately with Assist intent', () => {
    useCustomizer.getState().selectPart('tip_needle_stamina');
    useCustomizer.getState().selectPart('assist_guard');
    expect(useCustomizer.getState()).toMatchObject({ focusState: { target: 'assist', phase: 'entering' }, cameraPreset: 'perspective' });
  });

  it('retains entering intent while a lazy model is delayed', () => {
    useCustomizer.getState().selectPart('gear_high');
    vi.advanceTimersByTime(FOCUS_HIGHLIGHT_MS * 4);
    expect(useCustomizer.getState()).toMatchObject({ focusState: { target: 'gear', phase: 'entering' }, loadState: 'loading' });
  });

  it('restarts an interrupted exit with a new session', () => {
    useCustomizer.getState().selectPart('assist_guard');
    const first = useCustomizer.getState().focusState.sessionId;
    useCustomizer.getState().markFocusReadoutCommitted(first);
    useCustomizer.getState().setLoadState('ready');
    useCustomizer.getState().markFocusActiveFramePainted(first);
    useCustomizer.getState().completeFocusPresentation(first);
    useCustomizer.getState().selectPart('assist_air');
    expect(useCustomizer.getState().focusState.sessionId).toBeGreaterThan(first);
    expect(useCustomizer.getState().focusState.phase).toBe('entering');
  });

  it('keeps lifecycle semantics when reduced motion completes immediately', () => {
    useCustomizer.getState().selectPart('tip_taper_balance');
    const session = useCustomizer.getState().focusState.sessionId;
    useCustomizer.getState().markFocusReadoutCommitted(session);
    useCustomizer.getState().setLoadState('ready');
    useCustomizer.getState().markFocusActiveFramePainted(session);
    useCustomizer.getState().completeFocusPresentation(session);
    useCustomizer.getState().completeFocusExit(session);
    expect(useCustomizer.getState().focusState.phase).toBe('idle');
  });

  it('keeps lifecycle semantics in low-performance mode', () => {
    useCustomizer.getState().setLowPerformance(true);
    useCustomizer.getState().selectPart('gear_medium');
    useCustomizer.getState().setLoadState('ready');
    expect(useCustomizer.getState()).toMatchObject({ lowPerformance: true, focusState: { target: 'gear', phase: 'active' } });
  });

  it('does not alter permanent installation matrices during exit', () => {
    const before = useCustomizer.getState().combination;
    useCustomizer.getState().selectPart('assist_guard');
    const session = useCustomizer.getState().focusState.sessionId;
    useCustomizer.getState().markFocusReadoutCommitted(session);
    useCustomizer.getState().setLoadState('ready');
    useCustomizer.getState().markFocusActiveFramePainted(session);
    useCustomizer.getState().completeFocusPresentation(session);
    useCustomizer.getState().completeFocusExit(session);
    expect(useCustomizer.getState().combination).toEqual({ ...before, assist: 'assist_guard' });
  });
});
