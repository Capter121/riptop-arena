import * as THREE from 'three';
import { ARENA_RADIUS } from '../app/config';
import type { TopEntity } from './top';
import { ArenaScene } from '../scene/arena';

export class PickupManager {
  readonly root = new THREE.Group();
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.Material;
  private readonly mesh: THREE.Mesh;

  active = false;
  private respawnTimer = 2.0;
  private lifespanTimer = 0.0;

  constructor() {
    this.geo = new THREE.OctahedronGeometry(0.4, 0);
    this.mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x88ccff,
      emissiveIntensity: 2.0,
      roughness: 0.2,
      metalness: 0.8,
      transparent: true,
      opacity: 0.9,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.visible = false;
    
    const glowGeo = new THREE.OctahedronGeometry(0.55, 0);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x00aaff,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
    });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    this.mesh.add(glowMesh);

    this.root.add(this.mesh);
  }

  reset() {
    this.active = false;
    this.respawnTimer = 2.0;
    this.lifespanTimer = 0;
    this.mesh.visible = false;
  }

  update(dt: number, time: number, player: TopEntity, autoRespawn: boolean = true): boolean {
    if (!this.active) {
      if (autoRespawn) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) {
          this.spawn();
        }
      }
      return false;
    }

    // Active state
    this.lifespanTimer -= dt;
    if (this.lifespanTimer <= 0) {
      // Despawn
      this.active = false;
      this.mesh.visible = false;
      this.respawnTimer = 2.0;
      return false;
    }

    // Floating animation
    this.mesh.rotation.y += dt * 2.0;
    this.mesh.rotation.z += dt * 1.5;
    const height = ArenaScene.getTerrainHeight(this.mesh.position.length());
    this.mesh.position.y = height + 0.8 + Math.sin(time * 3) * 0.2;

    // Pulse opacity
    (this.mat as THREE.MeshStandardMaterial).opacity = 0.6 + Math.sin(time * 8) * 0.4;

    // Collision detection with player
    const distSq = this.mesh.position.distanceToSquared(
      new THREE.Vector3(player.position.x, this.mesh.position.y, player.position.y)
    );

    if (distSq < 1.2 * 1.2) { // Pickup radius
      this.pickup(player);
      return true; // Picked up this frame
    }

    return false;
  }

  private spawn() {
    // Random position in the arena (avoiding exact center and extreme edges)
    const angle = Math.random() * Math.PI * 2;
    const radius = 2.0 + Math.random() * (ARENA_RADIUS - 4.0);
    this.spawnAt(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }

  spawnAt(x: number, z: number, lifespan: number = 8.0) {
    this.active = true;
    this.lifespanTimer = lifespan;
    this.mesh.visible = true;
    this.mesh.position.x = x;
    this.mesh.position.z = z;
    
    // Scale up animation
    this.mesh.scale.set(0.01, 0.01, 0.01);
    const grow = () => {
      if (!this.active) return;
      this.mesh.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
      if (this.mesh.scale.x < 0.99) requestAnimationFrame(grow);
    };
    grow();
  }

  forceDespawn() {
    this.active = false;
    this.mesh.visible = false;
  }

  private pickup(player: TopEntity) {
    this.active = false;
    this.mesh.visible = false;
    this.respawnTimer = 2.0;
    
    // Grant spin (15% of max spin or fixed amount)
    const healAmount = Math.max(120, player.stats.maxSpin * 0.15);
    player.spin = Math.min(player.stats.maxSpin, player.spin + healAmount);
    // Also heal stamina to prevent spin finish logic
    player.stamina = Math.min(player.stats.maxSpin, player.stamina + healAmount);
  }
}
