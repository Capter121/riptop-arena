export class EnergySystem {
  playerEnergy = 3;
  enemyEnergy = 3;
  readonly maxEnergy = 10;

  private regenTimer = { player: 0, enemy: 0 };
  private regenDelay = { player: 0, enemy: 0 };
  
  readonly regenRate = 1.0; // 1 energy per second
  readonly regenDelayTime = 1.5; // Wait 1.5s after spending

  reset() {
    this.playerEnergy = 3;
    this.enemyEnergy = 3;
    this.regenDelay = { player: 0, enemy: 0 };
  }

  add(side: 'player' | 'enemy', amount: number) {
    if (side === 'player') {
      this.playerEnergy = Math.min(this.maxEnergy, Math.max(0, this.playerEnergy + amount));
      if (amount < 0) this.regenDelay.player = this.regenDelayTime;
    } else {
      this.enemyEnergy = Math.min(this.maxEnergy, Math.max(0, this.enemyEnergy + amount));
      if (amount < 0) this.regenDelay.enemy = this.regenDelayTime;
    }
  }

  set(side: 'player' | 'enemy', value: number) {
    if (side === 'player') {
      this.playerEnergy = Math.min(this.maxEnergy, Math.max(0, value));
    } else {
      this.enemyEnergy = Math.min(this.maxEnergy, Math.max(0, value));
    }
  }

  update(dt: number) {
    (['player', 'enemy'] as const).forEach(side => {
      if (this.regenDelay[side] > 0) {
        this.regenDelay[side] -= dt;
      } else {
        this.regenTimer[side] += dt;
        if (this.regenTimer[side] >= 1.0 / this.regenRate) {
          this.regenTimer[side] = 0;
          this.add(side, 1);
        }
      }
    });
  }

  get(side: 'player' | 'enemy') {
    return side === 'player' ? this.playerEnergy : this.enemyEnergy;
  }

  canAfford(side: 'player' | 'enemy', amount: number) {
    return this.get(side) >= amount;
  }
}
