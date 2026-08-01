import * as THREE from 'three';
import { EnergySystem } from './energy';
import { arenaManager } from './arenaManager';
import {
  ARENA_RADIUS,
  ARENA_SLOPE_START,
  EDGE_GRIND_THRESHOLD,
  MAX_BURST,
  PLAYER_DASH_COOLDOWN,
  SLOPE_STEEPNESS,
  TOP_RADIUS,
} from '../app/config';
import { TUNING } from '../data/tuning';
import type { EventBus } from '../utils/events';
import { clamp } from '../utils/math';
import { resolveModifiers } from './modifiers';
import { SkillManager } from './skills';
import type { TopEntity } from './top';
import {
  ELEMENT_ATTACKS,
  MAX_SPIRIT,
  TURN_CHARGE_SPIRIT,
  type BattleSide,
  type TurnAction,
  type TurnVisual,
} from '../types/battle';
import { type DamageResult, calculateTurnDamage } from './damage';

export type TurnResolutionKind =
  | 'same_attack_cancel'
  | 'attack_overpower'
  | 'attack_catches_charge'
  | 'defense_success'
  | 'defense_fail'
  | 'evade_success'
  | 'evade_fail'
  | 'charge'
  | 'standoff'
  | 'qte_parry'
  | 'clash_qte';

export type TurnResolution = {
  kind: TurnResolutionKind;
  playerAction: TurnAction;
  aiAction: TurnAction;
  winner: BattleSide | null;
  loser: BattleSide | null;
  playerSpiritDelta: number;
  enemySpiritDelta: number;
  playerVisual: TurnVisual;
  enemyVisual: TurnVisual;
  safeNoSpinDamage: boolean;
  log: string;
  knockbackBoost?: number;
  firePenetration?: boolean;
  damageResults?: DamageResult[];
};

import type { ElementAttribute } from '../types/shopItems';

type TurnSpiritSnapshot = {
  playerSpirit: number;
  enemySpirit: number;
  turnIndex: number;
  playerAttributes?: Partial<Record<ElementAttribute, number>>;
  enemyAttributes?: Partial<Record<ElementAttribute, number>>;
  playerSpiritRegenBonus: number;
  enemySpiritRegenBonus: number;
};

function scaleDamageResult(result: DamageResult, ratio: number, defender: BattleSide): DamageResult {
  return {
    ...result,
    contextMultiplier: result.contextMultiplier * ratio,
    rawDamage: result.rawDamage * ratio,
    finalDamage: Math.round(result.finalDamage * ratio),
    armorReduced: Math.round(result.armorReduced * ratio),
    lockDamage: result.lockDamage * ratio,
    defender,
  };
}

