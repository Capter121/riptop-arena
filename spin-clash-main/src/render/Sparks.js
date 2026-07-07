// CPU-pooled additive spark bursts (Points + ShaderMaterial). One draw call,
// fixed pool, per-particle colour. Used for collision sparks and ring-out bursts.

import * as THREE from 'three';

const MAX = 900;

export class SparkField {
  constructor() {
    this.count = MAX;
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.head = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setDrawRange(0, MAX);
    this.geo = geo;

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 540 } },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        uniform float uScale;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (uScale / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = dot(d, d);
          if (r > 0.25) discard;
          float glow = smoothstep(0.25, 0.0, r);
          gl_FragColor = vec4(vColor * (1.4 + glow), vAlpha * glow);
        }
      `,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    this._c = new THREE.Color();
  }

  get object3d() {
    return this.points;
  }

  burst(x, y, z, colorHex, count = 24, speed = 4, spread = 1) {
    this._c.set(colorHex);
    for (let i = 0; i < count; i++) {
      const idx = this.head;
      this.head = (this.head + 1) % MAX;
      const b = idx * 3;
      this.pos[b] = x;
      this.pos[b + 1] = y;
      this.pos[b + 2] = z;
      // random direction biased upward/outward
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.5;
      const sp = speed * (0.4 + Math.random() * 0.9) * spread;
      this.vel[b] = Math.cos(theta) * Math.sin(phi) * sp;
      this.vel[b + 1] = Math.cos(phi) * sp * 1.1 + 1.5;
      this.vel[b + 2] = Math.sin(theta) * Math.sin(phi) * sp;
      // colour with slight white-hot variance
      const w = 0.65 + Math.random() * 0.35;
      this.col[b] = THREE.MathUtils.lerp(this._c.r, 1, 1 - w) ;
      this.col[b + 1] = THREE.MathUtils.lerp(this._c.g, 1, 1 - w);
      this.col[b + 2] = THREE.MathUtils.lerp(this._c.b, 1, 1 - w);
      this.maxLife[idx] = 0.4 + Math.random() * 0.5;
      this.life[idx] = this.maxLife[idx];
      this.size[idx] = 0.05 + Math.random() * 0.09;
      this.alpha[idx] = 1;
    }
  }

  update(dt) {
    const { pos, vel, life, maxLife, alpha } = this;
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) {
        if (alpha[i] !== 0) alpha[i] = 0;
        continue;
      }
      life[i] -= dt;
      const b = i * 3;
      vel[b + 1] -= 11 * dt; // gravity
      vel[b] *= 0.98;
      vel[b + 2] *= 0.98;
      pos[b] += vel[b] * dt;
      pos[b + 1] += vel[b + 1] * dt;
      pos[b + 2] += vel[b + 2] * dt;
      alpha[i] = Math.max(0, life[i] / maxLife[i]);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    this.material.dispose();
  }
}
