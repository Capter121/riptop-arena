// Garage 3D preview: the player's current top on a lit pedestal, slowly
// turning. Rebuilds when the build changes.

import * as THREE from 'three';
import { buildTop } from './TopModel.js';
import { factionForBuild, slotFactionsFor } from './factions.js';

export class GaragePreview {
  constructor(stage) {
    this.stage = stage;
    this.top = null;
    this._angle = 0;
    // On phones the build sheet covers the lower screen, so frame the top higher.
    this.mobile = window.matchMedia && window.matchMedia('(max-width: 820px)').matches;
    this._lookY = this.mobile ? -2.6 : 0.1;

    stage.clearContent();

    // Pedestal.
    this.pedestal = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 3.0, 0.5, 64),
      new THREE.MeshStandardMaterial({ color: 0x12161f, metalness: 0.7, roughness: 0.35 })
    );
    disc.position.y = -1.7;
    disc.receiveShadow = true;
    this.pedestal.add(disc);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.65, 0.05, 16, 96),
      new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff3b30, emissiveIntensity: 0.8, metalness: 0.4, roughness: 0.3 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -1.44;
    this.pedestal.add(ring);
    this.ring = ring;
    stage.root.add(this.pedestal);

    stage.camera.position.set(0, this.mobile ? 1.2 : 1.8, this.mobile ? 6.2 : 5.4);
    stage.camera.lookAt(0, this._lookY, 0);

    stage.setOnFrame((dt, elapsed) => this._frame(dt, elapsed));
  }

  setBuild(componentIds) {
    const primary = factionForBuild(componentIds);
    const slots = slotFactionsFor(componentIds);
    if (this.top) {
      this.stage.root.remove(this.top.group);
      this.top.dispose();
    }
    this.top = buildTop(slots, primary);
    this.top.group.position.y = 0.2;
    this.top.group.scale.multiplyScalar(1.35); // hero size for the showcase
    this.stage.root.add(this.top.group);
    // recolour pedestal ring to the faction accent
    const accent = this.top.cfg.glow;
    this.ring.material.color.set(accent);
    this.ring.material.emissive.set(accent);
  }

  _frame(dt, elapsed = 0) {
    this._angle += dt * 0.5;
    if (this.top) {
      this.top.update(dt, 16, 0.0, elapsed);
      this.top.group.position.x = 0;
    }
    // gently bob the camera
    this.stage.camera.position.x = Math.sin(this._angle * 0.5) * (this.mobile ? 0.5 : 1.2);
    this.stage.camera.lookAt(0, this._lookY, 0);
  }

  dispose() {
    if (this.top) this.top.dispose();
  }
}