export class TurnArbitrator {
  executeTurnResolution(playerAction: TurnAction, aiAction: TurnAction, player: TopEntity, enemy: TopEntity, turnIndex: number): TurnResolution {
    const spirit = {
      playerSpirit: player.spirit,
      enemySpirit: enemy.spirit,
      turnIndex: turnIndex,
      playerAttributes: player.stats.attributes,
      enemyAttributes: enemy.stats.attributes,
      playerSpiritRegenBonus: player.stats.spiritRegenBonus,
      enemySpiritRegenBonus: enemy.stats.spiritRegenBonus,
    };
    
    const playerSpiritDelta = this.getActionCost(playerAction, spirit.playerSpirit);
    const enemySpiritDelta = this.getActionCost(aiAction, spirit.enemySpirit);

    const finish = (
      kind: TurnResolutionKind,
      winner: BattleSide | null,
      loser: BattleSide | null,
      playerVisual: TurnVisual,
      enemyVisual: TurnVisual,
      log: string,
      safeNoSpinDamage = false,
      chargePlayer = false,
      chargeEnemy = false,
      knockbackBoost = 0,
      firePenetration = false,
      damageResults: DamageResult[] = [],
    ): TurnResolution => {
      const getCharge = (base: number, isLight: boolean, regenBonus: number) => {
        const gain = this.getChargeGain(base, regenBonus);
        return isLight ? gain * 2 : gain; // LIGHT: Double passive Spirit regen
      };

      const playerHasLight = (spirit.playerAttributes?.['LIGHT'] || 0) > 0;
      const enemyHasLight = (spirit.enemyAttributes?.['LIGHT'] || 0) > 0;

      return {
        kind,
        playerAction,
        aiAction,
        winner,
        loser,
        playerSpiritDelta: playerSpiritDelta + (chargePlayer ? getCharge(spirit.playerSpirit + playerSpiritDelta, playerHasLight, spirit.playerSpiritRegenBonus) : 0),
        enemySpiritDelta: enemySpiritDelta + (chargeEnemy ? getCharge(spirit.enemySpirit + enemySpiritDelta, enemyHasLight, spirit.enemySpiritRegenBonus) : 0),
        playerVisual,
        enemyVisual,
        safeNoSpinDamage,
        log,
        knockbackBoost,
        firePenetration,
        damageResults,
      };
    };

    if (playerAction.kind === 'attack' && aiAction.kind === 'attack') {
      const playerAttack = ELEMENT_ATTACKS[playerAction.skillId];
      const enemyAttack = ELEMENT_ATTACKS[aiAction.skillId];

      if (playerAttack.tier === enemyAttack.tier) {
        const pDivine = (spirit.playerAttributes?.['DIVINE'] || 0) > 0;
        const eDivine = (spirit.enemyAttributes?.['DIVINE'] || 0) > 0;
        
        if (pDivine && !eDivine) {
          const dmg = calculateTurnDamage({ attacker: player, defender: enemy, skillTier: playerAttack.tier, isCounter: false, isClash: false, isBlockOrMiss: false, contextMultiplier: 1.2 });
          return finish('attack_overpower', null, null, 'attack', 'hit', `${playerAttack.label} 触发神圣裁决(DIVINE)，强制赢得拼刀！`, false, false, false, 0, false, [dmg]);
        } else if (eDivine && !pDivine) {
          const dmg = calculateTurnDamage({ attacker: enemy, defender: player, skillTier: enemyAttack.tier, isCounter: false, isClash: false, isBlockOrMiss: false, contextMultiplier: 1.2 });
          return finish('attack_overpower', null, null, 'hit', 'attack', `${enemyAttack.label} 触发神圣裁决(DIVINE)，玩家被压制！`, false, false, false, 0, false, [dmg]);
        }

        return finish('clash_qte', null, null, 'clash', 'clash', `${playerAttack.label} 对 ${enemyAttack.label}：同级能量对撞，进入拼刀拔河！`, true);
      }

      if (playerAttack.tier > enemyAttack.tier) {
        const dmg = calculateTurnDamage({ attacker: player, defender: enemy, skillTier: playerAttack.tier, isCounter: false, isClash: false, isBlockOrMiss: false, contextMultiplier: 1.15 });
        return finish('attack_overpower', null, null, 'attack', 'hit', `${playerAttack.label} 高阶碾压 ${enemyAttack.label}，对手受到重创。`, false, false, false, 0, false, [dmg]);
      }

      const dmg = calculateTurnDamage({ attacker: enemy, defender: player, skillTier: enemyAttack.tier, isCounter: false, isClash: false, isBlockOrMiss: false, contextMultiplier: 1.15 });
      return finish('attack_overpower', null, null, 'hit', 'attack', `${enemyAttack.label} 高阶碾压 ${playerAttack.label}，玩家受到重创。`, false, false, false, 0, false, [dmg]);
    }

    if (playerAction.kind === 'attack') {
      return this.resolveAttackAgainstDefense('player', playerAction, aiAction, finish, player, enemy, spirit);
    }

    if (aiAction.kind === 'attack') {
      return this.resolveAttackAgainstDefense('enemy', aiAction, playerAction, finish, player, enemy, spirit);
    }

    const playerCharges = playerAction.kind === 'charge';
    const enemyCharges = aiAction.kind === 'charge';

    if (playerCharges || enemyCharges) {
      return finish(
        'charge',
        null,
        null,
        playerCharges ? 'charge' : playerAction.kind,
        enemyCharges ? 'charge' : aiAction.kind,
        playerCharges && enemyCharges ? '双方同步蓄能，能量核心升档。' : '无人进攻，蓄能方安全升档。',
        false,
        playerCharges,
        enemyCharges,
      );
    }

    return finish('standoff', null, null, playerAction.kind, aiAction.kind, '双方观望防线，没有产生有效打击。');
  }

