import type { TopEntity } from './top';

export function clearTransientFlags(top: TopEntity) {
  top.flags.burstResolvedThisFrame = false;
  top.flags.ignoreNextCollisionDamage = false;
}
