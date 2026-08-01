import * as THREE from 'three';

function createSparkTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.9)');
  gradient.addColorStop(0.5, 'rgba(255, 200, 100, 0.4)');
  gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

// ─────────────────────────────────────────────────────────────
//  GPU particle-pool spark system.
//  A single THREE.Points mesh with pre-allocated buffers replaces
//  the previous per-spark Mesh approach for much better perf.
//
//  Public API:
//    emit(x, z, intensity)        — legacy compat (game.ts events)
//    triggerSpark(contact, normal) — physics-aware directional burst
//    burst(x, z)                  — ring-out / burst finish explosion
//    update(dt)                   — per-frame simulation step
// ─────────────────────────────────────────────────────────────

const MAX_PARTICLES = 600;
const GRAVITY = -14;
const DRAG = 0.95;

interface ParticleState {
  alive: boolean;
  life: number;
  maxLife: number;
  size: number;
}

const textureLoader = new THREE.TextureLoader();
const kenneySparkTexture = textureLoader.load('/textures/vfx/spark_01.png');

export class SparksSystem {
  readonly root = new THREE.Group();
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly sizes: Float32Array;
  private readonly particles: ParticleState[];
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.PointsMaterial;
  private nextSlot = 0;

  constructor() {
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.velocities = new Float32Array(MAX_PARTICLES * 3);
    this.sizes = new Float32Array(MAX_PARTICLES);

    this.particles = Array.from({ length: MAX_PARTICLES }, () => ({
      alive: false,
      life: 0,
      maxLife: 1,
      size: 0,
    }));

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    this.material = new THREE.PointsMaterial({
      color: 0xffdd66,
      size: 1.4, // Large, impactful sparks
      sizeAttenuation: true,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      map: kenneySparkTexture || createSparkTexture(),
    });

    const points = new THREE.Points(this.geometry, this.material);
    points.frustumCulled = false;
    this.root.add(points);
  }

  // ── Legacy interface (kept for game.ts event compatibility) ───
  emit(x: number, z: number, intensity: number) {
    const count = Math.floor(15 + intensity * 25);
    for (let i = 0; i < count; i++) {
      this.spawnOne(
        x + (Math.random() - 0.5) * 0.35,
        0.35,
        z + (Math.random() - 0.5) * 0.35,
        (Math.random() - 0.5) * 6.5 * intensity,
        3 + Math.random() * 7 * intensity,
        (Math.random() - 0.5) * 6.5 * intensity,
        0.4 + Math.random() * 0.5 * intensity,
        0.3 + intensity * 0.25,
      );
    }
  }

  // ── Physics-aware directional burst ──────────────────────
  triggerSpark(contactPoint: THREE.Vector3, normal: THREE.Vector3) {
    // Compute a tangent plane to scatter particles along.
    // Tangent = any vector perpendicular to normal.
    const tangent = new THREE.Vector3();
    if (Math.abs(normal.y) < 0.99) {
      tangent.crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize();
    } else {
      tangent.crossVectors(normal, new THREE.Vector3(1, 0, 0)).normalize();
    }
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();

    const count = 20 + Math.floor(Math.random() * 10);
    for (let i = 0; i < count; i++) {
      const speed = 2.5 + Math.random() * 5;
      // Fan out mostly along the tangent plane with some normal push.
      const tWeight = (Math.random() - 0.5) * 2;
      const bWeight = (Math.random() - 0.5) * 2;
      const nWeight = 0.3 + Math.random() * 0.7;

      const vx = (tangent.x * tWeight + bitangent.x * bWeight + normal.x * nWeight) * speed;
      const vy = (tangent.y * tWeight + bitangent.y * bWeight + normal.y * nWeight) * speed + 1.5 + Math.random() * 2;
      const vz = (tangent.z * tWeight + bitangent.z * bWeight + normal.z * nWeight) * speed;

      this.spawnOne(
        contactPoint.x + (Math.random() - 0.5) * 0.15,
        contactPoint.y + 0.1,
        contactPoint.z + (Math.random() - 0.5) * 0.15,
        vx, vy, vz,
        0.15 + Math.random() * 0.2,
        0.3 + Math.random() * 0.3,
      );
    }
  }

