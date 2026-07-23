import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

export class ArenaVisuals {
  public root = new THREE.Group();
  private readonly radius: number;
  private reflector: Reflector | null = null;
  private fallbackMesh: THREE.Mesh | null = null;
  private gridHelper: THREE.GridHelper | null = null;
  private iceGroup: THREE.Group | null = null;
  private iceGeometry: THREE.ConeGeometry | null = null;
  private iceMaterial: THREE.MeshPhysicalMaterial | null = null;
  private glitchTimer = 0;
  private isActive = false;

  constructor(radius: number) {
    this.radius = radius;
  }

  public initAbsoluteZero(parent: THREE.Object3D) {
    if (this.isActive) {
      if (this.root.parent !== parent) parent.add(this.root);
      return;
    }

    const geo = new THREE.CircleGeometry(this.radius * 0.94, 64);

    // Completely remove Reflector mirror to eliminate harsh reflections and flare whiteouts
    this.createFrostedIceFloor(geo);

    // Hologrid overlay with soft opacity
    this.gridHelper = new THREE.GridHelper(this.radius * 2, 20, 0x00f0ff, 0x004488);
    this.gridHelper.position.y = 0.30;
    const gridMat = this.gridHelper.material as THREE.LineBasicMaterial;
    gridMat.transparent = true;
    gridMat.opacity = 0.25;
    gridMat.blending = THREE.NormalBlending;
    this.root.add(this.gridHelper);

    // Ice peaks around the rim
    this.iceGroup = new THREE.Group();
    this.iceGeometry = new THREE.ConeGeometry(0.6, 2.5, 5);
    this.iceGeometry.translate(0, 1.25, 0);
    
    // Frosted ice peak material with high roughness and no glare
    this.iceMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a90e2,
      metalness: 0.1,
      roughness: 0.65, // Matte ice feel without specular glare
      transparent: true,
      opacity: 0.88,
    }) as unknown as THREE.MeshPhysicalMaterial;

    for (let i = 0; i < 36; i++) {
      const angle = (i / 36) * Math.PI * 2;
      const r = this.radius * 0.95 + Math.random() * 0.3; // around the rim
      const peak = new THREE.Mesh(this.iceGeometry, this.iceMaterial);
      peak.position.set(Math.cos(angle) * r, 0.2, Math.sin(angle) * r);
      
      // Point outwards and randomly tilt
      peak.rotation.x = (Math.random() - 0.5) * 0.6;
      peak.rotation.z = (Math.random() - 0.5) * 0.6;
      peak.rotation.y = angle + Math.PI / 2 + (Math.random() - 0.5) * 0.5;
      
      const scale = 0.4 + Math.random() * 1.2;
      peak.scale.set(scale, scale, scale);
      
      this.iceGroup.add(peak);
    }
    this.root.add(this.iceGroup);

    parent.add(this.root);
    this.isActive = true;
  }

  public remove(_parent: THREE.Object3D) {
    this.isActive = false;
    this.root.removeFromParent();
    if (this.reflector) {
      this.reflector.geometry.dispose();
      this.reflector.dispose();
      this.root.remove(this.reflector);
      this.reflector = null;
    }
    if (this.fallbackMesh) {
      this.fallbackMesh.geometry.dispose();
      (this.fallbackMesh.material as THREE.Material).dispose();
      this.root.remove(this.fallbackMesh);
      this.fallbackMesh = null;
    }
    if (this.gridHelper) {
      this.gridHelper.geometry.dispose();
      const materials = Array.isArray(this.gridHelper.material)
        ? this.gridHelper.material
        : [this.gridHelper.material];
      materials.forEach((material) => material.dispose());
      this.root.remove(this.gridHelper);
      this.gridHelper = null;
    }
    if (this.iceGroup) {
      this.iceGroup.clear();
      this.root.remove(this.iceGroup);
      this.iceGroup = null;
    }
    this.iceGeometry?.dispose();
    this.iceMaterial?.dispose();
    this.iceGeometry = null;
    this.iceMaterial = null;
    this.root.clear();
    this.glitchTimer = 0;
  }

  private createFrostedIceFloor(geometry: THREE.CircleGeometry) {
    this.fallbackMesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: 0x071e33, // Deep cool frost blue base
        metalness: 0.1,
        roughness: 0.70, // Frosted matte ice texture: zero harsh reflections
        transparent: true,
        opacity: 0.95,
      }),
    );
    this.fallbackMesh.rotation.x = -Math.PI / 2;
    this.fallbackMesh.position.y = 0.29;
    this.root.add(this.fallbackMesh);
  }

  public update(dt: number) {
    if (!this.isActive || !this.gridHelper) return;

    this.glitchTimer += dt;
    if (this.glitchTimer > 0.4) {
      this.glitchTimer = 0;
      const isGlitch = Math.random() < 0.15;
      const mat = this.gridHelper.material as THREE.LineBasicMaterial;
      if (isGlitch) {
        mat.color.setHex(0xff00ff);
        this.gridHelper.position.x = (Math.random() - 0.5) * 0.2;
        this.gridHelper.position.z = (Math.random() - 0.5) * 0.2;
      } else {
        mat.color.setHex(0x00f0ff);
        this.gridHelper.position.x = 0;
        this.gridHelper.position.z = 0;
      }
    }
  }
}
