import * as THREE from 'three';
import { ARENA_RADIUS, ARENA_SLOPE_START, SLOPE_STEEPNESS } from '../app/config';
import { ArenaVisuals } from './arenaVisuals';
import { arenaManager } from '../gameplay/arenaManager';

export interface ArenaTheme {
  id: string;
  name: string;
  floorDiffuse?: string;
  floorEmissive?: string;
  backgroundPanorama?: string;
  backgroundVideo?: string;
  gridColor?: string;
  rimColor: string;
  dangerRingColor: string;
  forcefieldColor: string;
}

export const ARENA_THEMES: Record<string, ArenaTheme> = {
  classic_grid: {
    id: 'classic_grid',
    name: 'Classic Grid',
    backgroundVideo: '/tuoluo.mp4',
    gridColor: '#00ffff',
    rimColor: '#12202f',
    dangerRingColor: '#ff7b5b',
    forcefieldColor: '#ff0055',
  },
  neon_magma: {
    id: 'neon_magma',
    name: 'Neon Magma Wasteland',
    floorDiffuse: '/assets/magma_floor.png',
    floorEmissive: '/assets/magma_floor.png',
    backgroundPanorama: '/assets/magma_bg.png',
    rimColor: '#4b0082', // Deep purple neon rim
    dangerRingColor: '#ff2200',
    forcefieldColor: '#ff5500',
  },
  absolute_zero: {
    id: 'absolute_zero',
    name: 'Absolute Zero Hologrid',
    backgroundVideo: '/ice_bg.mp4',
    rimColor: '#b0d4ff', // Shiny metal rim
    dangerRingColor: '#ff0033',
    forcefieldColor: '#00f0ff',
  }
};

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

  private currentThemeId: string = 'classic_grid';
  private currentVideo?: HTMLVideoElement;
  private scene?: THREE.Scene;
  private textureLoader = new THREE.TextureLoader();
  private bowlMaterial: THREE.MeshStandardMaterial;
  private baseMaterial: THREE.MeshStandardMaterial;
  private iceBowlMaterial: THREE.MeshPhysicalMaterial;
  private iceBaseMaterial: THREE.MeshPhysicalMaterial;
  private bowlMesh: THREE.Mesh;
  private baseMesh: THREE.Mesh;
  private baseBorderMesh: THREE.LineSegments;
  private gridMat: THREE.MeshBasicMaterial;
  private floor: THREE.Mesh;
  private gridFloor: THREE.Mesh;
  private absoluteZeroVisuals: ArenaVisuals;
  private defaultEnvironment: THREE.Texture | null = null;

  static getTerrainHeight(radius: number): number {
    const ratio = radius / ARENA_RADIUS;
    if (ratio <= ARENA_SLOPE_START) return 0;
    return Math.pow(ratio - ARENA_SLOPE_START, 2) * SLOPE_STEEPNESS;
  }

  constructor() {
    this.absoluteZeroVisuals = new ArenaVisuals(ARENA_RADIUS);

    this.baseMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(ARENA_RADIUS + 1.5, ARENA_RADIUS + 1.5, 2.0, 8, 1),
      new THREE.MeshStandardMaterial({
        color: '#080c14',
        metalness: 0.9,
        roughness: 0.3,
      }),
    );
    this.baseMaterial = this.baseMesh.material as THREE.MeshStandardMaterial;
    this.baseMesh.receiveShadow = true;
    this.baseMesh.position.y = -1.0;
    
    const baseBorder = new THREE.EdgesGeometry(this.baseMesh.geometry);
    this.baseBorderMesh = new THREE.LineSegments(baseBorder, new THREE.LineBasicMaterial({ color: '#00ccff', transparent: true, opacity: 0.3 }));
    this.baseMesh.add(this.baseBorderMesh);

    this.bowlMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(ARENA_RADIUS * 0.94, ARENA_RADIUS, 0.8, 64, 1, true),
      new THREE.MeshStandardMaterial({
        color: '#12202f',
        metalness: 0.5,
        roughness: 0.42,
        side: THREE.DoubleSide,
      }),
    );
    this.bowlMaterial = this.bowlMesh.material as THREE.MeshStandardMaterial;
    this.bowlMesh.position.y = 0.28;

    this.iceBowlMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xaaddff,
      transmission: 0.9,
      opacity: 1,
      transparent: true,
      metalness: 0.1,
      roughness: 0.1,
      ior: 1.31,
      thickness: 1.5,
      side: THREE.DoubleSide,
    });

    this.iceBaseMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x4488ff,
      transmission: 0.8,
      opacity: 1,
      transparent: true,
      metalness: 0.2,
      roughness: 0.1,
      ior: 1.31,
      thickness: 5.0,
    });

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

    this.floor = new THREE.Mesh(floorGeo, this.floorMaterial);
    this.floor.receiveShadow = true;

    this.gridMat = new THREE.MeshBasicMaterial({
      color: '#00ffff',
      wireframe: true,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
    });
    this.gridFloor = new THREE.Mesh(floorGeo, this.gridMat);
    this.gridFloor.position.y = 0.001;

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

    this.root.add(this.baseMesh, this.bowlMesh, this.floor, this.gridFloor, dangerRing, forcefield, this.centerRing);
  }

  setDangerLevel(level: number) {
    this.dangerRingMaterial.opacity = 0.18 + level * 0.34;
    this.forcefieldMaterial.opacity = 0.06 + level * 0.15;
    this.floorMaterial.emissiveIntensity = 0.2 + level * 0.22;
    
    if (this.currentThemeId === 'absolute_zero') {
      this.dangerRingMaterial.color.set(level > 0.66 ? '#00f0ff' : '#0066aa');
      this.forcefieldMaterial.color.set(level > 0.66 ? '#00f0ff' : '#0066aa');
    } else if (this.currentThemeId === 'neon_magma') {
      this.dangerRingMaterial.color.set(level > 0.66 ? '#ff0000' : '#ff4400');
      this.forcefieldMaterial.color.set(level > 0.66 ? '#ff0000' : '#ff5500');
    } else {
      this.dangerRingMaterial.color.set(level > 0.66 ? '#ff4d6d' : '#ff7b5b');
      this.forcefieldMaterial.color.set(level > 0.66 ? '#ff0033' : '#ff0055');
    }
  }

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

  setScene(scene: THREE.Scene) {
    this.scene = scene;
    if (scene.environment && !this.defaultEnvironment) {
      this.defaultEnvironment = scene.environment;
    }
  }

  setTheme(themeId: string) {
    const theme = ARENA_THEMES[themeId];
    if (!theme) return;
    this.currentThemeId = themeId;

    this.dangerRingMaterial.color.set(theme.dangerRingColor);
    this.forcefieldMaterial.color.set(theme.forcefieldColor);
    this.bowlMaterial.color.set(theme.rimColor);
    
    if (theme.gridColor) {
      this.gridMat.color.set(theme.gridColor);
      this.gridMat.opacity = 0.08;
    } else {
      this.gridMat.opacity = 0; // Hide grid in magma mode
    }

    // Load textures
    if (theme.id === 'neon_magma') {
      this.baseBorderMesh.visible = false;
      this.floorMaterial.metalness = 0.1;
      this.floorMaterial.roughness = 0.9;
      this.bowlMaterial.metalness = 0.1;
      this.bowlMaterial.roughness = 0.9;
      this.baseMaterial.metalness = 0.1;
      this.baseMaterial.roughness = 0.9;
    } else {
      this.baseBorderMesh.visible = true;
      this.floorMaterial.metalness = 0.8;
      this.floorMaterial.roughness = 0.2;
      this.bowlMaterial.metalness = 0.9;
      this.bowlMaterial.roughness = 0.1;
      this.baseMaterial.metalness = 0.9;
      this.baseMaterial.roughness = 0.3;
    }

    arenaManager.setTheme(themeId);
    
    if (themeId === 'absolute_zero') {
      this.floor.visible = false;
      this.gridFloor.visible = false;
      
      this.bowlMesh.material = this.iceBowlMaterial;
      this.baseMesh.material = this.iceBaseMaterial;
      
      this.root.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.receiveShadow = false;
        }
      });

      if (this.scene) {
        this.absoluteZeroVisuals.initAbsoluteZero(this.root); // Add to root instead of scene directly
      }
      if (this.scene && this.scene.fog) {
        (this.scene.fog as THREE.FogExp2).color.set('#004488');
        (this.scene.fog as THREE.FogExp2).density = 0.015;
      }
    } else {
      this.floor.visible = true;
      this.gridFloor.visible = true;
      
      this.bowlMesh.material = this.bowlMaterial;
      this.baseMesh.material = this.baseMaterial;
      
      this.root.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.receiveShadow = true;
        }
      });

      this.absoluteZeroVisuals.remove(this.root);
      if (this.scene && this.scene.fog) {
        (this.scene.fog as THREE.FogExp2).color.set('#000000');
        (this.scene.fog as THREE.FogExp2).density = 0.01;
      }
    }

    if (theme.floorDiffuse) {
      this.textureLoader.load(theme.floorDiffuse, (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(1.5, 1.5);
        
        this.floorMaterial.map = tex;
        this.floorMaterial.bumpMap = tex;
        this.floorMaterial.bumpScale = 0.2;
        this.floorMaterial.displacementMap = tex;
        this.floorMaterial.displacementScale = 0.6;
        this.floorMaterial.displacementBias = -0.2; // Keep average height somewhat grounded
        this.floorMaterial.color.set('#ffffff');
        this.floorMaterial.needsUpdate = true;

        this.bowlMaterial.map = tex;
        this.bowlMaterial.bumpMap = tex;
        this.bowlMaterial.bumpScale = 0.5;
        this.bowlMaterial.color.set(theme.rimColor);
        this.bowlMaterial.needsUpdate = true;

        this.baseMaterial.map = tex;
        this.baseMaterial.bumpMap = tex;
        this.baseMaterial.bumpScale = 0.5;
        this.baseMaterial.color.set('#444444');
        this.baseMaterial.needsUpdate = true;
      });
    } else {
      this.floorMaterial.map = null;
      this.floorMaterial.bumpMap = null;
      this.floorMaterial.displacementMap = null;
      this.floorMaterial.displacementScale = 0;
      this.floorMaterial.color.set('#050a11');
      this.floorMaterial.needsUpdate = true;
      
      this.bowlMaterial.map = null;
      this.bowlMaterial.bumpMap = null;
      this.bowlMaterial.needsUpdate = true;

      this.baseMaterial.map = null;
      this.baseMaterial.bumpMap = null;
      this.baseMaterial.color.set('#080c14');
      this.baseMaterial.needsUpdate = true;
    }

    if (theme.floorEmissive) {
      this.textureLoader.load(theme.floorEmissive, (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(1.5, 1.5);
        this.floorMaterial.emissiveMap = tex;
        this.floorMaterial.emissive.set('#ff5500');
        this.floorMaterial.emissiveIntensity = 1.0;
        this.floorMaterial.needsUpdate = true;
      });
    } else {
      this.floorMaterial.emissiveMap = null;
      this.floorMaterial.emissive.set('#04101e');
      this.floorMaterial.emissiveIntensity = 0.3;
      this.floorMaterial.needsUpdate = true;
    }

    if (this.currentVideo) {
      this.currentVideo.pause();
      this.currentVideo.removeAttribute('src');
      this.currentVideo.load();
      this.currentVideo = undefined;
    }

    if (this.scene) {
      if (theme.backgroundVideo) {
        const video = document.createElement('video');
        video.src = theme.backgroundVideo;
        video.crossOrigin = 'anonymous';
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.play().catch(e => console.warn('Video auto-play failed', e));
        this.currentVideo = video;

        const tex = new THREE.VideoTexture(video);
        tex.colorSpace = THREE.SRGBColorSpace;
        
        this.scene.background = tex;
        // Restore the high-quality default PMREM environment map for proper metallic reflections
        if (this.defaultEnvironment) {
          this.scene.environment = this.defaultEnvironment;
        }
      } else if (theme.backgroundPanorama) {
        this.textureLoader.load(theme.backgroundPanorama, (tex) => {
          tex.mapping = THREE.EquirectangularReflectionMapping;
          tex.colorSpace = THREE.SRGBColorSpace;
          if (this.scene) {
            this.scene.background = tex;
            this.scene.environment = tex;
          }
        });
      } else {
        this.scene.background = null;
        if (this.defaultEnvironment) {
          this.scene.environment = this.defaultEnvironment;
        } else {
          this.scene.environment = null;
        }
      }
    }
  }

  update(dt: number, time: number) {
    if (this.currentThemeId === 'neon_magma') {
      const pulse = 1.75 + Math.sin(time * 2.0) * 0.75;
      this.floorMaterial.emissiveIntensity = pulse;
    }

    this.centerRing.rotation.z -= dt * 0.5;
    this.absoluteZeroVisuals.update(dt);
    if (this.currentVideo && this.currentVideo.readyState >= this.currentVideo.HAVE_CURRENT_DATA) {
      if (this.gridMat.map) {
        this.gridMat.map.needsUpdate = true;
      }
    }

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
