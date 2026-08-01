import { useEffect, useRef, type ButtonHTMLAttributes, type PointerEvent as ReactPointerEvent } from 'react';

type PreviewableButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>,
  'onPointerEnter' | 'onPointerLeave' | 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onLostPointerCapture' | 'onFocus' | 'onBlur'
> & {
  onPreviewStart: () => void;
  onPreviewEnd: () => void;
  previewDisabled?: boolean;
};

type TouchState = { pointerId: number; x: number; y: number };
type PreviewSource = 'mouse' | 'focus' | 'touch';

export function PreviewableButton({ onPreviewStart, onPreviewEnd, previewDisabled = false, onClick, ...props }: PreviewableButtonProps) {
  const startRef = useRef(onPreviewStart);
  const endRef = useRef(onPreviewEnd);
  const sourcesRef = useRef(new Set<PreviewSource>());
  const touchRef = useRef<TouchState | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const suppressResetRef = useRef<number | null>(null);
  startRef.current = onPreviewStart;
  endRef.current = onPreviewEnd;

  const clearHoldTimer = () => {
    if (holdTimerRef.current === null) return;
    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  };

  const begin = (source: PreviewSource) => {
    if (previewDisabled || sourcesRef.current.has(source)) return;
    const wasEmpty = sourcesRef.current.size === 0;
    sourcesRef.current.add(source);
    if (wasEmpty) startRef.current();
  };

  const end = (source: PreviewSource) => {
    if (!sourcesRef.current.delete(source)) return;
    if (sourcesRef.current.size === 0) endRef.current();
  };

  const releaseCapture = (event: ReactPointerEvent<HTMLButtonElement>, pointerId: number) => {
    try {
      if (event.currentTarget.hasPointerCapture?.(pointerId)) event.currentTarget.releasePointerCapture(pointerId);
    } catch { /* The browser may have already released capture after cancellation. */ }
  };

  const finishTouch = (event: ReactPointerEvent<HTMLButtonElement>, suppressClick: boolean) => {
    const touch = touchRef.current;
    if (!touch || touch.pointerId !== event.pointerId) return;
    clearHoldTimer();
    const wasPreviewing = sourcesRef.current.has('touch');
    end('touch');
    touchRef.current = null;
    releaseCapture(event, touch.pointerId);
    if (!suppressClick || !wasPreviewing) return;
    suppressClickRef.current = true;
    if (suppressResetRef.current !== null) window.clearTimeout(suppressResetRef.current);
    suppressResetRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      suppressResetRef.current = null;
    }, 0);
  };

  useEffect(() => {
    if (!previewDisabled) return;
    clearHoldTimer();
    touchRef.current = null;
    if (sourcesRef.current.size > 0) {
      sourcesRef.current.clear();
      endRef.current();
    }
  }, [previewDisabled]);

  useEffect(() => () => {
    clearHoldTimer();
    if (suppressResetRef.current !== null) window.clearTimeout(suppressResetRef.current);
    if (sourcesRef.current.size > 0) endRef.current();
    sourcesRef.current.clear();
  }, []);

  return (
    <button
      {...props}
      onPointerEnter={event => { if (event.pointerType === 'mouse') begin('mouse'); }}
      onPointerLeave={event => { if (event.pointerType === 'mouse') end('mouse'); }}
      onFocus={event => { if (event.currentTarget.matches(':focus-visible')) begin('focus'); }}
      onBlur={() => end('focus')}
      onPointerDown={event => {
        if (event.pointerType !== 'touch' || previewDisabled) return;
        const pointerId = event.pointerId;
        clearHoldTimer();
        touchRef.current = { pointerId, x: event.clientX, y: event.clientY };
        try { event.currentTarget.setPointerCapture?.(pointerId); } catch { /* Capture is an enhancement. */ }
        holdTimerRef.current = window.setTimeout(() => {
          holdTimerRef.current = null;
          if (touchRef.current?.pointerId === pointerId) begin('touch');
        }, 350);
      }}
      onPointerMove={event => {
        const touch = touchRef.current;
        if (!touch || touch.pointerId !== event.pointerId) return;
        if (Math.hypot(event.clientX - touch.x, event.clientY - touch.y) <= 8) return;
        clearHoldTimer();
        end('touch');
        touchRef.current = null;
        releaseCapture(event, touch.pointerId);
      }}
      onPointerUp={event => finishTouch(event, true)}
      onPointerCancel={event => finishTouch(event, false)}
      onLostPointerCapture={event => finishTouch(event, false)}
      onClick={event => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          if (suppressResetRef.current !== null) window.clearTimeout(suppressResetRef.current);
          suppressResetRef.current = null;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onClick?.(event);
      }}
    />
  );
}
