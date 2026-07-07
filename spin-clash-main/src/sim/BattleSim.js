// Deterministic battle simulation (PRD ch.10).
// Pure logic: a fixed 60Hz tick loop on a 2D plane producing an event stream.
// The renderer reads top positions (interpolated) and consumes events for VFX/log.
// Same seed + inputs => identical run (replay / future netcode safe).

import { RNG } from './rng.js';
import { BALANCE, WIN_SCORE } from '../data/balance.js';
import { counterMultiplier, STAT_KEYS } from './stats.js';

const B = BALANCE;

export class BattleSim {
  // tops: [{ name, color, effective, launch }] (length 2)
  constructor({ tops, arena, seed }) {
    this.arena = arena;
    this.rng = new RNG(seed >>> 0);
    this.dt = 1 / B.TICK_HZ;
    this.time = 0;
    this.accumulator = 0;
    this.alpha = 0;
    this.finished = false;
    this.result = null;
    this.events = [];
    this.pendingEvents = [];
    this.playR = arena.visual.radius * 0.78;
    this._lastPing = 0;
    this.collisionDue = false;
    this.tops = tops.map((t, i) => this._initTop(t, i));
    this._scheduleCollision();
    this._emit({ type: 'start', t: 0, tops: this.tops.map((t) => ({ name: t.name, idx: t.idx })) });
  }

  _initTop(t, idx) {
    const eff = t.effective;
    const launch = t.launch;
    const staminaMax =
      (B.STAMINA_BASE + eff.stats.wgt * B.STAMINA_WEIGHT_COEFF) * (launch?.staminaMult ?? 1);
    const R = this.playR;
    let startR = R * 0.62;
    if (launch?.startPosition === 'center') startR = R * 0.34;
    else if (launch?.startPosition === 'outer') startR = R * 0.84;
    const side = idx === 0 ? -1 : 1;
    const pos = { x: side * startR, z: this.rng.jitter(R * 0.15) };
    // initial tangential velocity so they begin orbiting
    const vel = { x: 0, z: side * (1.5 + eff.stats.spd * 0.05) };
    return {
      idx,
      name: t.name,
      color: t.color,
      faction: t.faction,
      base: eff.stats,
      mods: eff.mods,
      dominant: eff.dominant,
      timedBuffs: launch?.timedBuffs ?? [],
      staminaMax,
      stamina: staminaMax,
      pos,
      prev: { ...pos },
      vel,
      cyclone: 0,
      // result accumulators
      dmgDealt: 0,
      maxHit: 0,
      crits: 0,
      dodges: 0,
      hits: 0,
      reflected: 0,
    };
  }

  // Current value of a stat including active timed launch buffs.
  currentStat(top, key) {
    let v = top.base[key];
    const buffs = top.timedBuffs;
    for (let i = 0; i < buffs.length; i++) {
      const bf = buffs[i];
      if (bf.stat === key && this.time < bf.until) v *= bf.mult;
    }
    return v;
  }

  _emit(ev) {
    this.events.push(ev);
    this.pendingEvents.push(ev);
  }

  // Renderer drains this each frame.
  drainEvents() {
    if (this.pendingEvents.length === 0) return [];
    const out = this.pendingEvents;
    this.pendingEvents = [];
    return out;
  }

  // Smooth position for rendering.
  renderPos(top) {
    return {
      x: top.prev.x + (top.pos.x - top.prev.x) * this.alpha,
      z: top.prev.z + (top.pos.z - top.prev.z) * this.alpha,
    };
  }

  _scheduleCollision() {
    const s0 = this.currentStat(this.tops[0], 'spd');
    const s1 = this.currentStat(this.tops[1], 'spd');
    const interval =
      (B.COLLIDE_BASE / (this.arena.crate * (1 + (s0 + s1) / B.COLLIDE_SPEED_DIV))) *
      this.rng.range(B.COLLIDE_JITTER[0], B.COLLIDE_JITTER[1]);
    this.nextCollideAt = this.time + interval;
  }

