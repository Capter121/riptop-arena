// Procedural stadium bowl. Inner surface is a paraboloid so it matches the
// sim's containment radius, plus a raised rim, underside shell, base ring and
// emissive accent rings. Material profile follows arena lore (poly/metal/wood).

import * as THREE from 'three';

// Bowl surface height at radius r (paraboloid): center is lowest, rim at 0.
export function bowlSurfaceY(r, radius, depth) {
  const t = Math.min(1, r / radius);
  return -depth * (1 - t * t);
}

function materialFor(kind, baseColor, accent) {
  if (kind === 'metal') {
    return new THREE.MeshStandardMaterial({ color: baseColor, metalness: 0.92, roughness: 0.28 });
  }
  if (kind === 'wood') {
    return new THREE.MeshStandardMaterial({ color: baseColor, metalness: 0.05, roughness: 0.82 });
  }
  // polycarbonate — semi-glossy plastic
  return new THREE.MeshStandardMaterial({ color: baseColor, metalness: 0.25, roughness: 0.4 });
}

export function buildArena(arena) {
  const v = arena.visual;
  const R = v.radius;
  const depth = v.depth;
  const group = new THREE.Group();

  // --- Inner bowl surface (lathe of the paraboloid profile + rim lip) ---
  const profile = [];
  const STEPS = 28;
  for (let i = 0; i <= STEPS; i++) {
    const r = (i / STEPS) * R;
    const y = bowlSurfaceY(r, R, depth);
    profile.push(new THREE.Vector2(Math.max(0.02, r), y));
  }
  // rim lip rising above 0
  profile.push(new THREE.Vector2(R, v.rimHeight));
  profile.push(new THREE.Vector2(R + 0.5, v.rimHeight + 0.15));
  profile.push(new THREE.Vector2(R + 0.7, v.rimHeight));
  // wall going down to form thickness
  profile.push(new THREE.Vector2(R + 0.7, -depth - 0.6));
  const bowlGeo = new THREE.LatheGeometry(profile, 96);
  const bowlMat = materialFor(v.materialKind, v.baseColor, v.accent);
  bowlMat.side = THREE.DoubleSide;
  const bowl = new THREE.Mesh(bowlGeo, bowlMat);
  bowl.receiveShadow = true;
  group.add(bowl);

  // --- Base disc under the bowl ---
  const baseGeo = new THREE.CylinderGeometry(R + 0.7, R + 1.1, 0.6, 96);
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x0d1018,
    metalness: 0.6,
    roughness: 0.5,
  });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = -depth - 0.9;
  base.receiveShadow = true;
  group.add(base);

  // --- Emissive accent rim ring (blooms) ---
  const rimGeo = new THREE.TorusGeometry(R + 0.35, 0.07, 16, 120);
  const rimMat = new THREE.MeshStandardMaterial({
    color: v.accent,
    emissive: v.accent,
    emissiveIntensity: 1.6,
    metalness: 0.4,
    roughness: 0.3,
  });
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = v.rimHeight + 0.02;
  group.add(rim);

  // --- Concentric guide rings on the floor (subtle emissive) ---
  for (let k = 1; k <= 3; k++) {
    const rr = (R * k) / 3.4;
    const ringGeo = new THREE.RingGeometry(rr - 0.03, rr + 0.03, 96);
    const ringMat = new THREE.MeshBasicMaterial({
      color: v.accent,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = bowlSurfaceY(rr, R, depth) + 0.02;
    ring.renderOrder = 1;
    group.add(ring);
  }

  // center marker
  const centerGeo = new THREE.CircleGeometry(0.5, 48);
  const centerMat = new THREE.MeshBasicMaterial({
    color: v.accent,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const center = new THREE.Mesh(centerGeo, centerMat);
  center.rotation.x = -Math.PI / 2;
  center.position.y = bowlSurfaceY(0, R, depth) + 0.02;
  group.add(center);

  return {
    group,
    radius: R,
    depth,
    surfaceY: (r) => bowlSurfaceY(r, R, depth),
    rim,
    dispose() {
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
    },
  };
}