  private resolveAttackAgainstDefense(
    attacker: BattleSide,
    attackAction: Extract<TurnAction, { kind: 'attack' }>,
    defenderAction: TurnAction,
    finish: (
      kind: TurnResolutionKind,
      winner: BattleSide | null,
      loser: BattleSide | null,
      playerVisual: TurnVisual,
      enemyVisual: TurnVisual,
      log: string,
      safeNoSpinDamage?: boolean,
      chargePlayer?: boolean,
      chargeEnemy?: boolean,
      knockbackBoost?: number,
      firePenetration?: boolean,
      damageResults?: DamageResult[],
    ) => TurnResolution,
    player: TopEntity,
    enemy: TopEntity,
    spirit: TurnSpiritSnapshot,
  ) {
    const defender: BattleSide = attacker === 'player' ? 'enemy' : 'player';
    const attack = ELEMENT_ATTACKS[attackAction.skillId];
    const attackerVisual: TurnVisual = 'attack';
    const playerIsAttacker = attacker === 'player';

    const attackerTop = playerIsAttacker ? player : enemy;
    const defenderTop = playerIsAttacker ? enemy : player;

    const attackerAttributes = playerIsAttacker ? spirit.playerAttributes : spirit.enemyAttributes;
    const defenderAttributes = playerIsAttacker ? spirit.enemyAttributes : spirit.playerAttributes;

    const visual = (defenderVisual: TurnVisual): [TurnVisual, TurnVisual] =>
      playerIsAttacker ? [attackerVisual, defenderVisual] : [defenderVisual, attackerVisual];

    if (defenderAction.kind === 'charge') {
      const [playerVisual, enemyVisual] = visual('hit');
      
      let hexLog = '';
      if (attackerTop.stats.perks?.includes('hex_transformation')) {
        defenderTop.isTransformedToSheep = true;
        hexLog = ' 邪恶镰刀触发！对手被变形为废塑料！';
      }

      const dmg = calculateTurnDamage({
        attacker: attackerTop,
        defender: defenderTop,
        skillTier: attack.tier,
        isCounter: true,
        isClash: false,
        isBlockOrMiss: false,
      });

      return finish(
        'attack_catches_charge',
        null,
        null,
        playerVisual,
        enemyVisual,
        `${attack.label} 抓住蓄能空档，触发反击重创！${hexLog}`,
        false, false, false, 0, false, [dmg]
      );
    }

    if (defenderAction.kind === 'light_reflect') {
      const isTier123 = attack.tier >= 1 && attack.tier <= 3;
      if (isTier123) {
        const [playerVisual, enemyVisual] = visual('defense');
        const reboundDmg = calculateTurnDamage({
          attacker: attackerTop,
          defender: attackerTop,
          skillTier: attack.tier,
          isCounter: false,
          isClash: false,
          isBlockOrMiss: false,
          contextMultiplier: 1.0,
        });

        // 轻反弹：大幅削弱为 15%~23% 的极低微骚扰反弹伤害
        const reflectReturnRatio = 0.15 + Math.random() * 0.08;
        const reflectPercent = Math.round(reflectReturnRatio * 100);
        const reflectedDamage = scaleDamageResult(reboundDmg, reflectReturnRatio, attacker);
        const attackerReflectDamage = reflectedDamage.finalDamage;

        // 反弹方承受 15%~25% 的轻微冲击余波
        const recoilRatio = 0.15 + Math.random() * 0.10;
        const recoilPercent = Math.round(recoilRatio * 100);
        const recoilDamage = scaleDamageResult(reboundDmg, reflectReturnRatio * recoilRatio, defender);
        const defenderSelfDamage = recoilDamage.finalDamage;

        return finish(
          defender === 'player' ? 'qte_parry' : 'defense_success',
          null,
          null,
          playerVisual,
          enemyVisual,
          `🛡️【轻反弹成功】拆解 ${attack.label} (Tier ${attack.tier})！对方仅承受 ${reflectPercent}% (${attackerReflectDamage}点) 战术反弹，${defender === 'player' ? '玩家' : '对手'}承受 ${recoilPercent}% (${defenderSelfDamage}点) 冲击余波！`,
          true,
          false,
          false,
          1.0,
          false,
          [reflectedDamage, recoilDamage]
        );
      } else {
        const [playerVisual, enemyVisual] = visual('hit');
        const dmg = calculateTurnDamage({
          attacker: attackerTop,
          defender: defenderTop,
          skillTier: attack.tier,
          isCounter: false,
          isClash: false,
          isBlockOrMiss: false,
        });
        return finish(
          'defense_fail',
          null,
          null,
          playerVisual,
          enemyVisual,
          `💥【轻反弹碎裂】对方施展了 ${attack.label} (Tier ${attack.tier}) 高阶大招！轻盾被瞬间破开受创！`,
          false, false, false, 0, false, [dmg]
        );
      }
    }

    if (defenderAction.kind === 'heavy_reflect') {
      const isTier4or5 = attack.tier === 4 || attack.tier === 5;
      if (isTier4or5) {
        const [playerVisual, enemyVisual] = visual('defense');
        const reboundDmg = calculateTurnDamage({
          attacker: attackerTop,
          defender: attackerTop,
          skillTier: attack.tier,
          isCounter: false,
          isClash: false,
          isBlockOrMiss: false,
          contextMultiplier: 1.0,
        });

        // 重反弹：大幅削弱为 25%~35% 的温和反弹伤害（绝对不会一击残血）
        const reflectReturnRatio = 0.25 + Math.random() * 0.10;
        const reflectPercent = Math.round(reflectReturnRatio * 100);
        const reflectedDamage = scaleDamageResult(reboundDmg, reflectReturnRatio, attacker);
        const attackerReflectDamage = reflectedDamage.finalDamage;

        // 反弹方承受 15%~25% 的轻微冲击余波
        const recoilRatio = 0.15 + Math.random() * 0.10;
        const recoilPercent = Math.round(recoilRatio * 100);
        const recoilDamage = scaleDamageResult(reboundDmg, reflectReturnRatio * recoilRatio, defender);
        const defenderSelfDamage = recoilDamage.finalDamage;

        return finish(
          defender === 'player' ? 'qte_parry' : 'defense_success',
          null,
          null,
          playerVisual,
          enemyVisual,
          `⚡【重反弹逆转】拦截 ${attack.label} (Tier ${attack.tier}) 终极大招！对方承受 ${reflectPercent}% (${attackerReflectDamage}点) 战术反弹，${defender === 'player' ? '玩家' : '对手'}承受 ${recoilPercent}% (${defenderSelfDamage}点) 冲击余波！`,
          true,
          false,
          false,
          1.2,
          false,
          [reflectedDamage, recoilDamage]
        );
      } else {
        const [playerVisual, enemyVisual] = visual('hit');
        const dmg = calculateTurnDamage({
          attacker: attackerTop,
          defender: defenderTop,
          skillTier: attack.tier,
          isCounter: false,
          isClash: false,
          isBlockOrMiss: false,
        });
        return finish(
          'defense_fail',
          null,
          null,
          playerVisual,
          enemyVisual,
          `⚠️【重反弹空踏】对方仅使用 ${attack.label} (Tier ${attack.tier}) 小型技能！重盾前摇过大未能有效拦截受创！`,
          false, false, false, 0, false, [dmg]
        );
      }
    }

    if (defenderAction.kind === 'defense') {
      const evenTier = attack.tier % 2 === 0;
      const [playerVisual, enemyVisual] = visual(evenTier ? 'defense' : 'hit');

      if (evenTier) {
        const isFire = (attackerAttributes?.['FIRE'] || 0) > 0;
        const isWater = (defenderAttributes?.['WATER'] || 0) > 0;
        
        let reflectLog = '';
        if (defenderTop.stats.perks?.includes('blade_mail_reflect')) {
          attackerTop.integrity = Math.max(0, attackerTop.integrity - 350); // Direct damage calculation
          reflectLog = ' 刃甲反弹了巨大的伤害！';
        }

        const chargePlayer = defender === 'player';
        const chargeEnemy = defender === 'enemy';

        const dmg = calculateTurnDamage({
          attacker: attackerTop,
          defender: defenderTop,
          skillTier: attack.tier,
          isCounter: false,
          isClash: false,
          isBlockOrMiss: true,
        });

        return finish(
          defender === 'player' ? 'qte_parry' : 'defense_success',
          null,
          null,
          playerVisual,
          enemyVisual,
          `${attack.label} 是偶数档，防守扎根成功，抵消大量伤害。${isFire ? ' (火焰渗透伤害!)' : ''}${reflectLog}`,
          true,
          chargePlayer,
          chargeEnemy,
          isWater ? 2.5 : 0, // WATER: increased knockback
          isFire, // FIRE: 10% penetration
          [dmg]
        );
      }

      const dmg = calculateTurnDamage({
        attacker: attackerTop,
        defender: defenderTop,
        skillTier: attack.tier,
        isCounter: false,
        isClash: false,
        isBlockOrMiss: false,
      });

      return finish(
        'defense_fail',
        null,
        null,
        playerVisual,
        enemyVisual,
        `${attack.label} 是奇数档，防守判定失败，受到重创。`,
        false, false, false, 0, false, [dmg]
      );
    }

    if (defenderAction.kind === 'evade') {
      const oddTier = attack.tier % 2 === 1;
      const [playerVisual, enemyVisual] = visual(oddTier ? 'evade' : 'hit');

      if (oddTier) {
        const isWind = (defenderAttributes?.['WIND'] || 0) > 0;
        const chargePlayer = defender === 'player';
        const chargeEnemy = defender === 'enemy';

        const dmg = calculateTurnDamage({
          attacker: attackerTop,
          defender: defenderTop,
          skillTier: attack.tier,
          isCounter: false,
          isClash: false,
          isBlockOrMiss: true,
        });

        return finish(
          defender === 'player' ? 'qte_parry' : 'evade_success',
          null,
          null,
          playerVisual,
          enemyVisual,
          `${attack.label} 是奇数档，回避撤离成功。${isWind ? ' (风之加速!)' : ''}`,
          true,
          chargePlayer,
          chargeEnemy,
          0, false, [dmg]
        );
      }

      const dmg = calculateTurnDamage({
        attacker: attackerTop,
        defender: defenderTop,
        skillTier: attack.tier,
        isCounter: false,
        isClash: false,
        isBlockOrMiss: false,
      });

      return finish(
        'evade_fail',
        null,
        null,
        playerVisual,
        enemyVisual,
        `${attack.label} 是偶数档，回避路线被封死，受到打击。`,
        false, false, false, 0, false, [dmg]
      );
    }

    const [playerVisual, enemyVisual] = visual('hit');
    const dmg = calculateTurnDamage({
      attacker: attackerTop,
      defender: defenderTop,
      skillTier: attack.tier,
      isCounter: false,
      isClash: false,
      isBlockOrMiss: false,
    });
    return finish(
      'defense_fail',
      null,
      null,
      playerVisual,
      enemyVisual,
      `${attack.label} 命中裸露节奏，${defender === 'player' ? '玩家' : '对手'}受到打击。`,
      false, false, false, 0, false, [dmg],
    );
  }

