import * as THREE from 'three';
import { type BuildSelection, getPartById } from '../data/parts';
import { globalInventory } from '../data/inventoryManager';
import { BASE_COMPONENTS } from '../data/recipes';

import { MAX_BURST, RING_EXTRUDE_DEPTH, TOP_HEIGHT, DRIVER_FIN_COUNT } from '../app/config';
import { buildStats, type BattleStats } from './build';
import { clamp } from '../utils/math';
import { createTopGeometry } from '../scene/topGeometry';
import { createTopMaterials, getDynamicComponentMaterial, type TopMaterialSet } from '../scene/topMaterials';
import { ArenaScene } from '../scene/arena';
import {
  DEFAULT_BATTLE_FLAGS,
  DEFAULT_TACTICAL_MODE,
  ELEMENT_ATTACKS,
  type BattleFlags,
  type ElementAttackSkillId,
  type QueuedTagState,
  type TacticalMode,
  type TimedStatusEffect,
  type TurnVisual,
} from '../types/battle';
import type { PartUpgradeLevels, UpgradeLevels } from '../app/progression';

export type TopSide = 'player' | 'enemy';

type TurnMotionState = {
  visual: TurnVisual;
  remaining: number;
  duration: number;
  element?: ElementAttackSkillId;
};

// ─────────────────────────────────────────────────────────────
//  Phase 2 TopEntity — next-gen modular top with:
//    • Bowl-stack vertical hierarchy (Ring > WeightDisc > Core > Driver)
//    • Mechanical rivets (InstancedMesh, 1 draw call)
//    • UV energy flow groove mesh
//    • Shutter-speed illusion: Ring rotates at 0.4× + Yaw Jitter
//      while Core/WeightDisc spin at full speed
// ─────────────────────────────────────────────────────────────

export class TopEntity {
  readonly side: TopSide;
  readonly build: BuildSelection;
  readonly stats: BattleStats;
  readonly position = new THREE.Vector2();
  readonly velocity = new THREE.Vector2();
  readonly mesh: THREE.Group;

  // ── Sub-meshes accessible for per-part rotation ───────────
  readonly ring: THREE.Mesh;
  readonly weightDisc: THREE.Mesh;
  readonly core: THREE.Mesh;
  readonly driver: THREE.Mesh;
  private readonly driverGroup: THREE.Group;
  private readonly rivets: THREE.InstancedMesh;
  private readonly energyFlowMesh: THREE.Mesh;
  private readonly blurRing: THREE.Mesh;
  private readonly mats: TopMaterialSet;

  /** Effective outer radius for collision detection. */
  readonly collisionRadius: number;

  // ── Accumulated rotation angles (separate for illusion) ───
  private ringAngle = 0;
  private coreAngle = 0;

  spin: number;
  spirit: number;
  maxSpirit: number;
  stamina: number;
  integrity: number;
  lockStability: number;
  burst: number;
  /** Permanent MOI (moment of inertia) penalty from nuclear impact hits. */
  moiPenalty = 0;
  shieldHits = 0;
  hasRubberTip: boolean;
  tacticalMode: TacticalMode = DEFAULT_TACTICAL_MODE;
  invulnerableUntil = 0;
  statusEffects: TimedStatusEffect[] = [];
  queuedTagState: QueuedTagState | null = null;
  flags: BattleFlags = DEFAULT_BATTLE_FLAGS();
  tilt = 0;
  alive = true;
  dashCooldown = 0;
  stunTimer = 0;
  deathTimer = 0;
  turnMotion: TurnMotionState = { visual: 'idle', remaining: 0, duration: 0 };

  // ── Elemental Skill States & Visuals ─────────────────
  isFrozen = false;
  isTransformedToSheep = false;
  clones: THREE.Group[] = []; // Changed to Group because we clone the entire mesh
  lightningTimer = 0;
  lightningLines: THREE.Object3D[] = [];
  windMeshes: THREE.Mesh[] = [];
  waterRippleMesh: THREE.Mesh | null = null;
  fireMeshes: THREE.Mesh[] = [];
  frostGroup: THREE.Group | null = null;
  cloneTimer = 0;

