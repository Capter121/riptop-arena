// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FOCUS_PRESENTATION_ANIMATION_NAME, FocusReadout } from '../../src/focusPresentationController';

function animationEnd(name: string) {
  const event = new Event('animationend', { bubbles: true });
  Object.defineProperty(event, 'animationName', { value: name });
  return event;
}

describe('focus presentation controller', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (onComplete: (sessionId: number) => void, activeFramePainted = true, children: ReactNode = 'Guard Assist') => {
    act(() => root.render(
      <FocusReadout testId="assist-focus-readout" phase="active" sessionId={9} activeFramePainted={activeFramePainted} onPresentationComplete={onComplete}>
        {children}
      </FocusReadout>,
    ));
  };

  it('emits presentation complete only for the approved animation end', () => {
    const complete = vi.fn();
    render(complete);
    const readout = container.querySelector('[data-testid="assist-focus-readout"]')!;
    expect(readout.classList.contains('presentation-active')).toBe(true);
    act(() => readout.dispatchEvent(animationEnd('unrelated-animation')));
    expect(complete).not.toHaveBeenCalled();
    act(() => readout.dispatchEvent(animationEnd(FOCUS_PRESENTATION_ANIMATION_NAME)));
    expect(complete).toHaveBeenCalledWith(9);
  });

  it('does not arm the presentation animation before the active frame is painted', () => {
    const complete = vi.fn();
    render(complete, false);
    const readout = container.querySelector('[data-testid="assist-focus-readout"]')!;
    expect(readout.classList.contains('presentation-active')).toBe(false);
    act(() => readout.dispatchEvent(animationEnd(FOCUS_PRESENTATION_ANIMATION_NAME)));
    expect(complete).not.toHaveBeenCalled();
  });
});
