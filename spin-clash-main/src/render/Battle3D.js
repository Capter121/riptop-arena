// Battle scene controller. Owns the arena, two tops and the spark field; reads
// interpolated positions from the deterministic sim each frame, drives the
// cinematic camera, turns the event stream into VFX, and plays the finish outro.

import * as THREE from 'three';
import { buildArena } from './Arena3D.js';
import { buildTop } from './TopModel.js';
import { SparkField } from './Sparks.js';
import { LightningFX } from './LightningFX.js';
import { FACTION_VIS } from './factions.js';
import { audio } from '../audio/AudioManager.js';

const LIFT = 0.86; // raise the top so its tip sits on the bowl surface

export class Battle3D {
  // opts: { stage, sim, factions:[setId,setId], arena, onEvent, onState, onFinish }
  constructor(opts) {
    this.stage = opts.stage;
    this.sim = opts.sim;
    this.arenaData = opts.arena;
    this.onEvent = opts.onEvent || (() => {});
    this.onState = opts.onState || (() => {});
    this.onFinish = opts.onFinish || (() => {});

    this.speed = 1;
    this.playing = false;
    this.finishedHandled = false;
    this._outro = null;
    this._elapsed = 0;

    this.stage.clearContent();

    this.arena = buildArena(this.arenaData);
    this.stage.root.add(this.arena.group);

    this.sparks = new SparkField();
    this.stage.root.add(this.sparks.object3d);

    this.lightning = new LightningFX();
    this.stage.root.add(this.lightning.object3d);

    // Expanding shockwave rings on impact (pooled).
    this.shock = [];
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.55, 0.72, 48),
        new THREE.MeshBasicMaterial({ color: 0xffcaa0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 3;
      this.stage.root.add(mesh);
      this.shock.push({ mesh, t: 0, life: 0, scale: 1 });
    }
    this._shockHead = 0;

    this.tops = opts.factions.map((setId, i) => {
      const slots = (opts.slotFactions && opts.slotFactions[i]) || setId;
      const t = buildTop(slots, setId);
      this.stage.root.add(t.group);
      const p = this.sim.renderPos(this.sim.tops[i]);
      this._placeTop(t, p.x, p.z);
      return t;
    });

    // Player / opponent identification markers (ground ring + floating label),
    // in fixed colours independent of faction so "which top is mine" is obvious.
    const labels = opts.labels || ['我方', '對手'];
    this.markers = this.tops.map((t, i) => {
      const isPlayer = i === 0;
      const color = isPlayer ? 0x37e6a0 : 0xff5560;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.98, 0.07, 10, 48),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.renderOrder = 2;
      this.stage.root.add(ring);
      const label = this._makeLabel(labels[i] || (isPlayer ? '我方' : '對手'), color);
      this.stage.root.add(label);
      return { ring, label, color, isPlayer };
    });

    // Camera rig.
    this.camAngle = Math.PI * 0.5;
    this.camR = this.arena.radius * 1.75;
    this.camH = this.arena.radius * 1.15 + 2;
    this._focus = new THREE.Vector3(0, 0, 0);
    this._shake = 0;
    this._camTarget = new THREE.Vector3();
    this._tmp = new THREE.Vector3();