  private getActionCost(action: TurnAction, currentSpirit: number) {
    if (action.kind === 'attack') return -ELEMENT_ATTACKS[action.skillId].spiritCost;
    if (action.kind === 'light_reflect') return -10; // 1 Spirit bar (10 out of 100)
    if (action.kind === 'heavy_reflect') return -20; // 2 Spirit bars (20 out of 100)
    if (action.kind === 'defense' || action.kind === 'evade') {
        return currentSpirit >= 1 ? -1 : 0;
    }
    return 0;
  }

  private getChargeGain(currentSpirit: number, regenBonus = 0) {
    return Math.max(0, Math.min(TURN_CHARGE_SPIRIT + regenBonus, MAX_SPIRIT - currentSpirit));
  }
}

export class BattlePhysicsSystem {
  private collisionCount = 0;
  private readonly events: EventBus;

  constructor(events: EventBus) {
    this.events = events;
  }

  reset() {
    this.collisionCount = 0;
  }

  update(player: TopEntity, enemy: TopEntity, dt: number, suppressDamage = false) {
    if (dt <= 0) return;
    const SUB_STEPS = 5;
    const stepDt = dt / SUB_STEPS;
    
    for (let i = 0; i < SUB_STEPS; i++) {
      this.integrateTop(player, stepDt);
      this.integrateTop(enemy, stepDt);
      this.resolveCollision(player, enemy, suppressDamage);
      this.resolveCloneCollision(player, enemy);
      this.resolveCloneCollision(enemy, player);
    }
  }