  burst(x: number, z: number) {
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 5;
      this.spawnOne(
        x + (Math.random() - 0.5) * 0.5,
        0.28,
        z + (Math.random() - 0.5) * 0.5,
        Math.cos(angle) * speed,
        2 + Math.random() * 5,
        Math.sin(angle) * speed,
        0.2 + Math.random() * 0.25,
        0.35 + Math.random() * 0.25,
      );
    }
  }

  // ── Edge grinding sparks (dark red/orange micro-trails) ────
  // Called continuously while a top slides near the arena rim.
  // Deliberately tiny and short-lived to distinguish from
  // bright orange collision sparks.
  emitGrindSparks(x: number, z: number, speed: number) {
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      // Tangential direction from centre outward.
      const radial = Math.atan2(z, x);
      const tangent = radial + Math.PI / 2 + (Math.random() - 0.5) * 0.8;
      const spd = 1.2 + speed * 0.5 + Math.random() * 1.5;
      this.spawnOne(
        x + (Math.random() - 0.5) * 0.15,
        0.06 + Math.random() * 0.08,
        z + (Math.random() - 0.5) * 0.15,
        Math.cos(tangent) * spd,
        0.3 + Math.random() * 0.8,
        Math.sin(tangent) * spd,
        0.05 + Math.random() * 0.05,
        0.15 + Math.random() * 0.1,
      );
    }
  }

  emitAbsorb(x: number, z: number, intensity: number) {
    const count = Math.floor(12 + intensity * 20);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.2 + Math.random() * 2.2;
      const px = x + Math.cos(angle) * radius;
      const pz = z + Math.sin(angle) * radius;
      // Inward vector with a tangential swirl component
      const inwardX = (x - px) + Math.sin(angle) * 0.5;
      const inwardZ = (z - pz) - Math.cos(angle) * 0.5;
      const len = Math.max(0.001, Math.hypot(inwardX, inwardZ));
      const speed = 4.0 + Math.random() * 3.5 + intensity * 2.0;

      this.spawnOne(
        px,
        0.1 + Math.random() * 0.6,
        pz,
        (inwardX / len) * speed,
        (Math.random() - 0.2) * 1.5, // Spiral inward and slightly upward
        (inwardZ / len) * speed,
        0.4 + Math.random() * 0.5 * (1 + intensity),
        0.2 + Math.random() * 0.25,
      );
    }
  }

  update(dt: number) {
    let anyAlive = false;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        this.positions[i * 3 + 1] = -999;   // hide offscreen
        this.sizes[i] = 0;
        continue;
      }

      anyAlive = true;
      const i3 = i * 3;

      // Apply gravity to Y velocity.
      this.velocities[i3 + 1] += GRAVITY * dt;

      // Drag.
      this.velocities[i3] *= DRAG;
      this.velocities[i3 + 1] *= DRAG;
      this.velocities[i3 + 2] *= DRAG;

      // Integrate position.
      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * dt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt;

      // Size fades out as life → 0 (quadratic falloff).
      const t = Math.max(0, p.life / p.maxLife);
      this.sizes[i] = p.size * t * t;
    }

    // Only flag GPU upload when there are active particles.
    if (anyAlive) {
      (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.geometry.attributes.size as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  // ── Internal: ring-buffer particle spawn ─────────────────
  private spawnOne(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    size: number,
    lifetime: number,
  ) {
    const i = this.nextSlot;
    this.nextSlot = (this.nextSlot + 1) % MAX_PARTICLES;

    const i3 = i * 3;
    this.positions[i3] = x;
    this.positions[i3 + 1] = y;
    this.positions[i3 + 2] = z;

    this.velocities[i3] = vx;
    this.velocities[i3 + 1] = vy;
    this.velocities[i3 + 2] = vz;

    this.sizes[i] = size;

    this.particles[i].alive = true;
    this.particles[i].life = lifetime;
    this.particles[i].maxLife = lifetime;
    this.particles[i].size = size;
  }
}