    this.stage.setOnFrame((dt, elapsed) => this._frame(dt, elapsed));
  }

  play() {
    this.playing = true;
  }
  pause() {
    this.playing = false;
  }
  setSpeed(s) {
    this.speed = s;
  }

  _placeTop(top, x, z) {
    const r = Math.hypot(x, z);
    top.group.position.set(x, this.arena.surfaceY(r) + LIFT, z);
  }

  _spinRate(frac) {
    return 9 + 30 * frac;
  }

  _worldClashY(x, z) {
    return this.arena.surfaceY(Math.hypot(x, z)) + 1.0;
  }

  _shockwave(x, y, z, scale, colorHex) {
    const s = this.shock[this._shockHead];
    this._shockHead = (this._shockHead + 1) % this.shock.length;
    s.mesh.position.set(x, y, z);
    s.mesh.material.color.set(colorHex);
    s.mesh.visible = true;
    s.t = 0;
    s.life = 0.42;
    s.scale = scale;
  }

  _updateShock(dt) {
    for (const s of this.shock) {
      if (s.life <= 0) continue;
      s.t += dt;
      const k = s.t / s.life;
      if (k >= 1) {
        s.life = 0;
        s.mesh.visible = false;
        continue;
      }
      const sc = 0.4 + k * s.scale;
      s.mesh.scale.set(sc, sc, sc);
      s.mesh.material.opacity = (1 - k) * 0.75;
    }
  }

  _makeLabel(text, colorHex) {
    const cnv = document.createElement('canvas');
    cnv.width = 256;
    cnv.height = 140;
    const ctx = cnv.getContext('2d');
    const css = '#' + (colorHex >>> 0).toString(16).padStart(6, '0').slice(-6);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = css;
    ctx.shadowColor = css;
    ctx.shadowBlur = 16;
    ctx.font = 'bold 60px "Noto Sans TC", sans-serif';
    ctx.fillText(text, 128, 48);
    ctx.font = 'bold 46px sans-serif';
    ctx.fillText('▼', 128, 104);
    const tex = new THREE.CanvasTexture(cnv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
    spr.scale.set(2.1, 1.15, 1);
    spr.renderOrder = 6;
    return spr;
  }

  _updateMarkers(elapsed) {
    const show = !this._outro;
    for (let i = 0; i < this.markers.length; i++) {
      const mk = this.markers[i];
      mk.ring.visible = show;
      mk.label.visible = show;
      if (!show) continue;
      const p = this.tops[i].group.position;
      mk.ring.position.set(p.x, this.arena.surfaceY(Math.hypot(p.x, p.z)) + 0.06, p.z);
      mk.ring.material.opacity = 0.7 + 0.25 * Math.sin(elapsed * 4 + i);
      mk.label.position.set(p.x, p.y + 2.4 + 0.12 * Math.sin(elapsed * 3 + i), p.z);
    }
  }

  _frame(dt, elapsed) {
    this._elapsed = elapsed;
    const sim = this.sim;

    if (this.playing && !sim.finished) {
      sim.advance(dt * this.speed);
    }

    // Drive tops from sim state.
    for (let i = 0; i < this.tops.length; i++) {
      const top = this.tops[i];
      const st = sim.tops[i];
      const frac = Math.max(0, st.stamina) / st.staminaMax;
      if (!this._outro || this._outro.loserIdx !== i) {
        const p = sim.renderPos(st);
        this._placeTop(top, p.x, p.z);
        top.update(dt * this.speed, this._spinRate(frac), 1 - frac, elapsed);
      }
    }

    // Consume events -> VFX + log.
    for (const ev of sim.drainEvents()) {
      this._handleEvent(ev);
    }

    // Finish outro.
    if (sim.finished && !this._outro && !this.finishedHandled) {
      this._beginOutro(sim.result);
    }
    if (this._outro) this._updateOutro(dt);

    this.sparks.update(dt);
    this.lightning.update(dt * this.speed);
    this._updateShock(dt * this.speed);
    this._updateMarkers(elapsed);
    this._updateCamera(dt);

    // Report live state for HTML bars.
    this.onState(
      sim.tops.map((t) => Math.max(0, t.stamina) / t.staminaMax),
      sim.time
    );
  }

  _handleEvent(ev) {
    if (ev.type === 'clash') {
      const y = this._worldClashY(ev.pos.x, ev.pos.z);
      const intensity = Math.min(1, ev.intensity / 22);
      // hot fire sparks (white-orange core), denser + faster than before
      this.sparks.burst(ev.pos.x, y, ev.pos.z, 0xff7a1e, 22 + Math.floor(intensity * 40), 5 + intensity * 8, 1.1);
      this.sparks.burst(ev.pos.x, y, ev.pos.z, 0xffd24a, 8 + Math.floor(intensity * 14), 3 + intensity * 4, 0.7);
      this._shockwave(ev.pos.x, y - 0.7, ev.pos.z, 2.2 + intensity * 4.0, 0xffc080);
      this._shake = Math.min(0.95, this._shake + 0.16 + intensity * 0.5);
      this._focus.set(ev.pos.x, y, ev.pos.z);
      this._focusWeight = 0.6;
      audio.clash(intensity);
      return;
    }
    if (ev.type === 'hit' && ev.crit) {
      // crit: bright burst on the target + LIGHTNING from the attacker's core
      const target = this.tops[ev.targetIdx];
      const tp = target.group.position;
      this.sparks.burst(tp.x, tp.y + 0.8, tp.z, this.tops[ev.byIdx].cfg.glow, 34, 8, 1.4);
      const att = this.tops[ev.byIdx];
      const ap = att.group.position;
      this.lightning.strike(ap.x, ap.y + 0.7, ap.z, att.cfg.glow);
      this._shockwave(ap.x, ap.y + 0.5, ap.z, 2.6, att.cfg.glow);
      this._shake = Math.min(1, this._shake + 0.45);
      audio.crit();
    }
    if (ev.type === 'knockback') {
      // crit shove — directional sparks off the knocked top
      const t = this.tops[ev.targetIdx];
      const p = t.group.position;
      this.sparks.burst(p.x, p.y + 0.6, p.z, 0xffd0a0, 18, 6, 1.1);
      this._shake = Math.min(1, this._shake + 0.25);
      audio.knockback();
    }
    // forward everything except pure-visual clash to the log/UI
    this.onEvent(ev);
  }

  _beginOutro(result) {
    this.finishedHandled = true;
    const loserIdx = result.loserIdx;
    const winnerIdx = result.winnerIdx;
    const loser = this.tops[loserIdx];
    this._outro = { t: 0, type: result.winType, loserIdx, winnerIdx, done: false, result };

    const pos = loser.group.position;
    if (result.winType === 'ringout') {
      // 彈飛 — fling the loser up and out of the bowl
      const dir = new THREE.Vector3(pos.x, 0, pos.z).normalize();
      if (dir.lengthSq() < 0.001) dir.set(1, 0, 0);
      this._outro.vel = new THREE.Vector3(dir.x * 12, 17, dir.z * 12);
      this._outro.spin = new THREE.Vector3((Math.random() - 0.5) * 22, 26, (Math.random() - 0.5) * 22);
      this.sparks.burst(pos.x, pos.y + 0.5, pos.z, loser.cfg.glow, 130, 12, 1.7);
      this._shockwave(pos.x, pos.y - 0.4, pos.z, 4.5, loser.cfg.glow);
      this._shake = 1.25;
      audio.ringout();
      audio.cheer();
    } else if (result.winType === 'burst') {
      // 解體 — the loser disassembles: detach its parts and blow them apart
      this._outro.frag = [];
      for (const part of [loser.parts.energy, loser.parts.disc, loser.parts.driver]) {
        const dir = new THREE.Vector3(Math.random() - 0.5, 0.6 + Math.random() * 0.7, Math.random() - 0.5).normalize();
        part.traverse((o) => {
          if (!o.material) return;
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
            m.transparent = true;
          });
        });
        this._outro.frag.push({
          part,
          vel: dir.multiplyScalar(3.4 + Math.random() * 2.6),
          spin: new THREE.Vector3((Math.random() - 0.5) * 26, (Math.random() - 0.5) * 26, (Math.random() - 0.5) * 26),
        });
      }
      loser.trailRing.visible = false;
      loser.blurRing.visible = false;
      this.sparks.burst(pos.x, pos.y + 0.7, pos.z, loser.cfg.glow, 150, 13, 1.9);
      this.sparks.burst(pos.x, pos.y + 0.7, pos.z, 0xffb24a, 80, 9, 1.4);
      this._shockwave(pos.x, pos.y + 0.2, pos.z, 5.5, loser.cfg.glow);
      this.lightning.strike(pos.x, pos.y + 0.6, pos.z, loser.cfg.glow);
      this._shake = 1.5;
      audio.burst();
      audio.cheer();
    } else {
      // 擊停 / 判定 — the loser topples and stops
      this._shake = 0.5;
      audio.spinout();
    }
  }

  _updateOutro(dt) {
    const o = this._outro;
    o.t += dt;
    const loser = this.tops[o.loserIdx];
    if (o.type === 'ringout' && o.vel) {
      o.vel.y -= 26 * dt;
      loser.group.position.x += o.vel.x * dt;
      loser.group.position.y += o.vel.y * dt;
      loser.group.position.z += o.vel.z * dt;
      loser.group.rotation.x += o.spin.x * dt;
      loser.group.rotation.z += o.spin.z * dt;
      loser.spinAngle += o.spin.y * dt;
      loser.group.rotation.y = loser.spinAngle;
    } else if (o.type === 'burst' && o.frag) {
      const fade = Math.max(0, 1 - o.t / 1.4);
      for (const f of o.frag) {
        f.vel.y -= 9 * dt;
        f.part.position.x += f.vel.x * dt;
        f.part.position.y += f.vel.y * dt;
        f.part.position.z += f.vel.z * dt;
        f.part.rotation.x += f.spin.x * dt;
        f.part.rotation.y += f.spin.y * dt;
        f.part.rotation.z += f.spin.z * dt;
        f.part.traverse((o2) => {
          if (!o2.material) return;
          (Array.isArray(o2.material) ? o2.material : [o2.material]).forEach((m) => {
            m.opacity = fade;
          });
        });
      }
    } else {
      // topple: tilt over and slow the spin
      const k = Math.min(1, o.t / 1.4);
      loser.update(dt, this._spinRate(0) * (1 - k), 1, this._elapsed);
      loser.group.rotation.x = (Math.PI / 2.4) * k;
      loser.group.position.y = this.arena.surfaceY(
        Math.hypot(loser.group.position.x, loser.group.position.z)
      ) + LIFT - 0.3 * k;
    }
    if (!o.done && o.t > 1.7) {
      o.done = true;
      this.onFinish(o.result);
    }
  }

  _updateCamera(dt) {
    this.camAngle += dt * 0.06;
    // smooth focus back toward center
    if (this._focusWeight > 0) this._focusWeight = Math.max(0, this._focusWeight - dt * 1.2);
    const fw = this._focusWeight || 0;
    this._camTarget.set(
      Math.cos(this.camAngle) * this.camR,
      this.camH,
      Math.sin(this.camAngle) * this.camR
    );
    // shake
    this._shake = Math.max(0, this._shake - dt * 2.4);
    if (this._shake > 0) {
      this._camTarget.x += (Math.random() - 0.5) * this._shake * 1.6;
      this._camTarget.y += (Math.random() - 0.5) * this._shake * 1.2;
      this._camTarget.z += (Math.random() - 0.5) * this._shake * 1.6;
    }
    this.stage.camera.position.lerp(this._camTarget, 1 - Math.pow(0.001, dt));
    // look target lerps between center and last clash point
    this._tmp.set(0, 0.5, 0).lerp(this._focus, fw * 0.6);
    this.stage.camera.lookAt(this._tmp);
  }

  dispose() {
    this.tops.forEach((t) => t.dispose());
    this.arena.dispose();
    this.sparks.dispose();
    this.lightning.dispose();
    this.shock.forEach((s) => {
      s.mesh.geometry.dispose();
      s.mesh.material.dispose();
    });
    this.markers.forEach((mk) => {
      mk.ring.geometry.dispose();
      mk.ring.material.dispose();
      mk.label.material.map.dispose();
      mk.label.material.dispose();
    });
  }
}
