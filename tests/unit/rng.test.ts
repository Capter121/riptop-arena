import { describe, expect, it } from 'vitest';
import {
  BATTLE_RANDOM_DOMAINS,
  CURRENT_SIMULATION_VERSION,
  BattleSeedError,
  createBattleSeed,
  createBattleSimulationContext,
  parseBattleSeed,
} from '../../src/sim/battleSeed';
import { createMulberry32 } from '../../src/sim/rng';

const SEED = '0123456789abcdef0123456789abcdef';

describe('deterministic battle RNG', () => {
  it('accepts only canonical 128-bit lowercase hexadecimal seeds', () => {
    expect(parseBattleSeed(SEED)).toBe(SEED);
    for (const invalid of ['', '0'.repeat(31), '0'.repeat(33), 'G'.repeat(32), 'ABCDEF'.repeat(5) + 'AB']) {
      expect(() => parseBattleSeed(invalid)).toThrowError(BattleSeedError);
      try {
        parseBattleSeed(invalid);
      } catch (error) {
        expect(error).toMatchObject({ code: 'INVALID_BATTLE_SEED' });
      }
    }
  });

  it('generates canonical local seeds', () => {
    const seed = createBattleSeed();
    expect(seed).toMatch(/^[0-9a-f]{32}$/);
  });

  it('exposes the shared simulation version and fixed domains', () => {
    expect(CURRENT_SIMULATION_VERSION).toBe(1);
    expect(BATTLE_RANDOM_DOMAINS).toEqual(['combat', 'ai', 'physics', 'spawn']);
  });

  it('recreates identical domain sequences from the same root seed', () => {
    const first = createBattleSimulationContext(SEED);
    const second = createBattleSimulationContext(SEED);

    for (const domain of BATTLE_RANDOM_DOMAINS) {
      expect(Array.from({ length: 8 }, () => first.random[domain].nextUint32()))
        .toEqual(Array.from({ length: 8 }, () => second.random[domain].nextUint32()));
    }
  });

  it('locks the simulation-v1 combat stream vector', () => {
    const context = createBattleSimulationContext(SEED);
    expect(Array.from({ length: 6 }, () => context.random.combat.nextUint32())).toEqual([
      3704244480,
      2545073914,
      1650065337,
      2325586331,
      3935219584,
      1806092016,
    ]);
  });

  it('keeps domain consumption isolated', () => {
    const first = createBattleSimulationContext(SEED);
    const second = createBattleSimulationContext(SEED);
    for (let index = 0; index < 20; index += 1) first.random.ai.nextUint32();

    expect(first.random.combat.nextUint32()).toBe(second.random.combat.nextUint32());
    expect(first.random.physics.nextUint32()).toBe(second.random.physics.nextUint32());
    expect(first.random.spawn.nextUint32()).toBe(second.random.spawn.nextUint32());
  });

  it('returns unsigned integers and half-open floating values', () => {
    const random = createMulberry32(0xffffffff);
    for (let index = 0; index < 1_000; index += 1) {
      const uint = random.nextUint32();
      const float = random.nextFloat();
      expect(Number.isInteger(uint)).toBe(true);
      expect(uint).toBeGreaterThanOrEqual(0);
      expect(uint).toBeLessThanOrEqual(0xffffffff);
      expect(float).toBeGreaterThanOrEqual(0);
      expect(float).toBeLessThan(1);
    }
  });

  it('returns integers from a half-open range', () => {
    const random = createMulberry32(123);
    const values = Array.from({ length: 200 }, () => random.nextInt(-3, 4));
    expect(values.every(value => Number.isInteger(value) && value >= -3 && value < 4)).toBe(true);
    expect(() => random.nextInt(1, 1)).toThrow(RangeError);
    expect(() => random.nextInt(2.5, 4)).toThrow(RangeError);
    expect(() => random.nextInt(1, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('rejects unsupported simulation versions before creating streams', () => {
    expect(() => createBattleSimulationContext(SEED, 2)).toThrowError(
      expect.objectContaining({ code: 'UNSUPPORTED_SIMULATION_VERSION' }),
    );
  });
});
