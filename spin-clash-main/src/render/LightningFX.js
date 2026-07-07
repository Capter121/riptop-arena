// Pooled electric lightning bursts for crits — jagged additive bolts radiating
// from a top's core that flicker for a moment then fade (thin lines bloom).

import * as THREE from 'three';

const SLOTS = 5;
const BOLTS = 6;
const SEGS = 5;

export class LightningFX {
  constructor() {
    this.group = new THREE.Group();
    this.items = [];
    for (let i = 0; i < SLOTS; i++) {
      const pos = new Float32Array(BOLTS * SEGS * 2 * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.LineBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const ls = new THREE.LineSegments(geo, mat);
      ls.frustumCulled = false;
      ls.visible = false;
      ls.renderOrder = 4;
      this.group.add(ls);
      this.items.push({ ls, pos, life: 0, maxLife: 0.34, flick: 0, origin: new THREE.Vector3() });
    }
    this.head = 0;
  }

  get object3d() {
    return this.group;
  }

  strike(x, y, z, colorHex) {
    const it = this.items[this.head];
    this.head = (this.head + 1) % this.items.length;
    it.origin.set(x, y, z);
    it.life = it.maxLife = 0.34;
    it.flick = 0;
    it.ls.material.color.set(colorHex);
    it.ls.visible = true;
    this._regen(it);
  }

  _regen(it) {
    const p = it.pos;
    const ox = it.origin.x;
    const oy = it.origin.y;
    const oz = it.origin.z;
    let o = 0;
    for (let b = 0; b < BOLTS; b++) {
      const az = Math.random() * Math.PI * 2;
      const el = 0.25 + Math.random() * 1.0;
      const dx = Math.cos(az) * Math.cos(el);
      const dy = Math.sin(el) + 0.35;
      const dz = Math.sin(az) * Math.cos(el);
      const len = 0.6 + Math.random() * 0.9;
      let px = ox;
      let py = oy;
      let pz = oz;
      for (let s = 0; s < SEGS; s++) {
        const t1 = (s + 1) / SEGS;
        const j = 0.2;
        const nx = ox + dx * len * t1 + (Math.random() - 0.5) * j;
        const ny = oy + dy * len * t1 + (Math.random() - 0.5) * j;
        const nz = oz + dz * len * t1 + (Math.random() - 0.5) * j;
        p[o++] = px; p[o++] = py; p[o++] = pz;
        p[o++] = nx; p[o++] = ny; p[o++] = nz;
        px = nx; py = ny; pz = nz;
      }
    }
    it.ls.geometry.attributes.position.needsUpdate = true;
  }

  update(dt) {
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      it.flick -= dt;
      if (it.flick <= 0 && it.life > 0) {
        this._regen(it);
        it.flick = 0.045;
      }
      const k = Math.max(0, it.life / it.maxLife);
      it.ls.material.opacity = k;
      if (it.life <= 0) it.ls.visible = false;
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
