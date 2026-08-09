import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  AFFINITIES,
  AFFINITY_DAMAGE_RULES,
  getAffinityRelation,
  type PartAffinity,
} from '../../battle-top-designer/shared/nss/affinity';
import type { BattleAffinityProfile } from '../../src/gameplay/battleAffinity';
import { BattlePhysicsSystem, TurnArbitrator } from '../../src/gameplay/battlePhysics';
import { buildStats, type BattleStats } from '../../src/gameplay/build';
import {
  calculateTurnDamage,
  scaleDamageResult,
  type DamageResult,
} from '../../src/gameplay/damage';
import type { TopEntity } from '../../src/gameplay/top';
import { DEFAULT_BUILD } from '../../src/data/parts';
import { EventBus } from '../../src/utils/events';
import type { RandomSource } from '../../src/sim/rng';

function constantRandom(value: number): RandomSource {
  return {
    nextFloat: () => value,
    nextUint32: () => Math.floor(value * 0x1_0000_0000) >>> 0,
    nextInt: (min, maxExclusive) => min + Math.floor(value * (maxExclusive - min)),
  };
}

function turnRandom(value: number) {
  return { combat: constantRandom(value), physics: constantRandom(value) };
}

const IDENTITY_MODIFIERS = {
  elementalPower: 1,
  defenseMultiplier: 1,
  spinDrainMultiplier: 1,
  tiltGrowthMultiplier: 1,
} as const;

function affinity(primary: PartAffinity | null, elementalPower = 1): BattleAffinityProfile {
  if (!primary) {
    return { source: 'neutral', primary: null, resonance: { kind: 'none' }, modifiers: IDENTITY_MODIFIERS };
  }
  return {
    source: 'nss',
    primary,
    resonance: elementalPower > 1
      ? { kind: 'offense', affinity: primary, count: 5, bonus: elementalPower - 1 }
      : { kind: 'none' },
    modifiers: { ...IDENTITY_MODIFIERS, elementalPower },
  };
}

function battleStats(profile: BattleAffinityProfile, overrides: Partial<BattleStats> = {}): BattleStats {
  return {
    ...buildStats(DEFAULT_BUILD),
    attack: 0,
    armor: 30,
    evasion: 0,
    critChance: 0,
    critMultiplier: 2,
    affinity: profile,
    ...overrides,
  };
}

function damageTop(side: 'player' | 'enemy', profile: BattleAffinityProfile, overrides: Partial<BattleStats> = {}) {
  return { side, stats: battleStats(profile, overrides) } as TopEntity;
}

function turnTop(side: 'player' | 'enemy', profile: BattleAffinityProfile) {
  return {
    side,
    stats: battleStats(profile),
    spirit: 100,
    freeDefensiveMoves: 3,
  } as TopEntity;
}

function calculate(attacker: TopEntity, defender: TopEntity, overrides: Partial<Parameters<typeof calculateTurnDamage>[0]> = {}) {
  return calculateTurnDamage({
    attacker,
    defender,
    skillTier: 1,
    isCounter: false,
    isClash: false,
    isBlockOrMiss: false,
    random: constantRandom(0.5),
    ...overrides,
  });
}

