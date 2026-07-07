// Procedural Beyblade-style top: energy layer (lathe dome) + radial extruded
// blades + metal forge disc + performance driver tip, with motion-blur and
// trail rings + a parented faction PointLight. Built per-faction visual config.

import * as THREE from 'three';
import { FACTION_VIS } from './factions.js';

const SCALE = 2.25; // research coords are ~0.3 radius; scale up to world size

// --- Energy layer dome (LatheGeometry profile) ---------------------------
function buildEnergyLayer(cfg, mats) {
  const group = new THREE.Group();

  const layerPoints = [
    new THREE.Vector2(0.012, 0.16),
    new THREE.Vector2(0.06, 0.155),
    new THREE.Vector2(0.14, 0.13),
    new THREE.Vector2(0.22, 0.09),
    new THREE.Vector2(0.29, 0.04),
    new THREE.Vector2(0.31, 0.0),
    new THREE.Vector2(0.3, -0.03),
    new THREE.Vector2(0.27, -0.06),
    new THREE.Vector2(0.2, -0.085),
  ];
  const layerGeo = new THREE.LatheGeometry(layerPoints, 64);
  const body = new THREE.Mesh(layerGeo, mats.body);
  body.castShadow = true;
  group.add(body);

  // Blades (one geometry instance, cloned meshes rotated around Y).
  const bladeGeo = buildBladeGeometry(cfg.style);
  for (let i = 0; i < cfg.blades; i++) {
    let geo = bladeGeo;
    if (cfg.style === 'asym' && i % 2 === 1) geo = buildBladeGeometry('asym2');
    const m = new THREE.Mesh(geo, mats.blade);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = ((Math.PI * 2) / cfg.blades) * i;
    m.castShadow = true;
    m.position.y = 0.0;
    group.add(m);
  }

  // Top cap accent ring (emissive, blooms).
  const capGeo = new THREE.TorusGeometry(0.12, 0.018, 12, 48);
  const cap = new THREE.Mesh(capGeo, mats.accent);
  cap.rotation.x = -Math.PI / 2;
  cap.position.y = 0.135;
  group.add(cap);

  // Motion-blur disc (only visible when spinning fast).
  const blurGeo = new THREE.RingGeometry(0.1, 0.33, 72, 1);
  const blurMat = new THREE.MeshBasicMaterial({
    color: cfg.bladeColor,
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const blurRing = new THREE.Mesh(blurGeo, blurMat);
  blurRing.rotation.x = -Math.PI / 2;
  blurRing.position.y = 0.02;
  blurRing.renderOrder = 2;
  group.add(blurRing);

  return { group, blurRing };
}

function buildBladeGeometry(style) {
  const shape = new THREE.Shape();
  if (style === 'swept') {
    shape.moveTo(0.05, 0.02);
    shape.lineTo(0.22, 0.07);
    shape.bezierCurveTo(0.32, 0.1, 0.35, 0.04, 0.3, -0.01);
    shape.lineTo(0.14, -0.05);
    shape.bezierCurveTo(0.08, -0.06, 0.04, -0.02, 0.05, 0.02);
  } else if (style === 'blunt') {
    shape.moveTo(0.06, 0.05);
    shape.lineTo(0.31, 0.07);
    shape.lineTo(0.31, -0.07);
    shape.lineTo(0.06, -0.05);
    shape.lineTo(0.06, 0.05);
  } else if (style === 'fan') {
    shape.moveTo(0.08, 0.015);
    shape.quadraticCurveTo(0.2, 0.08, 0.31, 0.03);
    shape.quadraticCurveTo(0.33, 0.0, 0.31, -0.02);
    shape.quadraticCurveTo(0.18, -0.02, 0.08, -0.012);
  } else if (style === 'asym') {
    shape.moveTo(0.05, 0.03);
    shape.lineTo(0.24, 0.09);
    shape.bezierCurveTo(0.36, 0.11, 0.38, 0.0, 0.3, -0.04);
    shape.lineTo(0.1, -0.05);
    shape.lineTo(0.05, 0.03);
  } else {
    // asym2 — the hooked partner blade
    shape.moveTo(0.05, 0.02);
    shape.lineTo(0.18, 0.05);
    shape.bezierCurveTo(0.28, 0.07, 0.3, 0.02, 0.24, -0.02);
    shape.lineTo(0.08, -0.03);
    shape.lineTo(0.05, 0.02);
  }
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.006,
    bevelSegments: 2,
    curveSegments: 10,
  });
  geo.center();
  return geo;
}

// --- Forge disc (metal weight ring) --------------------------------------
function buildForgeDisc(cfg, mats) {
  const group = new THREE.Group();
  const discGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.05, 64, 1, false);
  const disc = new THREE.Mesh(discGeo, mats.disc);
  disc.castShadow = true;
  group.add(disc);
  // bevel ring on the edge
  const edgeGeo = new THREE.TorusGeometry(0.27, 0.026, 16, 64);
  const edge = new THREE.Mesh(edgeGeo, mats.disc);
  edge.rotation.x = Math.PI / 2;
  group.add(edge);
  // glowing inset
  const insetGeo = new THREE.TorusGeometry(0.2, 0.01, 8, 48);
  const inset = new THREE.Mesh(insetGeo, mats.accent);
  inset.rotation.x = Math.PI / 2;
  group.add(inset);
  group.position.y = -0.12;
  return group;
}