  private resolveCloneCollision(caster: TopEntity, target: TopEntity) {
    if (!caster.alive || !target.alive) return;
    if (caster.clones && caster.clones.length > 0) {
      const threshold = TOP_RADIUS * 2.15;
      caster.clones.forEach(clone => {
        const clonePos2D = new THREE.Vector2(clone.position.x, clone.position.z);
        const distToEnemy = clonePos2D.distanceTo(target.position);
        if (distToEnemy < threshold) {
          // Push enemy slightly
          const pushDir = target.position.clone().sub(clonePos2D).normalize();
          if (pushDir.lengthSq() < 0.001) pushDir.set(1, 0);
          target.velocity.addScaledVector(pushDir, 1.5);
        }
      });
    }
  }

  checkClashProximity(player: TopEntity, enemy: TopEntity): boolean {
    if (!player.alive || !enemy.alive) return false;
    const distSq = player.position.distanceToSquared(enemy.position);
    const triggerDistance = TOP_RADIUS * 2.15;
    return distSq <= triggerDistance * triggerDistance;
  }

  applyClashImpulse(player: TopEntity, enemy: TopEntity, pPush: number, ePush: number, pDam: number, eDam: number) {
    const playerShielded = this.consumeShield(player, player.position.x, player.position.y);
    const enemyShielded = this.consumeShield(enemy, enemy.position.x, enemy.position.y);

    const delta = new THREE.Vector2().subVectors(enemy.position, player.position);
    if (delta.lengthSq() < 0.001) delta.set(1, 0);
    const normal = delta.normalize();

    const playerPush = playerShielded ? 0 : (pPush > 0 ? pPush : 1.4);
    const enemyPush = enemyShielded ? 0 : (ePush > 0 ? ePush : 1.4);
    const playerDamage = playerShielded ? 0 : pDam;
    const enemyDamage = enemyShielded ? 0 : eDam;

    player.velocity.add(normal.clone().multiplyScalar(-playerPush));
    enemy.velocity.add(normal.clone().multiplyScalar(enemyPush));

    const playerIntegrityBefore = player.integrity;
    const enemyIntegrityBefore = enemy.integrity;
    player.integrity = Math.max(0, player.integrity - playerDamage);
    enemy.integrity = Math.max(0, enemy.integrity - enemyDamage);
    this.emitCollisionDamage(player, playerIntegrityBefore - player.integrity, 1.5);
    this.emitCollisionDamage(enemy, enemyIntegrityBefore - enemy.integrity, 1.5);

    this.events.emit('spark', {
      x: (player.position.x + enemy.position.x) * 0.5,
      z: (player.position.y + enemy.position.y) * 0.5,
      intensity: 1.5,
    });
    this.events.emit('impact', { intensity: 1.5 });

    if (playerDamage > 0 && !player.alive && !player.flags.burstResolvedThisFrame) {
      this.triggerBurstFinish(player, enemy);
    }
    if (enemyDamage > 0 && !enemy.alive && !enemy.flags.burstResolvedThisFrame) {
      this.triggerBurstFinish(enemy, player);
    }

  }

  dashPlayer(player: TopEntity, worldTarget: THREE.Vector3, energy?: EnergySystem) {
    if (player.dashCooldown > 0 || !player.alive || player.stunTimer > 0) return false;
    if (energy && !energy.canAfford(player.side, 1)) return false;

    const direction = new THREE.Vector2(worldTarget.x - player.position.x, worldTarget.z - player.position.y);
    if (direction.lengthSq() < 0.2) return false;
    direction.normalize();

    const modifiers = resolveModifiers(player);
    player.velocity.add(direction.multiplyScalar(TUNING.playerDashImpulse * modifiers.dashImpulseMultiplier));
    if (energy) energy.add(player.side, -1);

    player.dashCooldown = PLAYER_DASH_COOLDOWN;
    this.events.emit('dash', { side: player.side });
    return true;
  }

