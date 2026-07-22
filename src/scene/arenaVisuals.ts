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

    const isLowEnd = window.innerWidth < 768
      || window.matchMedia('(pointer: coarse)').matches
      || navigator.maxTouchPoints > 0;
    const mirrorDpr = Math.min(window.devicePixelRatio || 1, 1.25);
    const requestedWidth = window.innerWidth * mirrorDpr;
    const requestedHeight = window.innerHeight * mirrorDpr;
    const mirrorScale = Math.min(1, 1024 / requestedWidth, 1024 / requestedHeight);
    const textureWidth = Math.max(256, Math.floor(requestedWidth * mirrorScale));
    const textureHeight = Math.max(256, Math.floor(requestedHeight * mirrorScale));

    const geo = new THREE.CircleGeometry(this.radius * 0.94, 64);

    if (isLowEnd) {
      this.createFallback(geo);
    } else {
      try {
        this.reflector = new Reflector(geo, {
          clipBias: 0.003,
          textureWidth,
          textureHeight,
          color: 0x183c55,
        });
        this.reflector.rotation.x = -Math.PI / 2;
        this.reflector.position.y = 0.29;
        this.root.add(this.reflector);
      } catch (error) {
        console.warn('Absolute Zero reflector unavailable; using fallback.', error);
        this.createFallback(geo);
      }
    }

    // Hologrid overlay
    this.gridHelper = new THREE.GridHelper(this.radius * 2, 20, 0x00f0ff, 0x004488);
    this.gridHelper.position.y = 0.30;
    const gridMat = this.gridHelper.material as THREE.LineBasicMaterial;
    gridMat.transparent = true;
    gridMat.opacity = 0.4;
    gridMat.blending = THREE.AdditiveBlending;
    this.root.add(this.gridHelper);

    // Ice peaks around the rim
    this.iceGroup = new THREE.Group();
    this.iceGeometry = new THREE.ConeGeometry(0.6, 2.5, 5);
    this.iceGeometry.translate(0, 1.25, 0);
    
    // MeshPhysicalMaterial for beautiful glass/ice look
    this.iceMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x88ccff,
      transmission: 0.9,
      opacity: 1,
      transparent: true,
      metalness: 0.1,
      roughness: 0.1,
      ior: 1.31, // Ice Index of Refraction
      thickness: 1.5,
    });

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

  private createFallback(geometry: THREE.CircleGeometry) {
    this.fallbackMesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: 0x062b44,
        metalness: 0.9,
        roughness: 0.1,
        transparent: true,
        opacity: 0.8,
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
