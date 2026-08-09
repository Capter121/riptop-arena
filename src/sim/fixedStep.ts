export const FIXED_BATTLE_DT = 1 / 60;
export const MAX_BATTLE_STEPS_PER_FRAME = 4;

const TICK_EPSILON = 1e-10;

export class FixedStepClock {
  private accumulator = 0;
  tickCount = 0;

  get pendingTime() {
    return this.accumulator;
  }

  reset() {
    this.accumulator = 0;
    this.tickCount = 0;
  }

  advance(frameDt: number, onTick: (dt: number, tick: number) => boolean | void) {
    if (!Number.isFinite(frameDt) || frameDt < 0) {
      throw new RangeError('Frame delta must be a finite non-negative number.');
    }

    this.accumulator += frameDt;
    let steps = 0;
    while (
      steps < MAX_BATTLE_STEPS_PER_FRAME
      && this.accumulator + TICK_EPSILON >= FIXED_BATTLE_DT
    ) {
      this.accumulator -= FIXED_BATTLE_DT;
      if (Math.abs(this.accumulator) < TICK_EPSILON) this.accumulator = 0;
      this.tickCount += 1;
      steps += 1;
      if (onTick(FIXED_BATTLE_DT, this.tickCount) === false) break;
    }
    return steps;
  }
}
