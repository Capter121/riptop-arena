// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { focusReadoutTarget } from '../../src/focusLifecycle';
import { useCustomizer } from '../../src/store';

function ReadoutHost() {
  const target = useCustomizer(state => focusReadoutTarget(state.focusState));
  const phase = useCustomizer(state => state.focusState.phase);
  const partId = useCustomizer(state => state.focusState.partId);
  const revision = useCustomizer(state => state.focusState.revision);
  return target ? <output data-testid="readout">{`${target}:${phase}:${partId}:${revision}`}</output> : null;
}

describe('React Zustand focus subscription', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    useCustomizer.getState().reset();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<ReadoutHost />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('observes entering, active, pulse-end, exiting and idle revisions from the real store', () => {
    act(() => useCustomizer.getState().selectPart('assist_guard'));
    expect(container.textContent).toMatch(/^assist:entering:assist_guard:\d+$/);
    const session = useCustomizer.getState().focusState.sessionId;
    act(() => useCustomizer.getState().setLoadState('ready'));
    expect(container.textContent).toMatch(/^assist:active:assist_guard:\d+$/);
    act(() => useCustomizer.getState().markFocusReadoutCommitted(session));
    act(() => useCustomizer.getState().endFocusPulse(session));
    expect(container.textContent).toMatch(/^assist:active:assist_guard:\d+$/);
    act(() => useCustomizer.getState().markFocusActiveFramePainted(session));
    act(() => useCustomizer.getState().completeFocusPresentation(session));
    expect(container.textContent).toMatch(/^assist:exiting:assist_guard:\d+$/);
    act(() => useCustomizer.getState().completeFocusExit(session));
    expect(container.textContent).toBe('');
  });

  it('restores the current readout after an actual React unmount and remount', () => {
    act(() => useCustomizer.getState().selectPart('tip_needle_stamina'));
    act(() => root.unmount());
    root = createRoot(container);
    act(() => root.render(<ReadoutHost />));
    expect(container.textContent).toMatch(/^tip:entering:tip_needle_stamina:\d+$/);
  });

  it('notifies subscribers once per entering, active, pulse-end, exiting and idle revision', () => {
    const observed: Array<{ revision: number; phase: string; pulseActive: boolean }> = [];
    const unsubscribe = useCustomizer.subscribe((state, previous) => {
      if (state.focusState !== previous.focusState) {
        observed.push({ revision: state.focusState.revision, phase: state.focusState.phase, pulseActive: state.focusState.pulseActive });
      }
    });
    act(() => useCustomizer.getState().selectPart('gear_high'));
    const session = useCustomizer.getState().focusState.sessionId;
    act(() => useCustomizer.getState().setLoadState('ready'));
    act(() => useCustomizer.getState().markFocusReadoutCommitted(session));
    act(() => useCustomizer.getState().endFocusPulse(session));
    act(() => useCustomizer.getState().markFocusActiveFramePainted(session));
    act(() => useCustomizer.getState().completeFocusPresentation(session));
    act(() => useCustomizer.getState().completeFocusExit(session));
    unsubscribe();
    expect(observed.map(value => value.phase)).toEqual(['entering', 'active', 'active', 'active', 'active', 'exiting', 'idle']);
    expect(observed.map(value => value.pulseActive)).toEqual([true, true, true, false, false, false, false]);
    expect(observed.map(value => value.revision)).toEqual(observed.map((_, index) => observed[0].revision + index));
  });

  it('cannot mutate a frozen session to hide a semantic change from React', () => {
    act(() => useCustomizer.getState().selectPart('assist_guard'));
    const focusState = useCustomizer.getState().focusState;
    expect(() => { (focusState as { phase: string }).phase = 'idle'; }).toThrow();
    expect(container.textContent).toContain('assist:entering:assist_guard');
  });
});