  _drainPerSec(top) {
    const spd = this.currentStat(top, 'spd');
    const wgt = this.currentStat(top, 'wgt');
    const def = this.currentStat(top, 'def');
    let d =
      B.DRAIN_BASE *
      this.arena.fric *
      (1 + spd / B.DRAIN_SPEED_DIV) *
      (1 - Math.min(B.DRAIN_WEIGHT_CAP, wgt / B.DRAIN_WEIGHT_DIV)) *
      (1 - Math.min(B.DRAIN_DEF_CAP, def / B.DRAIN_DEF_DIV));
    d *= 1 - top.mods.drainReduction;
    return d;
  }

  _integrateMotion() {
    const a = this.tops[0];
    const b = this.tops[1];
    const pull = this.arena.pull;
    for (const [top, other] of [
      [a, b],
      [b, a],
    ]) {
      const spd = this.currentStat(top, 'spd');
      const speedFactor = 0.5 + spd / 38;
      const px = top.pos.x;
      const pz = top.pos.z;
      const cdist = Math.hypot(px, pz) || 1e-3;
      // unit vector toward center
      const cnx = -px / cdist;
      const cnz = -pz / cdist;
      // tangential (orbit)
      const tnx = -cnz;
      const tnz = cnx;
      // toward opponent
      const ox = other.pos.x - px;
      const oz = other.pos.z - pz;
      const odist = Math.hypot(ox, oz) || 1e-3;
      let ax = 0;
      let az = 0;
      // center pull (arena pull pinches them together)
      const centerForce = 1.4 + pull * 6.0;
      ax += cnx * centerForce;
      az += cnz * centerForce;
      // seek opponent so they actually clash; rush together when a hit is due
      const seek = this.collisionDue ? 9.5 : 3.2;
      ax += (ox / odist) * seek * speedFactor;
      az += (oz / odist) * seek * speedFactor;
      // orbit so motion looks like spinning combat, not a head-on line
      const orbit = this.collisionDue ? 1.6 : 5.0;
      ax += tnx * orbit * speedFactor;
      az += tnz * orbit * speedFactor;
      // jitter
      ax += this.rng.jitter(2.2);
      az += this.rng.jitter(2.2);
      top.vel.x += ax * this.dt;
      top.vel.z += az * this.dt;
      // damping
      top.vel.x *= 0.94;
      top.vel.z *= 0.94;
      // clamp speed by stat
      const vmag = Math.hypot(top.vel.x, top.vel.z);
      const vmax = 3.2 + spd * 0.14;
      if (vmag > vmax) {
        const s = vmax / vmag;
        top.vel.x *= s;
        top.vel.z *= s;
      }
    }
    for (const top of this.tops) {
      top.pos.x += top.vel.x * this.dt;
      top.pos.z += top.vel.z * this.dt;
      const d = Math.hypot(top.pos.x, top.pos.z);
      if (d > this.playR) {
        const nx = top.pos.x / d;
        const nz = top.pos.z / d;
        top.pos.x = nx * this.playR;
        top.pos.z = nz * this.playR;
        const dot = top.vel.x * nx + top.vel.z * nz;
        top.vel.x -= 1.6 * dot * nx;
        top.vel.z -= 1.6 * dot * nz;
      }
    }
  }

  _applyKnockback(att, def) {
    // Heavier attacker pushes lighter defender harder (visualises 重剋速).
    const wAtt = this.currentStat(att, 'wgt');
    const wDef = this.currentStat(def, 'wgt');
    let nx = def.pos.x - att.pos.x;
    let nz = def.pos.z - att.pos.z;
    const d = Math.hypot(nx, nz) || 1e-3;
    nx /= d;
    nz /= d;
    const ratio = wAtt / (wDef + 1);
    const impulse = 3.4 * ratio;
    def.vel.x += nx * impulse;
    def.vel.z += nz * impulse;
    att.vel.x -= nx * impulse * 0.5;
    att.vel.z -= nz * impulse * 0.5;
  }

