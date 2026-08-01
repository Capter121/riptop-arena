// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PreviewableButton } from '../../src/comparison/PreviewableButton';

function pointer(type: string, options: { pointerId?: number; pointerType?: string; clientX?: number; clientY?: number } = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.entries({ pointerId: 1, pointerType: 'touch', clientX: 20, clientY: 20, ...options })
    .forEach(([key, value]) => Object.defineProperty(event, key, { value }));
  return event;
}

describe('PreviewableButton', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let button: HTMLButtonElement;
  let start: ReturnType<typeof vi.fn>;
  let end: ReturnType<typeof vi.fn>;
  let select: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    start = vi.fn();
    end = vi.fn();
    select = vi.fn();
    act(() => root.render(<PreviewableButton onPreviewStart={start} onPreviewEnd={end} onClick={select}>候选</PreviewableButton>));
    button = container.querySelector('button')!;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('previews for mouse pointer entry and keyboard-visible focus only', () => {
    act(() => button.dispatchEvent(pointer('pointerover', { pointerType: 'mouse' })));
    expect(start).toHaveBeenCalledTimes(1);
    act(() => button.dispatchEvent(pointer('pointerout', { pointerType: 'mouse' })));
    expect(end).toHaveBeenCalledTimes(1);

    vi.spyOn(button, 'matches').mockImplementation(selector => selector === ':focus-visible');
    act(() => button.dispatchEvent(new FocusEvent('focusin', { bubbles: true })));
    expect(start).toHaveBeenCalledTimes(2);
    act(() => button.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(end).toHaveBeenCalledTimes(2);

    vi.mocked(button.matches).mockReturnValue(false);
    act(() => button.dispatchEvent(new FocusEvent('focusin', { bubbles: true })));
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('starts touch preview at 350ms and suppresses only the matching long-press click', () => {
    act(() => button.dispatchEvent(pointer('pointerdown')));
    act(() => vi.advanceTimersByTime(349));
    expect(start).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(start).toHaveBeenCalledTimes(1);

    act(() => button.dispatchEvent(pointer('pointerup')));
    expect(end).toHaveBeenCalledTimes(1);
    act(() => button.click());
    expect(select).not.toHaveBeenCalled();
    act(() => vi.runOnlyPendingTimers());

    act(() => button.dispatchEvent(pointer('pointerdown', { pointerId: 2 })));
    act(() => button.dispatchEvent(pointer('pointerup', { pointerId: 2 })));
    act(() => button.click());
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('cancels the timer after movement beyond 8px while preserving small movement', () => {
    act(() => button.dispatchEvent(pointer('pointerdown', { clientX: 10, clientY: 10 })));
    act(() => button.dispatchEvent(pointer('pointermove', { clientX: 18, clientY: 10 })));
    act(() => vi.advanceTimersByTime(350));
    expect(start).toHaveBeenCalledTimes(1);
    act(() => button.dispatchEvent(pointer('pointerup')));

    act(() => button.dispatchEvent(pointer('pointerdown', { pointerId: 2, clientX: 10, clientY: 10 })));
    act(() => button.dispatchEvent(pointer('pointermove', { pointerId: 2, clientX: 19, clientY: 10 })));
    act(() => vi.advanceTimersByTime(350));
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('cleans active or pending touch preview on cancellation, lost capture, and unmount', () => {
    act(() => button.dispatchEvent(pointer('pointerdown')));
    act(() => button.dispatchEvent(pointer('pointercancel')));
    act(() => vi.advanceTimersByTime(350));
    expect(start).not.toHaveBeenCalled();

    act(() => button.dispatchEvent(pointer('pointerdown', { pointerId: 2 })));
    act(() => vi.advanceTimersByTime(350));
    expect(start).toHaveBeenCalledTimes(1);
    act(() => button.dispatchEvent(pointer('lostpointercapture', { pointerId: 2 })));
    expect(end).toHaveBeenCalledTimes(1);

    act(() => button.dispatchEvent(pointer('pointerdown', { pointerId: 3 })));
    act(() => vi.advanceTimersByTime(350));
    expect(start).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
    expect(end).toHaveBeenCalledTimes(2);
    root = createRoot(container);
  });
});
