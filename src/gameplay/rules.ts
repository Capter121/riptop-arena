import { ARENA_RADIUS, ROUND_TIME } from '../app/config';
import type { TopEntity, TopSide } from './top';

export type FinishKind = 'ring out' | 'spin finish' | 'burst finish' | 'timeout';

export type BattleResult = {
  winner: TopSide;
  loser: TopSide;
  kind: FinishKind;
  label: string;
};

export class RuleSystem {
  timeLeft = ROUND_TIME;

  reset() {
    this.timeLeft = ROUND_TIME;
  }

  update(player: TopEntity, enemy: TopEntity, dt: number, mode: 'quick' | 'tournament' | 'survival' = 'quick'): BattleResult | null {
    this.timeLeft = Math.max(0, this.timeLeft - dt);

    const playerRadius = player.position.length();
    const enemyRadius = enemy.position.length();

    if (playerRadius > ARENA_RADIUS + 0.8) {
      player.setEliminated();
      return { winner: 'enemy', loser: 'player', kind: 'ring out', label: '击出场外' };
    }

    if (enemyRadius > ARENA_RADIUS + 0.8) {
      enemy.setEliminated();
      return { winner: 'player', loser: 'enemy', kind: 'ring out', label: '击出场外' };
    }

    if (!player.alive || player.integrity <= 0) {
      return { winner: 'enemy', loser: 'player', kind: 'burst finish', label: '爆裂终结' };
    }

    if (!enemy.alive || enemy.integrity <= 0) {
      return { winner: 'player', loser: 'enemy', kind: 'burst finish', label: '爆裂终结' };
    }

    if (player.spin <= 1 || player.stamina <= 1) {
      player.setEliminated();
      return { winner: 'enemy', loser: 'player', kind: 'spin finish', label: '停转终结' };
    }

    if (enemy.spin <= 1 || enemy.stamina <= 1) {
      enemy.setEliminated();
      return { winner: 'player', loser: 'enemy', kind: 'spin finish', label: '停转终结' };
    }

    if (this.timeLeft <= 0 && mode !== 'survival') {
      const playerScore = player.spin + player.integrity * 0.35 + player.stats.defense * 4;
      const enemyScore = enemy.spin + enemy.integrity * 0.35 + enemy.stats.defense * 4;
      return playerScore >= enemyScore
        ? { winner: 'player', loser: 'enemy', kind: 'timeout', label: '生存终结' }
        : { winner: 'enemy', loser: 'player', kind: 'timeout', label: '生存终结' };
    }

    return null;
  }
}
