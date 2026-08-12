import { describe, expect, it } from 'vitest';
import { BattleRuntime } from '../../src/sim/battleRuntime';
import { resolveModifiers } from '../../src/gameplay/modifiers';
import type { TopEntity } from '../../src/gameplay/top';

const SEED = '0123456789abcdef0123456789abcdef';
const LAUNCH = { playerPower: 0.8, playerAngleDeg: 5, enemyPower: 0.84, enemyAngleDeg: -3 };

describe('battle simulation boundaries', () => {
  it('keeps all modifiers at their existing defaults without survival tuning', () => {
    const top = {
      tacticalMode: 'balance', statusEffects: [], flags: { ignoreNextCollisionDamage: false }, hasRubberTip: false,
      survivalCombatTuning: null,
    } as unknown as TopEntity;
    expect(resolveModifiers(top)).toEqual({
      attackMultiplier: 1, defenseMultiplier: 1, staminaDrainMultiplier: 1,
      burstResistanceMultiplier: 1, collisionImpulseMultiplier: 1, wallGripMultiplier: 1,
      damageMultiplier: 1, spinLossMultiplier: 1, dashImpulseMultiplier: 1,
      lockStabilityLossMultiplier: 1, velocityReflectionMultiplier: 1,
    });
  });

  it('records the same fixed ticks and voice bytes at 30Hz and 144Hz', () => {
    const run = (fps: number) => {
      const runtime = new BattleRuntime(SEED);
      runtime.beginLaunch(LAUNCH);
      for (let frame = 0; frame < fps; frame += 1) {
        runtime.advance(1 / fps, 128, true, () => undefined);
      }
      return runtime;
    };
    const slow = run(30);
    const fast = run(144);
    expect(slow.tickCount).toBe(60);
    expect(fast.tickCount).toBe(60);
    expect(slow.inputLog?.playerVoiceFrames).toEqual(fast.inputLog?.playerVoiceFrames);
    expect(slow.decisionTicks).toBe(60);
    expect(fast.decisionTicks).toBe(60);
  });

  it('samples replay voice independently for every fixed tick in a catch-up frame', () => {
    const runtime = new BattleRuntime(SEED);
    runtime.beginLaunch(LAUNCH);
    runtime.advance(3 / 60, tickIndex => 40 + tickIndex, false, () => undefined);
    expect(runtime.inputLog?.playerVoiceFrames).toEqual([40, 41, 42]);
  });

  it('records a turn at the current decision tick and resets the counter', () => {
    const runtime = new BattleRuntime(SEED);
    runtime.beginLaunch(LAUNCH);
    runtime.advance(3 / 60, 0, true, () => undefined);
    runtime.recordTurn({ kind: 'charge' }, { kind: 'defense' });
    expect(runtime.inputLog?.turns[0]).toMatchObject({ turnIndex: 1, decisionTicks: 3 });
    expect(runtime.decisionTicks).toBe(0);
  });

  it('keeps the boost window authoritative for exactly 180 ticks', () => {
    const runtime = new BattleRuntime(SEED);
    runtime.beginLaunch(LAUNCH);
    runtime.startVoiceBoost();
    let activeTicks = 0;
    for (let tick = 0; tick < 180; tick += 1) {
      runtime.advance(1 / 60, 0, false, input => {
        if (input.voiceBoostActive) activeTicks += 1;
      });
    }
    expect(activeTicks).toBe(180);
    expect(runtime.voiceBoostSecondsRemaining).toBe(0);
  });

  it('creates fresh stream and clock state for each battle runtime', () => {
    const first = new BattleRuntime(SEED);
    first.beginLaunch(LAUNCH);
    first.advance(1 / 60, 0, false, () => undefined);
    const second = new BattleRuntime(SEED);
    second.beginLaunch(LAUNCH);
    expect(second.tickCount).toBe(0);
    expect(second.context.random.combat.nextUint32()).toBe(new BattleRuntime(SEED).context.random.combat.nextUint32());
  });

  it('stops catch-up ticks when a battle ends inside the callback', () => {
    const runtime = new BattleRuntime(SEED);
    runtime.beginLaunch(LAUNCH);
    runtime.advance(1 / 30, 64, false, () => false);
    expect(runtime.tickCount).toBe(1);
    expect(runtime.inputLog?.playerVoiceFrames).toEqual([64]);
  });
});