// --- Driver / performance tip --------------------------------------------
function buildDriver(cfg, mats) {
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.045, 0.16, 32), mats.disc);
  shaft.castShadow = true;
  group.add(shaft);

  let tip;
  if (cfg.driver === 'flat') {
    tip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 32), mats.tip);
    tip.position.y = -0.1;
  } else if (cfg.driver === 'wide') {
    tip = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.045, 32), mats.tip);
    tip.position.y = -0.1;
  } else if (cfg.driver === 'needle') {
    tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 24), mats.tip);
    tip.position.y = -0.12;
    tip.rotation.x = Math.PI;
  } else {
    // orb (chaos)
    tip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 16), mats.accent);
    tip.position.y = -0.1;
  }
  tip.castShadow = true;
  group.add(tip);
  group.position.y = -0.24;
  return group;
}

// --- Public builder -------------------------------------------------------
// slotFactions: { A, B, C, D } set ids (or a single set-id string for all).
//   A -> energy layer + blades,  B -> driver tip,  C -> forge disc,  D -> core glow.
// primarySetId: the dominant faction, used only for VFX colour (spark/trail glow).
export function buildTop(slotFactions, primarySetId) {
  const norm =
    typeof slotFactions === 'string'
      ? { A: slotFactions, B: slotFactions, C: slotFactions, D: slotFactions }
      : slotFactions;
  const fA = FACTION_VIS[norm.A] || FACTION_VIS.inferno; // attack ring
  const fB = FACTION_VIS[norm.B] || FACTION_VIS.inferno; // driver
  const fC = FACTION_VIS[norm.C] || FACTION_VIS.inferno; // weight disc
  const fD = FACTION_VIS[norm.D] || FACTION_VIS.inferno; // core chip
  const primary = FACTION_VIS[primarySetId] || fA;

  const matBody = new THREE.MeshStandardMaterial({
    color: fA.bodyColor, metalness: 0.5, roughness: 0.45,
    emissive: fA.emissiveColor, emissiveIntensity: fA.emissiveIntensity * 0.35,
  });
  const matBlade = new THREE.MeshStandardMaterial({
    color: fA.bladeColor, metalness: fA.bladeMetal, roughness: fA.bladeRough,
    emissive: fA.emissiveColor, emissiveIntensity: fA.emissiveIntensity,
  });
  const matDisc = new THREE.MeshStandardMaterial({ color: fC.discColor, metalness: 0.95, roughness: 0.18 });
  const matShaft = new THREE.MeshStandardMaterial({ color: 0x2c2e36, metalness: 0.85, roughness: 0.3 });
  const matTip = new THREE.MeshStandardMaterial({ color: 0x222228, metalness: 0.8, roughness: 0.35 });
  const matCore = new THREE.MeshStandardMaterial({
    color: fD.accent, metalness: 0.3, roughness: 0.25, emissive: fD.accent, emissiveIntensity: 0.95,
  });
  const matDriverAccent = new THREE.MeshStandardMaterial({
    color: fB.accent, metalness: 0.35, roughness: 0.25, emissive: fB.accent, emissiveIntensity: 0.9,
  });

  const top = new THREE.Group();
  // Energy layer + blades from slot A; top cap glow from slot D (core).
  const { group: energy, blurRing } = buildEnergyLayer(fA, { body: matBody, blade: matBlade, accent: matCore });
  energy.position.y = 0.08;
  // Forge disc colour + size from slot C; inset glow from core.
  const disc = buildForgeDisc(fC, { disc: matDisc, accent: matCore });
  const ds = fC.discScale || 1;
  disc.scale.set(ds, 1, ds);
  // Driver tip shape + colour from slot B.
  const driver = buildDriver(fB, { disc: matShaft, tip: matTip, accent: matDriverAccent });

  // Trail ring + point light glow from slot D (core chip).
  const trailMat = new THREE.MeshBasicMaterial({
    color: fD.glow, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const trailRing = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.006, 8, 80), trailMat);
  trailRing.rotation.x = Math.PI / 2;
  trailRing.position.y = -0.1;
  trailRing.renderOrder = 2;

  const baseLightIntensity = fD.lightIntensity;
  const light = new THREE.PointLight(fD.lightColor, baseLightIntensity, 4.0, 2.0);
  light.position.set(0, 0.1, 0);

  top.add(energy, disc, driver, trailRing, light);
  top.scale.setScalar(SCALE);

  // Local lowest point (driver tip) for floor seating.
  const tipBottom = (-0.24 - 0.16) * SCALE; // approx

  const api = {
    group: top,
    blurRing,
    trailRing,
    light,
    parts: { energy, disc, driver }, // for the 解體 burst animation
    cfg: primary, // for VFX (spark/log colour)
    tipBottom,
    spinAngle: 0,
    // spinRate in rad/s, wobble 0..1 (grows as stamina falls)
    update(dt, spinRate, wobble = 0, elapsed = 0) {
      this.spinAngle += spinRate * dt;
      top.rotation.y = this.spinAngle;
      top.rotation.z = 0.04 * wobble * Math.sin(elapsed * 9.0);
      top.rotation.x = 0.03 * wobble * Math.cos(elapsed * 7.3);
      blurRing.material.opacity = THREE.MathUtils.clamp((spinRate - 8) / 26, 0, 0.5);
      trailRing.material.opacity = 0.12 + 0.13 * (0.5 + 0.5 * Math.sin(elapsed * 7.0)) * (0.4 + 0.6 * (spinRate / 40));
      light.intensity = baseLightIntensity * (0.5 + 0.5 * (spinRate / 40));
    },
    dispose() {
      top.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
    },
  };
  return api;
}
