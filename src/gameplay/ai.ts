import type { EnemyPreset } from '../data/enemies';
import { TUNING } from '../data/tuning';
import type { TopEntity } from './top';

export class ArenaAI {
  private readonly preset: EnemyPreset;

  constructor(preset: EnemyPreset) {
    this.preset = preset;
  }

  update(self: TopEntity, target: TopEntity, dt: number, arenaRatio: number) {
    if (!self.alive) return;

    const dx = target.position.x - self.position.x;
    const dz = target.position.y - self.position.y;
    const dist = Math.max(Math.hypot(dx, dz), 0.01);
    const seek = ((0.65 + this.preset.aggression * 0.7) * TUNING.aiSeekStrength * dt) / dist;

    self.velocity.x += dx * seek;
    self.velocity.y += dz * seek;

    if (arenaRatio > 0.82) {
      self.velocity.x -= self.position.x * dt * 1.9;
      self.velocity.y -= self.position.y * dt * 1.9;
    }
  }
}