describe('elemental active damage', () => {
  it('covers every 7x7 affinity relation with an 80/20 split', () => {
    for (const attackerAffinity of AFFINITIES) {
      for (const defenderAffinity of AFFINITIES) {
        const result = calculate(
          damageTop('player', affinity(attackerAffinity)),
          damageTop('enemy', affinity(defenderAffinity)),
        );
        const relation = getAffinityRelation(attackerAffinity, defenderAffinity);
        const relationMultiplier = relation === 'advantage'
          ? AFFINITY_DAMAGE_RULES.advantageMultiplier
          : relation === 'disadvantage'
            ? AFFINITY_DAMAGE_RULES.disadvantageMultiplier
            : AFFINITY_DAMAGE_RULES.neutralMultiplier;
        const combinedRaw = 400 * AFFINITY_DAMAGE_RULES.physicalShare
          + 400 * AFFINITY_DAMAGE_RULES.elementalShare * relationMultiplier;

        expect(result.attackerAffinity).toBe(attackerAffinity);
        expect(result.defenderAffinity).toBe(defenderAffinity);
        expect(result.affinityRelation).toBe(relation);
        expect(result.finalDamage).toBe(Math.round(combinedRaw * 0.5 + 1e-9));
        expect(result.physicalDamage + result.elementalDamage).toBe(result.finalDamage);
        expect(result.resonanceContribution).toBe(0);
        expect(result.relationContribution).toBe(result.finalDamage - 200);
      }
    }
  });

  it('treats a missing primary as neutral and preserves the old result exactly', () => {
    const neutral = calculate(
      damageTop('player', affinity(null)),
      damageTop('enemy', affinity('FIRE')),
    );
    expect(neutral).toMatchObject({
      rawDamage: 400,
      finalDamage: 200,
      physicalDamage: 160,
      elementalDamage: 40,
      attackerAffinity: null,
      defenderAffinity: 'FIRE',
      affinityRelation: 'neutral',
      resonanceContribution: 0,
      relationContribution: 0,
      armorReduced: 200,
    });
  });

  it.each([
    [1.06, 202, 2],
    [1.10, 204, 4],
    [1.15, 206, 6],
  ] as const)('supports offense power %s before relation adjustment', (elementalPower, finalDamage, contribution) => {
    const result = calculate(
      damageTop('player', affinity('FIRE', elementalPower)),
      damageTop('enemy', affinity('FIRE')),
    );
    expect(result.finalDamage).toBe(finalDamage);
    expect(result.resonanceContribution).toBe(contribution);
    expect(result.relationContribution).toBe(0);
  });

  it('applies maximum offense resonance and advantage only to the elemental share', () => {
    const result = calculate(
      damageTop('player', affinity('FIRE', 1.15)),
      damageTop('enemy', affinity('WOOD')),
    );
    expect(result).toMatchObject({
      rawDamage: 400,
      finalDamage: 218,
      physicalDamage: 160,
      elementalDamage: 58,
      affinityRelation: 'advantage',
      resonanceContribution: 6,
      relationContribution: 12,
      armorReduced: 217,
    });
  });

  it('keeps crit, counter, and clash rules ahead of affinity calculation', () => {
    const attacker = damageTop('player', affinity('WATER'), { critChance: 1 });
    const defender = damageTop('enemy', affinity('FIRE'));
    const critical = calculate(attacker, defender, { random: constantRandom(0) });
    const counter = calculate(attacker, defender, { isCounter: true });
    const clash = calculate(attacker, defender, { isClash: true, contextMultiplier: 0.5 });

    expect(critical.rawDamage).toBe(800);
    expect(critical.didCrit).toBe(true);
    expect(counter.rawDamage).toBe(700);
    expect(counter.tags).toContain('counter');
    expect(clash.rawDamage).toBe(200);
    expect(clash.tags).toContain('clash');
    for (const result of [critical, counter, clash]) {
      expect(result.affinityRelation).toBe('advantage');
      expect(result.physicalDamage + result.elementalDamage).toBe(result.finalDamage);
    }
  });

  it('returns zero-valued components and contributions for blocks and misses', () => {
    const attacker = damageTop('player', affinity('FIRE', 1.15));
    const defender = damageTop('enemy', affinity('WOOD'), { evasion: 1 });
    const blocked = calculate(attacker, defender, { isBlockOrMiss: true });
    const missed = calculate(attacker, defender, { random: constantRandom(0) });

    for (const result of [blocked, missed]) {
      expect(result.finalDamage).toBe(0);
      expect(result.physicalDamage).toBe(0);
      expect(result.elementalDamage).toBe(0);
      expect(result.resonanceContribution).toBe(0);
      expect(result.relationContribution).toBe(0);
      expect(result.affinityRelation).toBe('advantage');
    }
  });

  it('scales all reflected components and rebalances integer remainder', () => {
    const original = calculate(
      damageTop('player', affinity('FIRE', 1.15)),
      damageTop('enemy', affinity('WOOD')),
    );
    const scaled = scaleDamageResult(original, 0.5, 'player');

    expect(scaled.finalDamage).toBe(109);
    expect(scaled.physicalDamage + scaled.elementalDamage).toBe(109);
    expect(scaled.resonanceContribution + scaled.relationContribution).toBe(9);
    expect(scaled.attackerAffinity).toBe('FIRE');
    expect(scaled.defenderAffinity).toBe('WOOD');
    expect(scaled.affinityRelation).toBe('advantage');
  });

  it.each([
    ['wind_blade', 'light_reflect'],
    ['blazing_meteor', 'heavy_reflect'],
  ] as const)('keeps successful %s reflection affinity and makes reflector recoil neutral physical', (skillId, reflectKind) => {
    const player = turnTop('player', affinity('FIRE', 1.15));
    const enemy = turnTop('enemy', affinity('WOOD'));
    const resolution = new TurnArbitrator().executeTurnResolution(
      { kind: 'attack', skillId },
      { kind: reflectKind },
      player,
      enemy,
      0,
      turnRandom(0),
    );
    const [reflected, recoil] = resolution.damageResults as [DamageResult, DamageResult];

    expect(resolution.kind).toBe('defense_success');
    expect(reflected).toMatchObject({
      defender: 'player',
      attackerAffinity: 'FIRE',
      defenderAffinity: 'FIRE',
      affinityRelation: 'neutral',
    });
    expect(reflected.physicalDamage + reflected.elementalDamage).toBe(reflected.finalDamage);
    expect(recoil).toMatchObject({
      defender: 'enemy',
      attackerAffinity: null,
      defenderAffinity: 'WOOD',
      affinityRelation: 'neutral',
      elementalDamage: 0,
      resonanceContribution: 0,
      relationContribution: 0,
    });
    expect(recoil.physicalDamage).toBe(recoil.finalDamage);
  });

  it('uses normal affinity damage when a reflection tier fails', () => {
    const resolution = new TurnArbitrator().executeTurnResolution(
      { kind: 'attack', skillId: 'blazing_meteor' },
      { kind: 'light_reflect' },
      turnTop('player', affinity('FIRE')),
      turnTop('enemy', affinity('WOOD')),
      0,
      turnRandom(0.5),
    );
    expect(resolution.kind).toBe('defense_fail');
    expect(resolution.damageResults?.[0]).toMatchObject({
      attackerAffinity: 'FIRE',
      defenderAffinity: 'WOOD',
      affinityRelation: 'advantage',
    });
  });

  it('leaves direct collision impulse damage independent of affinity', () => {
    const createCollisionTop = (side: 'player' | 'enemy', profile: BattleAffinityProfile, x: number) => ({
      side,
      stats: battleStats(profile),
      position: new THREE.Vector2(x, 0),
      velocity: new THREE.Vector2(),
      integrity: 100,
      shieldHits: 0,
      alive: true,
      flags: { burstResolvedThisFrame: false },
    }) as TopEntity;
    const player = createCollisionTop('player', affinity('FIRE', 1.15), -1);
    const enemy = createCollisionTop('enemy', affinity('WOOD'), 1);

    new BattlePhysicsSystem(new EventBus()).applyClashImpulse(player, enemy, 1.4, 1.4, 8, 12);

    expect(player.integrity).toBe(92);
    expect(enemy.integrity).toBe(88);
  });
});