  private integrateTop(top: TopEntity, dt: number) {
    if (!top.alive) return;

    top.dashCooldown = Math.max(0, top.dashCooldown - dt);
    top.stunTimer = Math.max(0, top.stunTimer - dt);

    const modifiers = resolveModifiers(top);
    const speed = top.velocity.length();
    const radiusRatio = top.position.length() / ARENA_RADIUS;
    const stunDrag = top.stunTimer > 0 ? 0.92 : 1.0;
    
    // Apply arena friction multiplier
    const frictionMulti = arenaManager.getFrictionMultiplier();
    const baseDragMultiplier = top.getTurnDragMultiplier() - clamp(speed * 0.002, 0, 0.06);
    // frictionLost is the velocity lost per frame (e.g., 1.0 - 0.98 = 0.02)
    const frictionLost = 1.0 - baseDragMultiplier;
    // Scale the lost velocity by the arena's friction multiplier (0.2 for ice means 80% less friction lost)
    const effectiveFrictionLost = frictionLost * frictionMulti;
    
    const drag = Math.max(0, 1.0 - effectiveFrictionLost) * stunDrag;
    const subStepDrag = Math.pow(drag, Math.max(0.001, dt * 60));

    top.velocity.multiplyScalar(subStepDrag * (1 - dt * 0.22));
    top.position.addScaledVector(top.velocity, dt);

    const futurePos = top.position.clone().add(top.velocity.clone().multiplyScalar(dt));
    const nextRadiusRatio = futurePos.length() / ARENA_RADIUS;

    if (nextRadiusRatio > ARENA_SLOPE_START) {
      const slopePenetration = (nextRadiusRatio - ARENA_SLOPE_START) / (1 - ARENA_SLOPE_START);
      const slopeGradient = 2 * slopePenetration * SLOPE_STEEPNESS;
      const gripBoost = top.hasRubberTip ? modifiers.wallGripMultiplier * 1.25 : 1;
      const gravityPull = slopeGradient * 18.0 * gripBoost;
      const inwardDir = top.position.clone().normalize().multiplyScalar(-gravityPull * dt);
      top.velocity.add(inwardDir);

      const tangentDir = new THREE.Vector2(-top.position.y, top.position.x).normalize();
      const orbitForce = gravityPull * (top.hasRubberTip ? 0.72 : 0.85);
      top.velocity.add(tangentDir.multiplyScalar(orbitForce * dt));

      if (top.hasRubberTip && radiusRatio > EDGE_GRIND_THRESHOLD) {
        this.events.emit('spark', {
          x: top.position.x,
          z: top.position.y,
          intensity: clamp(speed / 10, 0.35, 1.1),
        });
      }
    } else if (radiusRatio > 0.97 && top.position.lengthSq() > 0.01) {
      const edgeBounceMulti = arenaManager.getEdgeBounceMultiplier();
      const inward = top.position.clone().normalize().multiplyScalar(-dt * 2.4 * top.stats.defense * 0.06 * modifiers.wallGripMultiplier * edgeBounceMulti);
      top.velocity.add(inward);
      
      // Force push-back vector to prevent clipping in extremely low friction environments (like ICE_GRID)
      if (edgeBounceMulti > 1.0) {
         const pushback = top.position.clone().normalize().multiplyScalar(-2.0 * dt);
         top.position.add(pushback);
      }
    }

    // Apply spin loss with angular damping multiplier
    const baseSpinLoss = 5.0 * dt; // Give top a natural spin loss so the damping multiplier works
    const spinLoss = baseSpinLoss * arenaManager.getAngularDampingMultiplier();
    top.spin = Math.max(0, top.spin - spinLoss);
    top.stamina = Math.max(0, top.stamina - spinLoss * 0.86);

    const tiltTarget = clamp(1 - top.spin / top.stats.maxSpin, 0, 1);
    top.tilt = clamp(
      top.tilt + (tiltTarget * TUNING.tiltGainScale - top.tilt * TUNING.tiltRecoverScale) * dt * 7,
      0,
      1.3,
    );
  }

