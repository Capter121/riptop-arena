import * as THREE from 'three';
import type { TopEntity } from '../gameplay/top';

function createParticleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

const MAX_PARTICLES = 800;

interface TrailParticle {
  alive: boolean;
  life: number;
  maxLife: number;
  sizeMult: number;
  growth: number;
}

export class TrailsSystem {
  readonly root = new THREE.Group();
  
  private readonly positions = new Float32Array(MAX_PARTICLES * 3);
  private readonly velocities = new Float32Array(MAX_PARTICLES * 3);
  private readonly colors = new Float32Array(MAX_PARTICLES * 3);
  private readonly sizes = new Float32Array(MAX_PARTICLES);
  private readonly particles: TrailParticle[] = [];
  
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.PointsMaterial;
  
  private nextSlot = 0;

  constructor() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({ alive: false, life: 0, maxLife: 1, sizeMult: 1, growth: 0 });
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    this.material = new THREE.PointsMaterial({
      size: 1.0,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      map: createParticleTexture(),
    });

    const points = new THREE.Points(this.geometry, this.material);
    points.frustumCulled = false;
    // renderOrder 1 to stay slightly under sparks
    points.renderOrder = 1;
    this.root.add(points);
  }

  reset() {
    for (const p of this.particles) {
      p.alive = false;
    }
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.sizes[i] = 0;
      this.positions[i * 3 + 1] = -999;
    }
  }

  emitTrail(top: TopEntity, colorHex: number) {
    if (!top.alive) return;
    const speed = top.velocity.length();
    const spinRatio = top.spin / Math.max(0.1, top.stats.maxSpin);
    
    // Always emit particles based on spin, more if moving fast
    const count = Math.floor(spinRatio * 2 + speed * 0.5);
    if (count <= 0) return;

    const color = new THREE.Color(colorHex);

    for (let i = 0; i < count; i++) {
      const vx = top.velocity.x * 0.1 + (Math.random() - 0.5) * 1.5 * spinRatio;
      const vz = top.velocity.y * 0.1 + (Math.random() - 0.5) * 1.5 * spinRatio;
      const vy = Math.random() * 0.5; // slight upward drift

      this.spawnOne(
        top.position.x + (Math.random() - 0.5) * 0.4,
        0.1 + Math.random() * 0.2,
        top.position.y + (Math.random() - 0.5) * 0.4,
        vx, vy, vz,
        color.r, color.g, color.b,
        0.25 + Math.random() * 0.15 * spinRatio, // size scaled by spin
        0.4 + Math.random() * 0.4,  // lifetime
        -0.5 // shrinks
      );
    }
  }

  // ── Emit dash burst / friction smoke ──
  emitSmoke(x: number, y: number, z: number, colorHex: number, count: number, sizeBase: number = 0.5) {
    const color = new THREE.Color(colorHex);
    // Darker, lower intensity color for smoke effect
    color.multiplyScalar(0.4); 

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = Math.random() * 3.0;
      
      this.spawnOne(
        x + (Math.random() - 0.5) * 0.3,
        y + Math.random() * 0.3,
        z + (Math.random() - 0.5) * 0.3,
        Math.cos(angle) * spd,
        Math.random() * 1.5, // floats up
        Math.sin(angle) * spd,
        color.r, color.g, color.b,
        sizeBase + Math.random() * 0.3,
        0.6 + Math.random() * 0.4,
        1.2 // expands
      );
    }
  }

  // Update called by game.ts every frame
  update(dt: number, player: TopEntity, enemy: TopEntity) {
    // Generate trails automatically
    this.emitTrail(player, 0x00ffff); // cyan
    this.emitTrail(enemy, 0xff5500);  // orange

    let anyAlive = false;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        this.positions[i * 3 + 1] = -999;
        this.sizes[i] = 0;
        continue;
      }

      anyAlive = true;
      const i3 = i * 3;

      // Drag
      this.velocities[i3] *= 0.95;
      this.velocities[i3+1] *= 0.95;
      this.velocities[i3+2] *= 0.95;

      // Integrate
      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3+1] += this.velocities[i3+1] * dt;
      this.positions[i3+2] += this.velocities[i3+2] * dt;

      // Size evolution
      const t = p.life / p.maxLife; // 1 to 0
      let currentSize = p.sizeMult;
      if (p.growth > 0) {
        // Expands as it dies (Smoke)
        currentSize *= 1 + (1 - t) * p.growth;
      } else {
        // Shrinks as it dies (Trail)
        currentSize *= t;
      }
      // Quad fade out
      this.sizes[i] = currentSize * (t * t);
    }

    if (anyAlive) {
      (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.geometry.attributes.size as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  private spawnOne(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    r: number, g: number, b: number,
    size: number, life: number, growth: number
  ) {
    const i = this.nextSlot;
    this.nextSlot = (this.nextSlot + 1) % MAX_PARTICLES;

    const i3 = i * 3;
    this.positions[i3] = x;
    this.positions[i3+1] = y;
    this.positions[i3+2] = z;

    this.velocities[i3] = vx;
    this.velocities[i3+1] = vy;
    this.velocities[i3+2] = vz;

    this.colors[i3] = r;
    this.colors[i3+1] = g;
    this.colors[i3+2] = b;

    this.sizes[i] = size;

    this.particles[i].alive = true;
    this.particles[i].life = life;
    this.particles[i].maxLife = life;
    this.particles[i].sizeMult = size;
    this.particles[i].growth = growth;

    // Need color update if we overwrote it
    (this.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}
