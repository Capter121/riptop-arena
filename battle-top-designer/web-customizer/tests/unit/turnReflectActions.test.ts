// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BUILD } from '../../../../src/data/parts';
import { applyDamageResult } from '../../../../src/gameplay/damage';
import { TurnArbitrator } from '../../../../src/gameplay/battlePhysics';
import { TopEntity } from '../../../../src/gameplay/top';
import type { RandomSource } from '../../../../src/sim/rng';

const HIGH_RANDOM: RandomSource = {
  nextFloat: () => 0.99,
  nextUint32: () => 0xfd70_a3d7,
  nextInt: (min, maxExclusive) => min + Math.floor(0.99 * (maxExclusive - min)),
};

function turnRandom() {
  return { combat: HIGH_RANDOM, physics: HIGH_RANDOM };
}

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  const gradient = { addColorStop: vi.fn() };
  const context = {
    createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(new Proxy(context, {
    get: (target, property) => target[property as keyof typeof target] ?? vi.fn(),
    set: (target, property, value) => {
      Object.assign(target, { [property]: value });
      return true;
    },
  }) as never);
});

function createTops() {
  return {
    player: new TopEntity('player', DEFAULT_BUILD),
    enemy: new TopEntity('enemy', DEFAULT_BUILD),
  };
}

describe('turn reflect actions', () => {
  it('returns scaled light-reflect damage without mutating either top during arbitration', () => {
    const { player, enemy } = createTops();
    const playerIntegrity = player.integrity;
    const enemyIntegrity = enemy.integrity;

    const result = new TurnArbitrator().executeTurnResolution(
      { kind: 'attack', skillId: 'wind_blade' },
      { kind: 'light_reflect' },
      player,
      enemy,
      1,
      turnRandom(),
    );

    expect(result.kind).toBe('defense_success');
    expect(result.enemySpiritDelta).toBe(-10);
    expect(result.damageResults).toHaveLength(2);
    expect(result.damageResults?.map((damage) => damage.defender)).toEqual(['player', 'enemy']);
    expect(player.integrity).toBe(playerIntegrity);
    expect(enemy.integrity).toBe(enemyIntegrity);

    for (const damage of result.damageResults ?? []) {
      applyDamageResult(damage.defender === 'player' ? player : enemy, damage);
    }
    expect(player.integrity).toBeLessThan(playerIntegrity);
    expect(enemy.integrity).toBeLessThan(enemyIntegrity);
    expect(playerIntegrity - player.integrity).toBeGreaterThan(enemyIntegrity - enemy.integrity);
  });

  it('reflects tier-five attacks only with heavy reflect', () => {
    const heavy = createTops();
    const heavyResult = new TurnArbitrator().executeTurnResolution(
      { kind: 'attack', skillId: 'phantom_clone' },
      { kind: 'heavy_reflect' },
      heavy.player,
      heavy.enemy,
      1,
      turnRandom(),
    );
    expect(heavyResult.kind).toBe('defense_success');
    expect(heavyResult.enemySpiritDelta).toBe(-20);
    expect(heavyResult.damageResults).toHaveLength(2);

    const light = createTops();
    const lightResult = new TurnArbitrator().executeTurnResolution(
      { kind: 'attack', skillId: 'phantom_clone' },
      { kind: 'light_reflect' },
      light.player,
      light.enemy,
      1,
      turnRandom(),
    );
    expect(lightResult.kind).toBe('defense_fail');
    expect(lightResult.damageResults).toHaveLength(1);
    expect(lightResult.damageResults?.[0].defender).toBe('enemy');
  });
});
