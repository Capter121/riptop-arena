// Central run state held across screens (the "GameManager" of PRD ch.12.4).

import { DEFAULT_BUILD } from '../data/components.js';
import { computeEffectiveStats } from '../sim/stats.js';

export class GameState {
  constructor() {
    this.playerBuild = [...DEFAULT_BUILD]; // [slotA, slotB, slotC, slotD]
    this.playerName = '玩家陀螺';
    this.arenaId = 'standard';
    this.launchResult = null; // set by Launch screen
    this.opponent = null; // { name, ids, launchResult }
    this.friendBattle = null; // { inviterName, inviterBuild } when arrived via a challenge link
    this.result = null; // BattleSim result
    this.score = { player: 0, ai: 0 };
    this.battleSpeed = 1;
    this.seed = 0x1234abcd;
  }

  playerEffective() {
    return computeEffectiveStats(this.playerBuild);
  }

  buildComplete() {
    return this.playerBuild.length === 4 && this.playerBuild.every(Boolean);
  }

  nextSeed() {
    // advance a deterministic per-match seed
    this.seed = (Math.imul(this.seed ^ (this.seed >>> 15), 0x2c1b3c6d) + 1) >>> 0;
    return this.seed;
  }
}

export const game = new GameState();