  // ── Shield Mesh (Absolute Defense visual) ─────────────────
  private shieldMesh: THREE.Mesh | null = null;
  /** Effective MOI = base weight minus accumulated penalties. */
  get effectiveWeight(): number {
    return Math.max(0.5, this.stats.weight - this.moiPenalty * 0.01);
  }

  constructor(side: TopSide, build: BuildSelection, upgrades?: UpgradeLevels, partUpgrades?: PartUpgradeLevels) {
    this.side = side;
    this.build = build;
    this.stats = buildStats(build as any, upgrades, partUpgrades);
    this.spin = this.stats.maxSpin;
    this.maxSpirit = 100;
    this.spirit = 0;
    this.stamina = this.stats.maxSpin;
    this.integrity = this.stats.maxIntegrity;
    this.lockStability = 100;
    this.burst = 0;
    this.mesh = new THREE.Group();

    
    // Map instances to parts
    const ringInst = globalInventory.getItems().find(i => i.instanceId === build.attackRing);
    const coreInst = globalInventory.getItems().find(i => i.instanceId === build.core);
    const driverInst = globalInventory.getItems().find(i => i.instanceId === build.driver);

    const ringBase = ringInst ? BASE_COMPONENTS[ringInst.baseTemplateId] : null;
    const coreBase = coreInst ? BASE_COMPONENTS[coreInst.baseTemplateId] : null;
    const driverBase = driverInst ? BASE_COMPONENTS[driverInst.baseTemplateId] : null;

    const ringPart = ringBase?.visualId ? getPartById(ringBase.visualId) : getPartById(build.attackRing || 'round');
    const corePart = coreBase?.visualId ? getPartById(coreBase.visualId) : getPartById(build.core || 'balanced');
    const driverPart = driverBase?.visualId ? getPartById(driverBase.visualId) : getPartById(build.driver || 'grip');

    this.hasRubberTip = TopEntity.isRubberTipDriver(driverPart!.id);

    // ── Procedural geometry ────────────────────────────────
    const geo = createTopGeometry();
    this.collisionRadius = geo.collisionRadius;

    // ── PBR materials ──────────────────────────────────────
    this.mats = createTopMaterials(ringPart!.color, corePart!.color, driverPart!.color);

    // Apply materials based on instance attributes
    if (ringInst) {
      this.mats.ring = [
        getDynamicComponentMaterial(ringInst.attribute, ringInst.tier, 'ring'),
        (this.mats.ring as THREE.Material[])[1],
      ];
    }
    if (coreInst) {
      this.mats.core = getDynamicComponentMaterial(coreInst.attribute, coreInst.tier, 'core') as THREE.MeshStandardMaterial;
    }
    if (driverInst) {
      this.mats.driver = getDynamicComponentMaterial(driverInst.attribute, driverInst.tier, 'driver') as THREE.MeshStandardMaterial;
    }

    // ── 1. Attack Ring (highest layer) ─────────────────────
    // ExtrudeGeometry extrudes along Z; rotate -90° around X → Y-up.
    this.ring = new THREE.Mesh(geo.ring, this.mats.ring);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = TOP_HEIGHT * 0.25 - RING_EXTRUDE_DEPTH / 2;

    // ── 2. Weight Disc (between Ring and Core) ─────────────
    this.weightDisc = new THREE.Mesh(geo.weightDisc, this.mats.weightDisc);
    this.weightDisc.rotation.x = -Math.PI / 2;
    this.weightDisc.position.y = TOP_HEIGHT * 0.08;

    // ── 3. Core (bowl-concave centre) ──────────────────────
    this.core = new THREE.Mesh(geo.core, this.mats.core);
    this.core.rotation.x = -Math.PI / 2;
    this.core.position.y = 0;

    // ── 4. Driver + Fins (lowest) ──────────────────────────
    this.driver = new THREE.Mesh(geo.driver, this.mats.driver);
    this.driver.rotation.x = Math.PI; // flip cone downward
    this.driver.position.y = -TOP_HEIGHT * 0.2;

    this.driverGroup = new THREE.Group();
    this.driverGroup.add(this.driver);

    // Triangular fin planes around the driver base.
    for (let i = 0; i < DRIVER_FIN_COUNT; i++) {
      const fin = new THREE.Mesh(geo.driverFins, this.mats.driver);
      const angle = (i / DRIVER_FIN_COUNT) * Math.PI * 2;
      fin.position.set(
        Math.cos(angle) * 0.12,
        -TOP_HEIGHT * 0.08,
        Math.sin(angle) * 0.12,
      );
      fin.rotation.y = angle;
      fin.rotation.x = Math.PI * 0.25; // 45° cant
      this.driverGroup.add(fin);
    }

    // ── 5. Mechanical Rivets (InstancedMesh) ───────────────
    // One draw call for all 12 rivets.
    this.rivets = new THREE.InstancedMesh(
      geo.rivet,
      this.mats.rivet,
      geo.rivetCount,
    );
    const dummy = new THREE.Object3D();
    for (let i = 0; i < geo.rivetCount; i++) {
      const p = geo.rivetPlacements[i];
      dummy.position.set(
        Math.cos(p.angle) * p.radius,
        p.y,
        Math.sin(p.angle) * p.radius,
      );
      dummy.updateMatrix();
      this.rivets.setMatrixAt(i, dummy.matrix);
    }
    this.rivets.instanceMatrix.needsUpdate = true;

    // ── 6. Energy Flow Groove Mesh ─────────────────────────
    // A thin torus-like ring embedded in the Ring blade grooves.
    // Uses additive-blend scrolling neon material.
    const flowGeo = new THREE.RingGeometry(
      geo.collisionRadius * 0.72,
      geo.collisionRadius * 0.78,
      32,
    );
    this.energyFlowMesh = new THREE.Mesh(flowGeo, this.mats.energyFlow);
    this.energyFlowMesh.rotation.x = -Math.PI / 2;
    this.energyFlowMesh.position.y = TOP_HEIGHT * 0.25 + RING_EXTRUDE_DEPTH * 0.3;

    // ── 7. Motion Blur Ring ────────────────────────────────
    const blurGeo = new THREE.RingGeometry(this.collisionRadius * 0.9, this.collisionRadius * 1.3, 48, 1);
    const blurMat = new THREE.MeshBasicMaterial({
      color: ringPart!.color,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.blurRing = new THREE.Mesh(blurGeo, blurMat);
    this.blurRing.rotation.x = -Math.PI / 2;
    this.blurRing.position.y = TOP_HEIGHT * 0.25;
    this.blurRing.renderOrder = 2;

    // ── 8. Absolute Defense Shield Sphere ──────────────────
    // Created once, hidden by default. Shown when shieldHits > 0.
    const shieldGeo = new THREE.SphereGeometry(this.collisionRadius * 1.35, 24, 16);
    const shieldMat = new THREE.MeshStandardMaterial({
      color: '#7ef0ff',
      emissive: '#7ef0ff',
      emissiveIntensity: 1.8,
      transparent: true,
      opacity: 0.18,
      roughness: 0.1,
      metalness: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    this.shieldMesh.position.y = TOP_HEIGHT * 0.05;
    this.shieldMesh.visible = false;
    this.shieldMesh.renderOrder = 3;

    // ── Assemble ───────────────────────────────────────────
    this.mesh.add(
      this.ring,
      this.weightDisc,
      this.core,
      this.driverGroup,
      this.rivets,
      this.energyFlowMesh,
      this.blurRing,
      this.shieldMesh,
    );

    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
  }

  reset(x: number, z: number) {
    this.position.set(x, z);
    this.velocity.set(0, 0);
    this.spin = this.stats.maxSpin;
    this.spirit = 0;
    this.stamina = this.stats.maxSpin;
    this.integrity = this.stats.maxIntegrity;
    this.lockStability = 100;
    this.burst = 0;
    this.moiPenalty = 0;
    this.shieldHits = 0;
    this.tacticalMode = DEFAULT_TACTICAL_MODE;
    this.invulnerableUntil = 0;
    this.statusEffects = [];
    this.queuedTagState = null;
    this.flags = DEFAULT_BATTLE_FLAGS();
    this.tilt = 0;
    this.alive = true;
    this.dashCooldown = 0;
    this.deathTimer = 0;
    this.turnMotion = { visual: 'idle', remaining: 0, duration: 0 };
    this.ringAngle = 0;
    this.coreAngle = 0;
    if (this.shieldMesh) this.shieldMesh.visible = false;
    this.syncMesh(0);
  }

  // ── Per-frame visual sync ─────────────────────────────────
  // The Group itself handles position + tilt.
  // Rotation is split per-part for the shutter-speed illusion.

  syncMesh(time: number, energy: number = 0) {
    const spinRatio = this.spin / this.stats.maxSpin;
    const turnProgress = this.turnMotion.duration > 0
      ? 1 - this.turnMotion.remaining / this.turnMotion.duration
      : 1;

    let rotX = -this.velocity.y * 0.04 + Math.cos(time * 11) * this.tilt * 0.08;
    let rotZ = this.velocity.x * 0.04 + Math.sin(time * 9) * this.tilt * 0.08;
    let heightOffset = 0.2 + this.tilt * 0.1;
    let scale = 1;

    if (this.turnMotion.visual === 'defense') {
      heightOffset -= 0.08 * Math.sin(Math.min(1, turnProgress) * Math.PI);
      rotX *= 0.35;
      rotZ *= 0.35;
    } else if (this.turnMotion.visual === 'charge') {
      heightOffset += Math.sin(time * 22) * 0.025;
      scale = 1 + Math.sin(time * 28) * 0.018;
    } else if (this.turnMotion.visual === 'evade') {
      rotX += Math.sin(time * 24) * 0.045;
      rotZ += Math.cos(time * 21) * 0.045;
    } else if (this.turnMotion.visual === 'hit') {
      const hitShake = Math.max(0, 1 - turnProgress);
      rotX += Math.sin(time * 60) * hitShake * 0.18;
      rotZ += Math.cos(time * 54) * hitShake * 0.18;
    }

    if (this.alive && spinRatio < 0.15 && spinRatio > 0) {
      // ── Dying Chaotic Wobble ──
      const chaos = (0.15 - spinRatio) / 0.15; // 0 to 1
      rotX += Math.sin(time * 35) * chaos * 0.15;
      rotZ += Math.cos(time * 38) * chaos * 0.15;
    } else if (!this.alive) {
      if (this.burst >= MAX_BURST) {
        if (!this.isTransformedToSheep) {
          // Burst finish: shrink quickly to simulate exploding.
          scale = Math.max(0, 1 - this.deathTimer * 8);
        }
      } else {
        // Spin finish: topple over smoothly.
        const topple = clamp(this.deathTimer * 2.5, 0, 1);
        rotX = -Math.PI / 2 * topple; 
        rotZ = 0;
        heightOffset = 0.2 * (1 - topple) + 0.05 * topple; // Fall to the ground
      }
    }

    const terrainHeight = ArenaScene.getTerrainHeight(this.position.length());
    this.mesh.position.set(this.position.x, terrainHeight + heightOffset, this.position.y);
    this.mesh.rotation.x = rotX;
    this.mesh.rotation.z = rotZ;
    this.mesh.scale.setScalar(scale);

    // ── Shutter Speed Illusion ────────────────────────────
    // Core + WeightDisc spin at full simulated speed.
    // Ring spins at 40% speed + periodic yaw jitter, so blade
    // teeth remain visible even at maximum RPM.
    const energyBoost = 1 + (energy / 10) * 1.5;
    const baseRotDelta = spinRatio * 0.62 * energyBoost;

    // Core / weight disc: full speed.
    this.coreAngle += baseRotDelta;
    this.core.rotation.z = this.coreAngle;
    this.weightDisc.rotation.z = this.coreAngle;
    this.driverGroup.rotation.y = this.coreAngle;

    // Ring: 40% speed + sinusoidal yaw jitter.
    // sin(time * 17) is a high-frequency oscillation that creates
    // a subtle back-and-forth stutter matching real-world stroboscopic
    // effects seen through high-speed camera shutters.
    const jitter = Math.sin(time * 17) * 0.015 * spinRatio;
    this.ringAngle += baseRotDelta * 0.4 + jitter;
    this.ring.rotation.z = this.ringAngle;

    // Rivets stay static relative to their parent layer (already baked).
    // Energy flow mesh sits on the ring layer.
    this.energyFlowMesh.rotation.z = this.ringAngle;

    // Emissive intensity scales with spin.
    // ── Infinite Storm: massive emissive boost ──────────────
    const hasStorm = this.statusEffects.some((e) => e.id === 'infinite_storm' && e.remaining > 0);
    const isCharging = this.turnMotion.visual === 'charge';
    const attackMeta = this.turnMotion.element ? ELEMENT_ATTACKS[this.turnMotion.element] : null;
    const stormBoost = hasStorm ? 1.6 : 0;
    const chargePulse = isCharging ? 1.1 + Math.sin(time * 26) * 0.75 : 0;
    const attackPulse = attackMeta ? 0.65 + Math.sin(time * 30) * 0.18 : 0;
    const glow = 0.08 + spinRatio * 0.18 + stormBoost + chargePulse + attackPulse;
    (this.ring.material as THREE.MeshStandardMaterial).emissiveIntensity = glow;
    (this.core.material as THREE.MeshStandardMaterial).emissiveIntensity = isCharging ? 1.25 + Math.sin(time * 24) * 0.45 : hasStorm ? 0.8 : 0.05;
    (this.weightDisc.material as THREE.MeshStandardMaterial).emissiveIntensity = isCharging ? 0.9 + Math.sin(time * 20) * 0.28 : hasStorm ? 0.6 : 0.03;

    if (attackMeta) {
      const color = new THREE.Color(attackMeta.color);
      this.setMaterialEmissive(this.ring.material, color);
      this.setMaterialEmissive(this.core.material, color);
    }

    // ── Hex Transformation (Scythe of Vyse) ──────────────────
    if (this.isTransformedToSheep) {
      scale = 0.6 + Math.sin(time * 12) * 0.05; // squashed and wobbling
      rotX = Math.PI / 2.2; // toppled
      rotZ = time * 0.5; // slow weird spin
      heightOffset = 0.05;
      
      // Override materials to look like dull waste plastic
      const matRing = this.ring.material as THREE.MeshStandardMaterial;
      const matCore = this.core.material as THREE.MeshStandardMaterial;
      const matDisc = this.weightDisc.material as THREE.MeshStandardMaterial;
      
      matRing.color.setHex(0x554444);
      matCore.color.setHex(0x444444);
      matDisc.color.setHex(0x333333);
      
      matRing.emissiveIntensity = 0;
      matCore.emissiveIntensity = 0;
      matDisc.emissiveIntensity = 0;
      
      matRing.roughness = 0.9;
      matRing.metalness = 0;
      matCore.roughness = 0.9;
      matCore.metalness = 0;
    }

    // ── Shield Mesh visibility + pulse ─────────────────────
    if (this.shieldMesh) {
      const shieldActive = this.shieldHits > 0 || this.turnMotion.visual === 'defense';
      this.shieldMesh.visible = shieldActive;
      if (shieldActive) {
        const pulse = 0.14 + Math.sin(time * 8) * 0.06;
        (this.shieldMesh.material as THREE.MeshStandardMaterial).opacity = pulse;
        this.shieldMesh.scale.setScalar(1.0 + Math.sin(time * 5) * 0.04);
      }
    }

    // Blur Ring Opacity
    if (this.alive && spinRatio > 0.5) {
      const blurOpacity = (spinRatio - 0.5) * 1.5; // 0.0 at 50%, 0.75 at 100%
      (this.blurRing.material as THREE.MeshBasicMaterial).opacity = Math.min(blurOpacity, 0.7);
    } else {
      (this.blurRing.material as THREE.MeshBasicMaterial).opacity = 0;
    }
  }

  // ── Per-frame effects driver ──────────────────────────────
  // Called from game.ts to drive UV scroll and edge-grind FX.

  updateEffects(dt: number) {
    // Animate discSparks
    const sparks = this.mesh.getObjectByName('discSparks') as THREE.Points;
    if (sparks) {
      const positions = sparks.geometry.attributes.position.array as Float32Array;
      const velocities = sparks.userData.velocities;
      for (let i = 0; i < velocities.length; i++) {
        positions[i*3] += velocities[i].x * dt * 60;
        positions[i*3+1] += velocities[i].y * dt * 60;
        positions[i*3+2] += velocities[i].z * dt * 60;
        
        // Reset if too close to center
        const dist = Math.sqrt(positions[i*3]**2 + positions[i*3+2]**2);
        if (dist < 0.05) {
          const theta = Math.random() * Math.PI * 2;
          const radius = Math.random() * 0.4 + 0.1;
          positions[i*3] = Math.cos(theta) * radius;
          positions[i*3+1] = (Math.random() - 0.5) * 0.5;
          positions[i*3+2] = Math.sin(theta) * radius;
        }
      }
      sparks.geometry.attributes.position.needsUpdate = true;
      sparks.rotation.y += dt * 5; // Spin the whole particle system
    }

    this.mats.updateFlow(dt);
    if (this.turnMotion.remaining > 0) {
      this.turnMotion.remaining = Math.max(0, this.turnMotion.remaining - dt);
      if (this.turnMotion.remaining <= 0) {
        this.turnMotion = { visual: 'idle', remaining: 0, duration: 0 };
        this.setMaterialEmissive(this.ring.material, new THREE.Color(0x000000));
        this.setMaterialEmissive(this.core.material, new THREE.Color(0x000000));
      }
    }
    if (!this.alive) {
      this.deathTimer += dt;
    }
  }

  addBurst(amount: number) {
    this.burst = clamp(this.burst + amount, 0, MAX_BURST);
    if (this.burst >= MAX_BURST) {
      this.alive = false;
      this.integrity = 0;
    }
  }

  setEliminated() {
    this.alive = false;
    this.spin = 0;
  }

  beginTurnMotion(visual: TurnVisual, target?: TopEntity, element?: ElementAttackSkillId, duration = 1.5) {
    this.turnMotion = { visual, element, remaining: duration, duration };

    if (visual === 'attack' || visual === 'clash') {
      const direction = target
        ? new THREE.Vector2().subVectors(target.position, this.position)
        : this.position.clone().multiplyScalar(-1);
      if (direction.lengthSq() < 0.001) direction.set(this.side === 'player' ? 1 : -1, 0);
      const attackTier = element ? ELEMENT_ATTACKS[element].tier : 2;
      this.velocity.copy(direction.normalize().multiplyScalar(10 + attackTier * 2.2));
      this.spin = Math.min(this.stats.maxSpin, this.spin + this.stats.maxSpin * 0.04);
      return;
    }

    if (visual === 'evade') {
      const away = this.position.lengthSq() > 0.001
        ? this.position.clone().normalize()
        : new THREE.Vector2(this.side === 'player' ? -1 : 1, 0);
      this.velocity.copy(away.multiplyScalar(9.2));
      return;
    }

    if (visual === 'defense') {
      this.velocity.multiplyScalar(0.2);
      this.stunTimer = Math.max(this.stunTimer, 0.28);
      return;
    }

    if (visual === 'charge') {
      this.velocity.multiplyScalar(0.08);
      this.spin = Math.min(this.stats.maxSpin, this.spin + this.stats.maxSpin * 0.08);
      return;
    }

    if (visual === 'hit') {
      const away = target
        ? new THREE.Vector2().subVectors(this.position, target.position)
        : this.position.clone();
      if (away.lengthSq() < 0.001) away.set(this.side === 'player' ? -1 : 1, 0);
      this.velocity.copy(away.normalize().multiplyScalar(11.5));
      this.stunTimer = Math.max(this.stunTimer, duration);
    }
  }

  getTurnDragMultiplier() {
    if (this.turnMotion.visual === 'charge') return 1.0;
    if (this.turnMotion.visual === 'defense') return 0.62;
    if (this.turnMotion.visual === 'evade') return 0.94;
    return 0.985;
  }

  private setMaterialEmissive(material: THREE.Material | THREE.Material[], color: THREE.Color) {
    const materials = Array.isArray(material) ? material : [material];
    for (const entry of materials) {
      if ('emissive' in entry && entry.emissive instanceof THREE.Color) {
        entry.emissive.copy(color);
      }
    }
  }

  switchTacticalMode(mode: TacticalMode) {
    if (this.isFrozen) return; // Frozen by Frost Bite
    this.tacticalMode = mode;
  }

  private static isRubberTipDriver(driverId: string) {
    return driverId === 'grip';
  }
}
