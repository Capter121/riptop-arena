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
let pendingCombinationId: string | null = null;

export function markOnce(name: Phase3bMark, target: Performance = performance) {
  if (target.getEntriesByName(name).length === 0) target.mark(name);
}

export function beginPartSwitch(metaOrTarget?: CachedSwitchMeta | Performance, explicitTarget: Performance = performance) {
  const metadata = metaOrTarget && !('mark' in metaOrTarget) ? metaOrTarget : undefined;
  const target = metaOrTarget && 'mark' in metaOrTarget ? metaOrTarget : explicitTarget;
  target.mark('phase3b:part-switch-start');
  switchPending = true;
  pendingCombinationId = metadata?.combinationId ?? null;
  if (metadata) beginCachedSwitch(metadata);
}

export function isPartSwitchPending() { return switchPending; }
export function pendingPartSwitchCombinationId() { return pendingCombinationId; }

export function endPartSwitch(target: Performance = performance): boolean {
  if (!switchPending) return false;
  target.mark('phase3b:part-switch-end');
  target.measure('phase3b:part-switch-duration', 'phase3b:part-switch-start', 'phase3b:part-switch-end');
  switchPending = false;
  pendingCombinationId = null;
  return true;
}
import { beginCachedSwitch, type CachedSwitchMeta } from './cachedSwitchDiagnostics';
