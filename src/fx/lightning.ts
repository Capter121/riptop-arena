import * as THREE from 'three';

const SLOTS = 5;
const BOLTS = 6;
const SEGS = 5;

interface LightningItem {
  ls: THREE.LineSegments;
  pos: Float32Array;
  life: number;
  maxLife: number;
  flick: number;
  origin: THREE.Vector3;
}

export class LightningFX {
  readonly root = new THREE.Group();
  private items: LightningItem[] = [];
  private head = 0;

  constructor() {
    for (let i = 0; i < SLOTS; i++) {
      const pos = new Float32Array(BOLTS * SEGS * 2 * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ls = new THREE.LineSegments(geo, mat);
      ls.frustumCulled = false;
      ls.visible = false;
      ls.renderOrder = 4;
      this.root.add(ls);
      this.items.push({
        ls,
        pos,
        life: 0,
        maxLife: 0.34,
        flick: 0,
        origin: new THREE.Vector3(),
      });
    }
  }

  strike(x: number, y: number, z: number, colorHex: number = 0x00ffff) {
    const it = this.items[this.head];
    this.head = (this.head + 1) % this.items.length;
    it.origin.set(x, y, z);
    it.life = it.maxLife = 0.34;
    it.flick = 0;
    (it.ls.material as THREE.LineBasicMaterial).color.setHex(colorHex);
    it.ls.visible = true;
    this._regen(it);
  }

  private _regen(it: LightningItem) {
    const p = it.pos;
    const ox = it.origin.x;
    const oy = it.origin.y;
    const oz = it.origin.z;
    let o = 0;
    for (let b = 0; b < BOLTS; b++) {
      const az = Math.random() * Math.PI * 2;
      const el = 0.25 + Math.random() * 1.0; // Random elevation
      const dx = Math.cos(az) * Math.cos(el);
      const dy = Math.sin(el) + 0.35; // Bias upwards
      const dz = Math.sin(az) * Math.cos(el);
      const len = 0.6 + Math.random() * 0.9;
      let px = ox;
      let py = oy;
      let pz = oz;
      for (let s = 0; s < SEGS; s++) {
        const t1 = (s + 1) / SEGS;
        const j = 0.2; // Jitter amount
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

  update(dt: number) {
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      it.flick -= dt;
      if (it.flick <= 0 && it.life > 0) {
        this._regen(it);
        it.flick = 0.045; // 45ms per flicker
      }
      const k = Math.max(0, it.life / it.maxLife);
      (it.ls.material as THREE.LineBasicMaterial).opacity = k;
      if (it.life <= 0) it.ls.visible = false;
    }
  }
}