  // att attacks def for one contact direction. Emits hit/dodge/proc events.
  // Returns true if a finisher (ring-out / burst) was triggered.
  _attack(att, def) {
    // Dodge (speed + trajectory advantage).
    const dodgeRate = clamp(
      (this.currentStat(def, 'spd') +
        this.currentStat(def, 'trj') -
        this.currentStat(att, 'spd') -
        this.currentStat(att, 'trj')) *
        B.DODGE_COEFF,
      0,
      B.DODGE_CAP + def.mods.dodgeCapBonus
    );
    if (this.rng.chance(dodgeRate)) {
      def.dodges++;
      if (def.mods.procs.cyclone) {
        def.cyclone = Math.min(def.mods.procs.cyclone.proc_max, def.cyclone + 1);
        this._emit({ type: 'cyclone', t: this.time, idx: def.idx, stacks: def.cyclone });
      }
      this._emit({ type: 'dodge', t: this.time, byIdx: def.idx, fromIdx: att.idx });
      return false;
    }

    const cycloneBonus = att.mods.procs.cyclone ? att.mods.procs.cyclone.proc_value * att.cyclone : 0;
    const atkVal = this.currentStat(att, 'atk') * (1 + cycloneBonus);
    const defVal = this.currentStat(def, 'def');
    // Attack contributes with marginal diminishing returns (PRD lever #1).
    const base = Math.pow(atkVal, B.ATK_EXP) * (B.MIT / (B.MIT + defVal));
    const counter = counterMultiplier(att.dominant, def.dominant);

    const bst = this.currentStat(att, 'bst');
    const critChance = Math.min(B.CRIT_CHANCE_CAP, B.CRIT_CHANCE_BASE + bst * B.CRIT_CHANCE_PER_BST);
    let crit = false;
    let critMult = 1;
    if (this.rng.chance(critChance)) {
      crit = true;
      critMult = B.CRIT_MULT_BASE + bst * B.CRIT_MULT_PER_BST;
    }

    const roll = this.rng.range(B.DMG_ROLL[0], B.DMG_ROLL[1]);
    let dmg = base * counter * critMult * roll * B.DMG * (1 + this.arena.pull * B.PULL_DMG_COEFF);

    const procs = [];
    // Inferno 4pc: burn follow-up on crit.
    if (crit && att.mods.procs.burn_followup && this.rng.chance(att.mods.procs.burn_followup.proc_chance)) {
      const burn = Math.pow(atkVal, B.ATK_EXP) * att.mods.procs.burn_followup.proc_value * B.DMG;
      dmg += burn;
      procs.push({ proc: 'burn', value: burn });
    }
    // Chaos 4pc: true damage off opponent's current stamina.
    if (att.mods.procs.chaos_burst && this.rng.chance(att.mods.procs.chaos_burst.proc_chance)) {
      const tdmg = Math.max(0, def.stamina) * att.mods.procs.chaos_burst.proc_value;
      dmg += tdmg;
      procs.push({ proc: 'chaos', value: tdmg });
    }

    def.stamina -= dmg;
    def.cyclone = 0; // taking a hit resets cyclone stacks
    att.dmgDealt += dmg;
    att.hits++;
    if (dmg > att.maxHit) att.maxHit = dmg;
    if (crit) att.crits++;

    // Attacker self-drain (glass cannon recoil; heavy tops resist).
    const reaction = (B.REACTION_COEFF * dmg) / (1 + this.currentStat(att, 'wgt') / B.REACTION_WEIGHT_DIV);
    att.stamina -= reaction;

    this._emit({
      type: 'hit',
      t: this.time,
      byIdx: att.idx,
      targetIdx: def.idx,
      dmg,
      crit,
      counter,
      procs,
    });

    // Crit knockback: a crit can shove the defender back several spaces.
    // Probability + distance fall off with the defender's weight.
    if (crit) {
      const wgt = this.currentStat(def, 'wgt');
      const kbChance = clamp(B.CRIT_KB_CHANCE_BASE - wgt * B.CRIT_KB_CHANCE_PER_WGT, 0.08, 0.78);
      if (this.rng.chance(kbChance)) {
        let nx = def.pos.x - att.pos.x;
        let nz = def.pos.z - att.pos.z;
        const dd = Math.hypot(nx, nz) || 1e-3;
        nx /= dd;
        nz /= dd;
        const force = B.CRIT_KB_FORCE * (1 + (1 - Math.min(0.85, wgt / 55)));
        def.vel.x += nx * force;
        def.vel.z += nz * force;
        this._emit({ type: 'knockback', t: this.time, byIdx: att.idx, targetIdx: def.idx, pos: { x: def.pos.x, z: def.pos.z } });
      }
    }

    // Bedrock 4pc: defender reflects part of the damage.
    if (def.mods.procs.counter_reflect && this.rng.chance(def.mods.procs.counter_reflect.proc_chance)) {
      const refl = dmg * def.mods.procs.counter_reflect.proc_value;
      att.stamina -= refl;
      def.dmgDealt += refl;
      def.reflected += refl;
      this._emit({ type: 'reflect', t: this.time, byIdx: def.idx, targetIdx: att.idx, dmg: refl });
    }

    // Finisher: returns 'ringout' (彈飛) / 'burst' (解體) / null. Only rolls once
    // the defender is past the execution line (斬殺線, <20% stamina); chance then
    // rises as it weakens further, so weak tops fly out or burst near death.
    const defFrac = Math.max(0, def.stamina) / def.staminaMax;
    if (defFrac >= B.EXECUTE_THRESHOLD) return null;
    const ramp = 1 + B.KO_LOW_STAMINA * (1 - defFrac) * (1 - defFrac);
    const power = (this.currentStat(att, 'atk') + bst) / (this.currentStat(def, 'wgt') + defVal);
    const ringChance = B.KO_RING_BASE * power * this.arena.ringout * ramp;
    const burstChance = B.KO_BURST_BASE * power * (1 + bst / 120) * ramp;
    if (this.rng.chance(ringChance)) return 'ringout';
    if (this.rng.chance(burstChance)) return 'burst';
    return null;
  }