  private resolveCollision(a: TopEntity, b: TopEntity, suppressDamage: boolean) {
    if (!a.alive || !b.alive || a.flags.burstResolvedThisFrame || b.flags.burstResolvedThisFrame) return;

    const delta = new THREE.Vector2().subVectors(b.position, a.position);
    const distance = delta.length();
    const minDistance = TOP_RADIUS * 1.5;

    if (distance > minDistance || distance <= 0.0001) return;

    const normal = delta.normalize();
    const relativeVelocity = new THREE.Vector2().subVectors(b.velocity, a.velocity);
    const separatingSpeed = relativeVelocity.dot(normal);
    const modifiersA = resolveModifiers(a);
    const modifiersB = resolveModifiers(b);
    const attackFactorA = (1 + a.stats.attack * 0.05 + (a.spin / a.stats.maxSpin) * 0.25) * modifiersA.attackMultiplier;
    const attackFactorB = (1 + b.stats.attack * 0.05 + (b.spin / b.stats.maxSpin) * 0.25) * modifiersB.attackMultiplier;
    const impulseMagnitude = Math.max(3.2, Math.abs(separatingSpeed) + (attackFactorA + attackFactorB) * TUNING.collisionImpulseScale);

    this.collisionCount += 1;

    if (this.collisionCount <= 3 && this.tryResolveOpeningBurst(a, b, relativeVelocity.length(), impulseMagnitude)) {
      return;
    }

    const ratioA = b.effectiveWeight / (a.effectiveWeight + 1);
    const ratioB = a.effectiveWeight / (b.effectiveWeight + 1);
    const pushA = impulseMagnitude * ratioA * 0.8 * modifiersB.collisionImpulseMultiplier;
    const pushB = impulseMagnitude * ratioB * 0.8 * modifiersA.collisionImpulseMultiplier;
    const shieldedA = this.consumeShield(a, a.position.x, a.position.y);
    const shieldedB = this.consumeShield(b, b.position.x, b.position.y);

    const impulseA = normal.clone().multiplyScalar(shieldedA ? 0 : -pushA * modifiersA.velocityReflectionMultiplier);
    const impulseB = normal.clone().multiplyScalar(shieldedB ? 0 : pushB * modifiersB.velocityReflectionMultiplier);

    a.velocity.add(impulseA);
    b.velocity.add(impulseB);
    
    // Aqua Surge additional push (convert reduced reflection into outward push to opponent)
    if (modifiersA.velocityReflectionMultiplier < 1.0) {
      const extraPush = pushA * (1.0 - modifiersA.velocityReflectionMultiplier);
      b.velocity.add(normal.clone().multiplyScalar(extraPush * 1.5));
    }
    if (modifiersB.velocityReflectionMultiplier < 1.0) {
      const extraPush = pushB * (1.0 - modifiersB.velocityReflectionMultiplier);
      a.velocity.add(normal.clone().multiplyScalar(-extraPush * 1.5));
    }

    if (pushA > 5.0 && !shieldedA) a.stunTimer = Math.max(a.stunTimer, pushA * 0.06);
    if (pushB > 5.0 && !shieldedB) b.stunTimer = Math.max(b.stunTimer, pushB * 0.06);

    // Frost Bite trigger
    if (a.flags.armedFrostBite) {
      a.flags.armedFrostBite = false;
      const existing = b.statusEffects.find((entry) => entry.id === 'frost_bite');
      if (existing) { existing.remaining = 1.5; } else { b.statusEffects.push({ id: 'frost_bite', sourceSkill: 'frost_bite', duration: 1.5, remaining: 1.5 }); }
      this.events.emit('spark', { x: b.position.x, z: b.position.y, intensity: 2.5 });
    }
    if (b.flags.armedFrostBite) {
      b.flags.armedFrostBite = false;
      const existing = a.statusEffects.find((entry) => entry.id === 'frost_bite');
      if (existing) { existing.remaining = 1.5; } else { a.statusEffects.push({ id: 'frost_bite', sourceSkill: 'frost_bite', duration: 1.5, remaining: 1.5 }); }
      this.events.emit('spark', { x: a.position.x, z: a.position.y, intensity: 2.5 });
    }

    // Lightning Bolt trigger
    if (a.flags.armedLightningBolt) {
      a.flags.armedLightningBolt = false;
      b.lockStability = Math.max(0, b.lockStability - 15);
      this.triggerLightning(a);
    }
    if (b.flags.armedLightningBolt) {
      b.flags.armedLightningBolt = false;
      a.lockStability = Math.max(0, a.lockStability - 15);
      this.triggerLightning(b);
    }

    const damageToA = shieldedA
      ? 0
      : Math.max(
          2,
          (((b.stats.attack * modifiersB.attackMultiplier) * 1.1 - (a.stats.defense * modifiersA.defenseMultiplier) * 0.45) + impulseMagnitude) * 0.6 * modifiersB.damageMultiplier,
        );
    const damageToB = shieldedB
      ? 0
      : Math.max(
          2,
          (((a.stats.attack * modifiersA.attackMultiplier) * 1.1 - (b.stats.defense * modifiersB.defenseMultiplier) * 0.45) + impulseMagnitude) * 0.6 * modifiersA.damageMultiplier,
        );

    if (!suppressDamage) {
      const integrityBeforeA = a.integrity;
      const integrityBeforeB = b.integrity;
      a.integrity = Math.max(0, a.integrity - damageToA * TUNING.collisionDamageScale * 0.08);
      b.integrity = Math.max(0, b.integrity - damageToB * TUNING.collisionDamageScale * 0.08);
      const collisionIntensity = clamp(impulseMagnitude / 10, 0.35, 1.4);
      this.emitCollisionDamage(a, integrityBeforeA - a.integrity, collisionIntensity);
      this.emitCollisionDamage(b, integrityBeforeB - b.integrity, collisionIntensity);
      a.addBurst((damageToA * TUNING.burstDamageScale * 0.04) / Math.max(0.35, 1 + a.stats.burstResist * 0.25 * modifiersA.burstResistanceMultiplier));
      b.addBurst((damageToB * TUNING.burstDamageScale * 0.04) / Math.max(0.35, 1 + b.stats.burstResist * 0.25 * modifiersB.burstResistanceMultiplier));

      a.spin = Math.max(0, a.spin - damageToA * 0.7 * modifiersA.spinLossMultiplier);
      b.spin = Math.max(0, b.spin - damageToB * 0.7 * modifiersB.spinLossMultiplier);

      this.applyLockStabilityDamage(a, b, relativeVelocity.length(), modifiersB.damageMultiplier, modifiersA.lockStabilityLossMultiplier);
      this.applyLockStabilityDamage(b, a, relativeVelocity.length(), modifiersA.damageMultiplier, modifiersB.lockStabilityLossMultiplier);
    }

    const overlap = minDistance - distance;
    if (!shieldedA) a.position.addScaledVector(normal, -overlap * 0.5);
    if (!shieldedB) b.position.addScaledVector(normal, overlap * 0.5);

    // Rotational Friction (Tangential Deflection)
    const tangent = new THREE.Vector2(-normal.y, normal.x);
    const spinFactor = Math.max(0.1, ((a.spin / a.stats.maxSpin) + (b.spin / b.stats.maxSpin)) * 0.5);
    const frictionImpulse = impulseMagnitude * 0.45 * spinFactor;
    
    // Apply heavy kick to sides
    a.velocity.add(tangent.clone().multiplyScalar(frictionImpulse * ratioA));
    b.velocity.add(tangent.clone().multiplyScalar(-frictionImpulse * ratioB));

    this.events.emit('spark', {
      x: (a.position.x + b.position.x) * 0.5,
      z: (a.position.y + b.position.y) * 0.5,
      intensity: clamp(impulseMagnitude / 12, 0.4, 1.8),
    });
    this.events.emit('impact', { intensity: clamp(impulseMagnitude / 10, 0.35, 1.4) });

    if (!suppressDamage) {
      if (!a.alive && !a.flags.burstResolvedThisFrame) this.triggerBurstFinish(a, b);
      if (!b.alive && !b.flags.burstResolvedThisFrame) this.triggerBurstFinish(b, a);

      if (this.collisionCount >= 50 && a.alive && b.alive) {
        this.forceCollisionSettlement(a, b);
      }
    }
  }

