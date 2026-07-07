import { EventBus } from '../utils/events';
import { EnergySystem } from './energy';

export type ClashActionType = 'attack' | 'defend' | 'dodge' | 'charge' | 'none';

export interface ClashAction {
  type: ClashActionType;
  power?: number; // 1, 2, or 3 for attack
}

export type ClashState = 'idle' | 'active' | 'resolving' | 'cooldown';

export interface ClashResult {
  playerDamage: number;
  enemyDamage: number;
  playerPush: number;
  enemyPush: number;
  playerEnergyChange: number;
  enemyEnergyChange: number;
  log: string;
  playerVisual: string;
  enemyVisual: string;
}

export class ClashSystem {
  state: ClashState = 'idle';
  timer = 0;
  readonly ACTIVE_DURATION = 3.0; // real seconds
  readonly COOLDOWN_DURATION = 3.5; // game seconds

  playerAction: ClashAction = { type: 'none' };
  enemyAction: ClashAction = { type: 'none' };
  
  private events: EventBus;
  private energy: EnergySystem;

  constructor(events: EventBus, energy: EnergySystem) {
    this.events = events;
    this.energy = energy;
  }

  reset() {
    this.state = 'idle';
    this.timer = 0;
    this.playerAction = { type: 'none' };
    this.enemyAction = { type: 'none' };
  }

  trigger() {
    if (this.state !== 'idle') return;
    this.state = 'active';
    this.timer = this.ACTIVE_DURATION;
    this.playerAction = { type: 'none' };
    this.enemyAction = { type: 'none' };
    this.events.emit('clash_start', {});
  }

  submitAction(side: 'player' | 'enemy', action: ClashAction) {
    if (this.state !== 'active') return;
    if (side === 'player') this.playerAction = action;
    else this.enemyAction = action;

    if (this.playerAction.type !== 'none' && this.enemyAction.type !== 'none') {
      this.resolve();
    }
  }

  update(dtReal: number, dtGame: number) {
    if (this.state === 'active') {
      this.timer -= dtReal;
      if (this.timer <= 0) {
        if (this.playerAction.type === 'none') this.playerAction = { type: 'defend' };
        if (this.enemyAction.type === 'none') this.enemyAction = { type: 'defend' };
        this.resolve();
      }
    } else if (this.state === 'cooldown') {
      this.timer -= dtGame;
      if (this.timer <= 0) {
        this.state = 'idle';
      }
    }
  }

  private resolve() {
    this.state = 'resolving';
    
    const res = this.calculateResult(this.playerAction, this.enemyAction);
    
    this.energy.add('player', res.playerEnergyChange);
    this.energy.add('enemy', res.enemyEnergyChange);
    
    this.events.emit('clash_resolved', res);

    this.state = 'cooldown';
    this.timer = this.COOLDOWN_DURATION;
  }

  private calculateResult(pAction: ClashAction, eAction: ClashAction): ClashResult {
    let pDam = 0, eDam = 0, pPush = 0, ePush = 0, pEn = 0, eEn = 0;
    let log = '';
    let pVis = 'hit', eVis = 'hit';

    const pushMap: Record<number, number> = {1: 3, 2: 6, 3: 10};
    const dmgMap: Record<number, number> = {1: 3, 2: 6, 3: 10};

    if (pAction.type === 'attack') pEn -= pAction.power!;
    if (eAction.type === 'attack') eEn -= eAction.power!;

    const resolveAttackDefend = (atk: number, side: 'player' | 'enemy') => {
      let cost = Math.ceil(atk / 2);
      if (side === 'player') { // enemy is def, player is atk
        eEn -= cost;
        return { vAtk: 'clash', vDef: 'block' };
      } else {
        pEn -= cost;
        return { vAtk: 'clash', vDef: 'block' };
      }
    };

    if (pAction.type === 'attack' && eAction.type === 'attack') {
      const pP = pAction.power!;
      const eP = eAction.power!;
      if (pP > eP) {
        eDam = dmgMap[pP]; ePush = pushMap[pP];
        log = '玩家压制了对手！';
        pVis = 'clash'; eVis = 'hit';
      } else if (eP > pP) {
        pDam = dmgMap[eP]; pPush = pushMap[eP];
        log = '对手压制了玩家！';
        pVis = 'hit'; eVis = 'clash';
      } else {
        log = '正面对冲，平分秋色！';
        pVis = 'clash'; eVis = 'clash';
      }
    } else if (pAction.type === 'attack' && eAction.type === 'defend') {
      resolveAttackDefend(pAction.power!, 'player');
      log = '对手防住了这一击！'; pVis = 'clash'; eVis = 'block';
    } else if (eAction.type === 'attack' && pAction.type === 'defend') {
      resolveAttackDefend(eAction.power!, 'enemy');
      log = '玩家稳稳防住！'; pVis = 'block'; eVis = 'clash';
    } else if (pAction.type === 'attack' && eAction.type === 'dodge') {
      if (pAction.power! % 2 === 0) {
        log = '对手闪开了攻击！'; pVis = 'clash'; eVis = 'dodge';
      } else {
        eDam = dmgMap[pAction.power!]; ePush = pushMap[pAction.power!];
        log = '玩家的攻击命中了！'; pVis = 'clash'; eVis = 'hit';
      }
    } else if (eAction.type === 'attack' && pAction.type === 'dodge') {
      if (eAction.power! % 2 === 0) {
        log = '玩家成功闪避！'; pVis = 'dodge'; eVis = 'clash';
      } else {
        pDam = dmgMap[eAction.power!]; pPush = pushMap[eAction.power!];
        log = '对手的攻击命中了！'; pVis = 'hit'; eVis = 'clash';
      }
    } else if (pAction.type === 'attack' && eAction.type === 'charge') {
      eEn += 2; eDam = dmgMap[pAction.power!]; ePush = pushMap[pAction.power!];
      log = '玩家抓住对手蓄力空档！'; pVis = 'clash'; eVis = 'hit';
    } else if (eAction.type === 'attack' && pAction.type === 'charge') {
      pEn += 2; pDam = dmgMap[eAction.power!]; pPush = pushMap[eAction.power!];
      log = '对手抓住了玩家蓄力空档！'; pVis = 'hit'; eVis = 'clash';
    } else {
      // Non-attack vs non-attack
      if (pAction.type === 'charge') pEn += 2;
      if (eAction.type === 'charge') eEn += 2;
      log = '双方都在观察时机。';
      pVis = pAction.type; eVis = eAction.type;
    }

    return {
      playerDamage: pDam, enemyDamage: eDam,
      playerPush: pPush, enemyPush: ePush,
      playerEnergyChange: pEn, enemyEnergyChange: eEn,
      log, playerVisual: pVis, enemyVisual: eVis
    };
  }
}