  _resolveCollision() {
    const a = this.tops[0];
    const b = this.tops[1];
    const dmgBefore = a.dmgDealt + b.dmgDealt;
    const mid = { x: (a.pos.x + b.pos.x) / 2, z: (a.pos.z + b.pos.z) / 2 };
    const koA = this._attack(a, b); // type or null — a flings/bursts b
    const koB = this._attack(b, a);
    this._applyKnockback(a, b);
    this._applyKnockback(b, a);
    const intensity = a.dmgDealt + b.dmgDealt - dmgBefore;
    this._emit({ type: 'clash', t: this.time, pos: mid, intensity });

    if (koA || koB) {
      let winner;
      let loser;
      let type;
      if (koA && !koB) {
        winner = a;
        loser = b;
        type = koA;
      } else if (koB && !koA) {
        winner = b;
        loser = a;
        type = koB;
      } else {
        // both finished simultaneously — higher remaining stamina prevails
        if (a.stamina >= b.stamina) {
          winner = a;
          loser = b;
          type = koA;
        } else {
          winner = b;
          loser = a;
          type = koB;
        }
      }
      this._finish(type, winner, loser);
    }
  }

  _tick() {
    this.time += this.dt;
    // Drain.
    for (const top of this.tops) top.stamina -= this._drainPerSec(top) * this.dt;
    // A collision becomes "due" on the cadence timer, but only resolves once
    // the tops are actually within contact range -> no clashes across the bowl.
    if (!this.finished && this.time >= this.nextCollideAt) this.collisionDue = true;
    // Motion (rushes the tops together while a hit is due).
    this._integrateMotion();
    // Collision (proximity-gated).
    if (!this.finished && this.collisionDue) {
      const dx = this.tops[0].pos.x - this.tops[1].pos.x;
      const dz = this.tops[0].pos.z - this.tops[1].pos.z;
      if (Math.hypot(dx, dz) <= B.CONTACT_DIST) {
        this._resolveCollision();
        if (!this.finished) {
          this.collisionDue = false;
          this._scheduleCollision();
        }
      }
    }
    // Status ping for the log every 6s.
    if (!this.finished && this.time - this._lastPing >= 6) {
      this._lastPing = this.time;
      this._emit({
        type: 'status',
        t: this.time,
        stamina: this.tops.map((tp) => Math.max(0, tp.stamina) / tp.staminaMax),
      });
    }
    if (!this.finished) this._checkEnd();
  }

