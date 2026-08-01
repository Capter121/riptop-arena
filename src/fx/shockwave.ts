import * as THREE from 'three';

const MAX_SHOCKWAVES = 5;

interface ShockwaveState {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  x: number;
  z: number;
  scaleMult: number;
}

const textureLoader = new THREE.TextureLoader();
const shockwaveTexture = textureLoader.load('/textures/vfx/circle_03.png');

export class ShockwaveFX {
  readonly root = new THREE.Group();
  private shockwaves: ShockwaveState[] = [];
  private nextSlot = 0;

  constructor() {
    // Create a flat plane for full texture rendering
    const geometry = new THREE.PlaneGeometry(1.6, 1.6);
    geometry.rotateX(-Math.PI / 2);

    for (let i = 0; i < MAX_SHOCKWAVES; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0,
        map: shockwaveTexture,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      // renderOrder to ensure it draws on top of opaque geometry
      mesh.renderOrder = 3; 
      
      this.root.add(mesh);
      
      this.shockwaves.push({
        mesh,
        material,
        life: 0,
        maxLife: 0.4,
        x: 0,
        z: 0,
        scaleMult: 1,
      });
    }
  }

  trigger(x: number, y: number, z: number, intensity: number, colorHex: number = 0x00ffff) {
    const sw = this.shockwaves[this.nextSlot];
    this.nextSlot = (this.nextSlot + 1) % MAX_SHOCKWAVES;

    sw.x = x;
    sw.z = z;
    sw.life = 0.4; // 400ms duration
    sw.maxLife = 0.4;
    sw.scaleMult = 1 + intensity * 2;
    
    sw.material.color.setHex(colorHex);
    sw.mesh.position.set(x, y, z);
    sw.mesh.visible = true;
  }

  update(dt: number) {
    for (const sw of this.shockwaves) {
      if (sw.life <= 0) continue;
      
      sw.life -= dt;
      if (sw.life <= 0) {
        sw.mesh.visible = false;
        continue;
      }

      const t = 1 - (sw.life / sw.maxLife); // 0 to 1
      
      // Fast initial expansion, slowing down
      const scale = 0.1 + (1 - Math.pow(1 - t, 3)) * 6 * sw.scaleMult;
      sw.mesh.scale.setScalar(scale);

      // Fade out
      sw.material.opacity = Math.max(0, 1 - t) * 0.8;
    }
  }
}
