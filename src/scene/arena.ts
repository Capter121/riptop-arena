import * as THREE from 'three';
import { ARENA_RADIUS, ARENA_SLOPE_START, SLOPE_STEEPNESS } from '../app/config';

type ScuffMark = { mesh: THREE.Mesh; life: number };

export class ArenaScene {
  private static readonly MAX_SCUFFS = 8;
  private static readonly SCUFF_LIFE = 2.0;
  readonly root = new THREE.Group();
  private readonly dangerRingMaterial: THREE.MeshBasicMaterial;
  private readonly forcefieldMaterial: THREE.MeshBasicMaterial;
  private readonly floorMaterial: THREE.MeshStandardMaterial;
  private readonly centerRing: THREE.Mesh;
  private scuffs: ScuffMark[] = [];

  static getTerrainHeight(radius: number): number {
    const ratio = radius / ARENA_RADIUS;
    if (ratio <= ARENA_SLOPE_START) return 0;
    return Math.pow(ratio - ARENA_SLOPE_START, 2) * SLOPE_STEEPNESS;
  }

  constructor() {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(ARENA_RADIUS + 1.5, ARENA_RADIUS + 1.5, 2.0, 8, 1),
      new THREE.MeshStandardMaterial({
        color: '#080c14',
        metalness: 0.9,
        roughness: 0.3,
      }),
    );
    base.receiveShadow = true;
    base.position.y = -1.0;
    
    const baseBorder = new THREE.EdgesGeometry(base.geometry);
    const baseBorderMesh = new THREE.LineSegments(baseBorder, new THREE.LineBasicMaterial({ color: '#00ccff', transparent: true, opacity: 0.3 }));
    base.add(baseBorderMesh);

    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(ARENA_RADIUS * 0.94, ARENA_RADIUS, 0.8, 64, 1, true),
      new THREE.MeshStandardMaterial({
        color: '#12202f',
        metalness: 0.5,
        roughness: 0.42,
        side: THREE.DoubleSide,
      }),
    );
    bowl.position.y = 0.28;

    this.floorMaterial = new THREE.MeshStandardMaterial({
      color: '#050a11',
      metalness: 0.8,
      roughness: 0.2,
      emissive: '#04101e',
      emissiveIntensity: 0.3,
    });

    const points: THREE.Vector2[] = [];
    const radSegments = 32;
    for (let i = 0; i <= radSegments; i++) {
      const r = (i / radSegments) * ARENA_RADIUS;
      points.push(new THREE.Vector2(r, ArenaScene.getTerrainHeight(r)));
    }
    const floorGeo = new THREE.LatheGeometry(points, 64);

    const floor = new THREE.Mesh(floorGeo, this.floorMaterial);
    floor.receiveShadow = true;

    const gridMat = new THREE.MeshBasicMaterial({
      color: '#00ffff',
      wireframe: true,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
    });
    const gridFloor = new THREE.Mesh(floorGeo, gridMat);
    gridFloor.position.y = 0.001;

    this.dangerRingMaterial = new THREE.MeshBasicMaterial({
      color: '#ff7b5b',
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
    });

    const dangerRing = new THREE.Mesh(
      new THREE.RingGeometry(ARENA_RADIUS * 0.75, ARENA_RADIUS * 0.98, 64),
      this.dangerRingMaterial,
    );
    dangerRing.rotation.x = -Math.PI / 2;
    dangerRing.position.y = 0.01;
    
    this.forcefieldMaterial = new THREE.MeshBasicMaterial({
      color: '#ff0055',
      transparent: true,
      opacity: 0.06,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const forcefield = new THREE.Mesh(
      new THREE.CylinderGeometry(ARENA_RADIUS, ARENA_RADIUS, 12, 64, 1, true),
      this.forcefieldMaterial
    );
    forcefield.position.y = 6;

    const forcefieldEdges = new THREE.Mesh(
      new THREE.CylinderGeometry(ARENA_RADIUS, ARENA_RADIUS, 12, 16, 8, true),
      new THREE.MeshBasicMaterial({ color: '#ff0055', wireframe: true, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending })
    );
    forcefield.add(forcefieldEdges);

    this.centerRing = new THREE.Mesh(
      new THREE.RingGeometry(ARENA_RADIUS * 0.16, ARENA_RADIUS * 0.29, 8),
      new THREE.MeshBasicMaterial({
        color: '#7ef0ff',
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
        wireframe: true,
      }),
    );
    this.centerRing.rotation.x = -Math.PI / 2;
    this.centerRing.position.y = 0.012;

    this.root.add(base, bowl, floor, gridFloor, dangerRing, forcefield, this.centerRing);
  }

  setDangerLevel(level: number) {
    this.dangerRingMaterial.opacity = 0.18 + level * 0.34;
    this.forcefieldMaterial.opacity = 0.06 + level * 0.15;
    this.floorMaterial.emissiveIntensity = 0.2 + level * 0.22;
    this.dangerRingMaterial.color.set(level > 0.66 ? '#ff4d6d' : '#ff7b5b');
    this.forcefieldMaterial.color.set(level > 0.66 ? '#ff0033' : '#ff0055');
  }

  // ── Arena Scuff Marks (磨损轨迹) ──────────────────────────
  // Flat decal planes on the floor that fade out over time.
  // Ring buffer of MAX_SCUFFS; oldest is recycled.

  addScuffMark(x: number, z: number, angle: number) {
    if (this.scuffs.length >= ArenaScene.MAX_SCUFFS) {
      const oldest = this.scuffs.shift()!;
      this.root.remove(oldest.mesh);
      oldest.mesh.geometry.dispose();
      (oldest.mesh.material as THREE.MeshBasicMaterial).dispose();
    }

    const geo = new THREE.PlaneGeometry(0.6 + Math.random() * 0.3, 0.08);
    const mat = new THREE.MeshBasicMaterial({
      color: '#111111',
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = angle;
    // Decals follow the terrain height.
    const height = ArenaScene.getTerrainHeight(Math.sqrt(x * x + z * z));
    mesh.position.set(x, height + 0.005, z);
    this.root.add(mesh);
    this.scuffs.push({ mesh, life: ArenaScene.SCUFF_LIFE });
  }

  update(dt: number) {
    this.centerRing.rotation.z -= dt * 0.5;

    this.scuffs = this.scuffs.filter((scuff) => {
      scuff.life -= dt;
      const t = Math.max(0, scuff.life / ArenaScene.SCUFF_LIFE);
      (scuff.mesh.material as THREE.MeshBasicMaterial).opacity = 0.18 * t;
      if (scuff.life <= 0) {
        this.root.remove(scuff.mesh);
        scuff.mesh.geometry.dispose();
        (scuff.mesh.material as THREE.MeshBasicMaterial).dispose();
        return false;
      }
      return true;
    });
  }
}