  private emitCollisionDamage(top: TopEntity, amount: number, intensity: number) {
    if (amount <= 0) return;
    this.events.emit('collision_damage', {
      side: top.side,
      amount,
      x: top.position.x,
      z: top.position.y,
      intensity,
    });
  }

  private triggerLightning(caster: TopEntity) {
    if (caster.lightningLines.length === 0) {
      const mat = SkillManager.createLightningShaderMaterial();
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.4), mat);
      caster.mesh.parent?.add(mesh);
      caster.lightningLines.push(mesh);
    }
    caster.lightningTimer = 0.15; // User requested: short jitter and auto cleanup
  }

  private tryResolveOpeningBurst(_a: TopEntity, _b: TopEntity, _relativeSpeed: number, _impulseMagnitude: number) {
    return false; // Disabled insta-kill mechanic
  }

  private applyLockStabilityDamage(target: TopEntity, attacker: TopEntity, relativeSpeed: number, attackerDamageMultiplier: number, targetLossMultiplier: number) {
    const isLightning = (attacker.stats.attributes?.['LIGHTNING'] || 0) > 0;
    const lightningBonus = isLightning ? 1.5 : 1.0;
    const loss = relativeSpeed * attackerDamageMultiplier * targetLossMultiplier * lightningBonus;
    
    target.lockStability = Math.max(0, target.lockStability - loss);
    if (target.lockStability <= 0 && target.alive && !target.flags.burstResolvedThisFrame) {
      this.triggerBurstFinish(target, attacker);
    }
  }

  private triggerBurstFinish(loser: TopEntity, winner: TopEntity) {
    if (loser.flags.burstResolvedThisFrame) return;
    loser.flags.burstResolvedThisFrame = true;
    loser.addBurst(MAX_BURST);
    loser.alive = false;
    loser.integrity = 0;
    this.events.emit('burst', { winner: winner.side, loser: loser.side });
  }

  private consumeShield(top: TopEntity, x: number, z: number) {
    if (top.shieldHits <= 0) return false;
    top.shieldHits = Math.max(0, top.shieldHits - 1);
    top.flags.ignoreNextCollisionDamage = true;
    this.events.emit('shield_block', {
      x,
      z,
      side: top.side,
      shieldHits: top.shieldHits,
    });
    this.events.emit('impact', { intensity: 0.45 });
    return true;
  }

  private forceCollisionSettlement(a: TopEntity, b: TopEntity) {
    const scoreA = a.spin + a.integrity * 0.35 + a.stats.defense * 4;
    const scoreB = b.spin + b.integrity * 0.35 + b.stats.defense * 4;
    if (scoreA >= scoreB) {
      b.spin = 0;
      b.stamina = 0;
      b.setEliminated();
    } else {
      a.spin = 0;
      a.stamina = 0;
      a.setEliminated();
    }
  }
}
