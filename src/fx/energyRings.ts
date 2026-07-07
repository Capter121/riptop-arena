import * as THREE from 'three';
import type { TopEntity } from '../gameplay/top';

export class EnergyRings {
  readonly root = new THREE.Group();
  
  private readonly playerSpinRing: THREE.Mesh;
  private readonly playerEnergyRing: THREE.Mesh;
  private readonly focusIndicator: THREE.Mesh;

  constructor() {
    // Player inner ring (Spin/Stamina) - Yellow
    this.playerSpinRing = new THREE.Mesh(
      new THREE.RingGeometry(0.65, 0.75, 40),
      new THREE.MeshBasicMaterial({
        color: '#ffdd00',
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
      }),
    );
    this.playerSpinRing.rotation.x = -Math.PI / 2;
    this.playerSpinRing.position.y = 0.03;

    // Player outer ring (Energy) - Cyan
    this.playerEnergyRing = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 0.95, 40),
      new THREE.MeshBasicMaterial({
        color: '#00ffff',
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
      }),
    );
    this.playerEnergyRing.rotation.x = -Math.PI / 2;
    this.playerEnergyRing.position.y = 0.03;

    // Enemy focus indicator (Inverted Triangle above top)
    const coneGeo = new THREE.ConeGeometry(0.3, 0.5, 3);
    coneGeo.translate(0, -0.25, 0); // Origin at top for easier scaling/bouncing
    this.focusIndicator = new THREE.Mesh(
      coneGeo,
      new THREE.MeshBasicMaterial({
        color: '#ff0000',
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
      })
    );
    // Rotate to point down (it's already pointing up by default)
    this.focusIndicator.rotation.x = Math.PI;
    
    this.root.add(this.playerSpinRing, this.playerEnergyRing, this.focusIndicator);
  }

  update(player: TopEntity, enemy: TopEntity, time: number, playerEnergy: number = 0) {
    if (player.alive) {
      this.playerSpinRing.visible = true;
      this.playerEnergyRing.visible = true;

      this.playerSpinRing.position.x = player.position.x;
      this.playerSpinRing.position.z = player.position.y;
      
      this.playerEnergyRing.position.x = player.position.x;
      this.playerEnergyRing.position.z = player.position.y;

      // Update geometry to show arcs
      const spinRatio = Math.max(0, player.spin / player.stats.maxSpin);
      this.playerSpinRing.geometry.dispose();
      this.playerSpinRing.geometry = new THREE.RingGeometry(0.65, 0.75, 40, 1, 0, Math.PI * 2 * spinRatio);

      const energyRatio = Math.max(0, playerEnergy / 10);
      this.playerEnergyRing.geometry.dispose();
      this.playerEnergyRing.geometry = new THREE.RingGeometry(0.85, 0.95, 40, 1, 0, Math.PI * 2 * energyRatio);

      // Rotate slowly for visual effect
      this.playerSpinRing.rotation.z = time * 2;
      this.playerEnergyRing.rotation.z = -time * 1.5;
    } else {
      this.playerSpinRing.visible = false;
      this.playerEnergyRing.visible = false;
    }

    if (enemy.alive) {
      this.focusIndicator.visible = true;
      const spinRatio = enemy.spin / enemy.stats.maxSpin;
      
      this.focusIndicator.position.x = enemy.position.x;
      this.focusIndicator.position.z = enemy.position.y;
      // Bounce up and down
      this.focusIndicator.position.y = 1.5 + Math.sin(time * 5) * 0.1;
      this.focusIndicator.rotation.y = time * 3;

      const mat = this.focusIndicator.material as THREE.MeshBasicMaterial;
      if (spinRatio > 0.5) {
        mat.color.setHex(0x00ff00); // Green
      } else if (spinRatio > 0.2) {
        mat.color.setHex(0xffff00); // Yellow
      } else {
        mat.color.setHex(0xff0000); // Red
        // Flash when critical
        mat.opacity = 0.5 + Math.sin(time * 20) * 0.5;
      }
    } else {
      this.focusIndicator.visible = false;
    }
  }
}
