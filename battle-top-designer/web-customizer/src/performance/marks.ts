export const PHASE3B_MARKS = [
  'phase3b:shell-ready',
  'phase3b:scene-runtime-loaded',
  'phase3b:first-model-ready',
  'phase3b:interaction-ready',
  'phase3b:part-switch-start',
  'phase3b:part-switch-end',
] as const;

export type Phase3bMark = (typeof PHASE3B_MARKS)[number];

let switchPending = false;

export function markOnce(name: Phase3bMark, target: Performance = performance) {
  if (target.getEntriesByName(name).length === 0) target.mark(name);
}

export function beginPartSwitch(target: Performance = performance) {
  target.mark('phase3b:part-switch-start');
  switchPending = true;
}

export function endPartSwitch(target: Performance = performance): boolean {
  if (!switchPending) return false;
  target.mark('phase3b:part-switch-end');
  target.measure('phase3b:part-switch-duration', 'phase3b:part-switch-start', 'phase3b:part-switch-end');
  switchPending = false;
  return true;
}
