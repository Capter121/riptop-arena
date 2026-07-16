import type { AnimationEvent, ReactNode } from 'react';
import type { FocusPhase } from './focusLifecycle';

export const FOCUS_PRESENTATION_ANIMATION_NAME = 'focus-presentation-cycle';

type FocusReadoutProps = {
  testId: string;
  phase: FocusPhase;
  sessionId: number;
  activeFramePainted: boolean;
  children: ReactNode;
  onPresentationComplete: (sessionId: number) => void;
};

export function FocusReadout({
  testId,
  phase,
  sessionId,
  activeFramePainted,
  children,
  onPresentationComplete,
}: FocusReadoutProps) {
  const presentationActive = phase === 'active' && activeFramePainted;

  const handleAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (
      !presentationActive
      || event.target !== event.currentTarget
      || event.animationName !== FOCUS_PRESENTATION_ANIMATION_NAME
    ) return;
    onPresentationComplete(sessionId);
  };

  return (
    <div
      className={`focus-readout${presentationActive ? ' presentation-active' : ''}`}
      data-focus-phase={phase}
      data-testid={testId}
      onAnimationEnd={handleAnimationEnd}
    >
      {children}
    </div>
  );
}