  _checkEnd() {
    const a = this.tops[0];
    const b = this.tops[1];
    if (a.stamina <= 0 || b.stamina <= 0) {
      let winner;
      let loser;
      if (a.stamina <= 0 && b.stamina <= 0) {
        const fa = a.stamina / a.staminaMax;
        const fb = b.stamina / b.staminaMax;
        winner = fa >= fb ? a : b;
      } else {
        winner = a.stamina <= 0 ? b : a;
      }
      loser = winner === a ? b : a;
      this._finish('spinout', winner, loser);
      return;
    }
    if (this.time >= B.MATCH_TIME_LIMIT) {
      const fa = a.stamina / a.staminaMax;
      const fb = b.stamina / b.staminaMax;
      const winner = fa >= fb ? a : b;
      this._finish('decision', winner, winner === a ? b : a);
    }
  }

  _mvpStat(top) {
    // Largest contributor among the six stats (effective), for the result screen.
    let best = STAT_KEYS[0];
    for (const k of STAT_KEYS) if (top.base[k] > top.base[best]) best = k;
    return best;
  }

  _finish(type, winner, loser) {
    if (this.finished) return;
    for (const t of this.tops) t.stamina = Math.max(0, t.stamina);
    this.finished = true;
    this.result = {
      winType: type,
      winnerIdx: winner.idx,
      loserIdx: loser.idx,
      score: WIN_SCORE[type],
      duration: this.time,
      mvpStat: this._mvpStat(winner),
      tops: this.tops.map((t) => ({
        name: t.name,
        idx: t.idx,
        dmgDealt: Math.round(t.dmgDealt),
        maxHit: Math.round(t.maxHit),
        crits: t.crits,
        dodges: t.dodges,
        hits: t.hits,
        reflected: Math.round(t.reflected),
        staminaPct: t.stamina / t.staminaMax,
      })),
    };
    this._emit({ type: 'finish', t: this.time, winType: type, winnerIdx: winner.idx, loserIdx: loser.idx });
  }

  // Real-time stepping with a fixed-timestep accumulator (decoupled from render fps).
  advance(realDt) {
    if (this.finished) return;
    this.accumulator += Math.min(realDt, 0.1);
    while (this.accumulator >= this.dt && !this.finished) {
      for (const t of this.tops) {
        t.prev.x = t.pos.x;
        t.prev.z = t.pos.z;
      }
      this._tick();
      this.accumulator -= this.dt;
    }
    this.alpha = this.finished ? 1 : this.accumulator / this.dt;
  }

  // Instant run for headless balance tests / AI lookahead.
  runToEnd() {
    let guard = 0;
    const cap = (B.MATCH_TIME_LIMIT + 1) * B.TICK_HZ;
    while (!this.finished && guard < cap) {
      this._tick();
      guard++;
    }
    if (!this.finished) {
      const a = this.tops[0];
      const b = this.tops[1];
      const winner = a.stamina >= b.stamina ? a : b;
      this._finish('decision', winner, winner === a ? b : a);
    }
    return this.result;
  }
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
