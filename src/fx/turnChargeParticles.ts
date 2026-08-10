import * as THREE from 'three';

const MAX_PARTICLES = 192;
const PARTICLES_PER_EMISSION = 16;

interface ParticleState {
  alive: boolean;
  life: number;
}

const sparkTexture = new THREE.TextureLoader().load('/textures/vfx/spark_01.png');

export class TurnChargeParticles {
  readonly root = new THREE.Group();
  private readonly positions = new Float32Array(MAX_PARTICLES * 3);
  private readonly velocities = new Float32Array(MAX_PARTICLES * 3);
  private readonly particles = Array.from<unknown, ParticleState>({ length: MAX_PARTICLES }, () => ({
    alive: false,
    life: 0,
  }));
  private readonly geometry = new THREE.BufferGeometry();
  private nextSlot = 0;

  constructor() {
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      this.positions[i * 3 + 1] = -999;
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xffdd66,
      size: 0.77,
      sizeAttenuation: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      map: sparkTexture,
    });
    const points = new THREE.Points(this.geometry, material);
    points.frustumCulled = false;
    this.root.add(points);
  }

  emit(x: number, z: number) {
    for (let i = 0; i < PARTICLES_PER_EMISSION; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.7 + Math.random() * 1.1;
      const px = x + Math.cos(angle) * radius;
      const pz = z + Math.sin(angle) * radius;
      const inwardX = (x - px) + Math.sin(angle) * 0.28;
      const inwardZ = (z - pz) - Math.cos(angle) * 0.28;
      const length = Math.max(0.001, Math.hypot(inwardX, inwardZ));
      const speed = 4.8 + Math.random() * 2.2;

      this.spawnOne(
        px,
        0.12 + Math.random() * 0.38,
        pz,
        (inwardX / length) * speed,
        (Math.random() - 0.2) * 0.8,
        (inwardZ / length) * speed,
        0.2 + Math.random() * 0.15,
      );
    }

    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  update(dt: number) {
    let positionsChanged = false;

    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      const particle = this.particles[i];
      if (!particle.alive) continue;

      particle.life -= dt;
      const i3 = i * 3;
      if (particle.life <= 0) {
        particle.alive = false;
        this.positions[i3 + 1] = -999;
        positionsChanged = true;
        continue;
      }

      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * dt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt;
      positionsChanged = true;
    }

    if (positionsChanged) {
      (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  private spawnOne(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    lifetime: number,
  ) {
    const i = this.nextSlot;
    const i3 = i * 3;
    this.nextSlot = (this.nextSlot + 1) % MAX_PARTICLES;

    this.positions[i3] = x;
    this.positions[i3 + 1] = y;
    this.positions[i3 + 2] = z;
    this.velocities[i3] = vx;
    this.velocities[i3 + 1] = vy;
    this.velocities[i3 + 2] = vz;
    this.particles[i].alive = true;
    this.particles[i].life = lifetime;
  }
}
