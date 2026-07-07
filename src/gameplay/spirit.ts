import { clamp } from '../utils/math';
import type { SpiritState } from '../types/battle';
import type { TopEntity } from './top';

export class SpiritSystem {
  readonly regenRate = 8;

  get(top: TopEntity): SpiritState {
    return {
      current: top.spirit,
      max: top.maxSpirit,
    };
  }

  set(top: TopEntity, value: number) {
    top.spirit = clamp(value, 0, top.maxSpirit);
  }

  canAfford(top: TopEntity, cost: number) {
    return top.spirit >= cost;
  }

  spend(top: TopEntity, cost: number) {
    if (!this.canAfford(top, cost)) return false;
    this.set(top, top.spirit - cost);
    return true;
  }

  update(top: TopEntity, dt: number) {
    if (dt <= 0 || top.spirit >= top.maxSpirit) return;
    this.set(top, top.spirit + this.regenRate * dt);
  }
}
