import * as THREE from 'three';
import {
  TOP_RADIUS,
  TOP_HEIGHT,
  RING_INNER_RATIO,
  RING_OUTER_RATIO,
  RING_EXTRUDE_DEPTH,
  RING_BEVEL_SIZE,
  RING_BEVEL_THICKNESS,
  CORE_SEGMENTS,
  CORE_DOME_HEIGHT,
  DRIVER_CONE_SEGMENTS,
  RIVET_COUNT,
  RIVET_RADIUS,
  RIVET_HEIGHT,
  DRIVER_FIN_COUNT,
} from '../app/config';

// ─────────────────────────────────────────────────────────────
//  Phase 2 — Procedural geometry factory.
//  Bowl-stack vertical hierarchy with greeble details:
//    Ring (highest) → WeightDisc → Core (bowl-concave) → Driver (lowest, with fins)
//  Mechanical rivets and weight-disc slots add micro-surface
//  detail that catches specular at high spin.
// ─────────────────────────────────────────────────────────────

export interface TopGeometrySet {
  ring: THREE.ExtrudeGeometry;
  weightDisc: THREE.ExtrudeGeometry;
  core: THREE.ExtrudeGeometry;
  driver: THREE.ConeGeometry;
  /** Fin planes for the driver, pre-positioned in a Group. */
  driverFins: THREE.PlaneGeometry;
  /** Number of fins around the driver base. */
  driverFinCount: number;
  /** Rivet geometry — one instance, replicated via InstancedMesh. */
  rivet: THREE.CylinderGeometry;
  /** Number of rivets (outer ring + core edge). */
  rivetCount: number;
  /** Orbital positions for each rivet [angle, radius, y] */
  rivetPlacements: Array<{ angle: number; radius: number; y: number }>;
  /** Effective collision radius exposed for battlePhysics. */
  collisionRadius: number;
}

// ── Attack Ring ─────────────────────────────────────────────
// Polar-coordinate blade profile → Shape → ExtrudeGeometry.
// Blade teeth alternate between outerR (tip) and valleyR (trough).
// Each transition uses a quadratic Bézier for sharp but smooth edges.

function createBladeShape(_bladesCount: number): THREE.Shape {
  const numClaws = 3; // Force 3 claws for Azure Dragon style
  const outerR = TOP_RADIUS * RING_OUTER_RATIO;
  const innerR = TOP_RADIUS * RING_INNER_RATIO;
  const shape = new THREE.Shape();
  
  const segmentsPerClaw = 32;
  const totalSegments = numClaws * segmentsPerClaw;

  for (let i = 0; i <= totalSegments; i++) {
    const baseTheta = (i / totalSegments) * Math.PI * 2;
    const t = (i % segmentsPerClaw) / segmentsPerClaw;
    
    let r = innerR;
    let thetaOffset = 0;

    if (t < 0.85) {
      // Aerodynamic vent fin (smooth increase)
      const nt = t / 0.85;
      const ease = 1 - Math.pow(1 - nt, 2); // Quadratic ease out
      r = innerR + (outerR - innerR) * ease;
      thetaOffset = ease * 0.2; // Slight forward sweep
    } else {
      // Sharp claw edge returning to innerR
      const nt = (t - 0.85) / 0.15;
      r = outerR - (outerR - innerR) * Math.pow(nt, 3);
      thetaOffset = 0.2 - nt * 0.4; // Sweeps back into a hook
    }

    const finalTheta = baseTheta + thetaOffset;
    const x = Math.cos(finalTheta) * r;
    const y = Math.sin(finalTheta) * r;

    if (i === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  }

  // Centre bore hole.
  const centerHole = new THREE.Path();
  for (let i = 0; i <= 24; i++) {
    const theta = (i / 24) * Math.PI * 2;
    const hx = Math.cos(theta) * innerR;
    const hy = Math.sin(theta) * innerR;
    i === 0 ? centerHole.moveTo(hx, hy) : centerHole.lineTo(hx, hy);
  }
  shape.holes.push(centerHole);

  // Aerodynamic Vents (Dragon's Breath slots)
  for (let c = 0; c < numClaws; c++) {
    const clawAngle = (c / numClaws) * Math.PI * 2;
    const hole = new THREE.Path();
    const holeInnerR = innerR * 1.08;
    const holeOuterR = innerR * 1.35;
    const holeStartTheta = clawAngle + 0.3;
    const holeEndTheta = clawAngle + (Math.PI * 2 / numClaws) - 0.7;
    
    // Draw hole
    for (let i = 0; i <= 10; i++) {
       const th = holeStartTheta + (i / 10) * (holeEndTheta - holeStartTheta);
       const hx = Math.cos(th) * holeOuterR;
       const hy = Math.sin(th) * holeOuterR;
       i === 0 ? hole.moveTo(hx, hy) : hole.lineTo(hx, hy);
    }
    for (let i = 0; i <= 10; i++) {
       const th = holeEndTheta - (i / 10) * (holeEndTheta - holeStartTheta);
       const hx = Math.cos(th) * holeInnerR;
       const hy = Math.sin(th) * holeInnerR;
       hole.lineTo(hx, hy);
    }
    shape.holes.push(hole);
  }

  return shape;
}

function createRingGeometry(bladesCount: number): THREE.ExtrudeGeometry {
  return new THREE.ExtrudeGeometry(createBladeShape(bladesCount), {
    depth: RING_EXTRUDE_DEPTH,
    bevelEnabled: true,
    bevelSize: RING_BEVEL_SIZE,
    bevelThickness: RING_BEVEL_THICKNESS,
    bevelSegments: 2,
    curveSegments: 4,
  });
}

// ── Weight Disc (重量环夹层) ────────────────────────────────
// A flat annular ring with symmetric slot cutouts.
// Sits between the attack ring and the core to add mass and greeble.
// Each slot is a 30° arc removed from the outer portion.

function createWeightDiscGeometry(): THREE.ExtrudeGeometry {
  const outerR = TOP_RADIUS * RING_INNER_RATIO * 0.96;
  const innerR = TOP_RADIUS * 0.34;
  
  const shape = new THREE.Shape();
  const numGrooves = 12; // 12 mechanical exhaust slots
  const segmentsPerGroove = 4;
  const totalSegments = numGrooves * segmentsPerGroove;

  for (let i = 0; i <= totalSegments; i++) {
    const theta = (i / totalSegments) * Math.PI * 2;
    // Step function for grooves
    const t = i % segmentsPerGroove;
    const isGroove = (t === 1 || t === 2);
    const r = isGroove ? outerR * 0.75 : outerR;
    
    const x = Math.cos(theta) * r;
    const y = Math.sin(theta) * r;
    i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
  }

  // Centre hole.
  const hole = new THREE.Path();
  for (let i = 0; i <= 24; i++) {
    const theta = -(i / 24) * Math.PI * 2;
    const hx = Math.cos(theta) * innerR;
    const hy = Math.sin(theta) * innerR;
    i === 0 ? hole.moveTo(hx, hy) : hole.lineTo(hx, hy);
  }
  shape.holes.push(hole);

  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.12, // Thicker forge disc
    bevelEnabled: true,
    bevelSize: 0.015,
    bevelThickness: 0.015,
    bevelSegments: 1,
    curveSegments: 1,
  });
}

// ── Core (战神芯) ──────────────────────────────────────────
// Octagonal prism with dome bevel, sits in the bowl concave.

function createCoreGeometry(): THREE.ExtrudeGeometry {
  const coreR = TOP_RADIUS * 0.42;
  const shape = new THREE.Shape();
  for (let i = 0; i <= CORE_SEGMENTS; i++) {
    const theta = (i / CORE_SEGMENTS) * Math.PI * 2;
    const x = Math.cos(theta) * coreR;
    const y = Math.sin(theta) * coreR;
    i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
  }
  return new THREE.ExtrudeGeometry(shape, {
    depth: TOP_HEIGHT * 0.42 + CORE_DOME_HEIGHT,
    bevelEnabled: true,
    bevelSize: 0.03,
    bevelThickness: CORE_DOME_HEIGHT,
    bevelSegments: 3,
    curveSegments: 1,
  });
}

// ── Driver (底轴 + 导流翼) ─────────────────────────────────
// Downward cone with triangular fin planes for aerodynamic detail.

function createDriverGeometry(): THREE.ConeGeometry {
  return new THREE.ConeGeometry(
    TOP_RADIUS * 0.28,
    TOP_HEIGHT * 0.54,
    DRIVER_CONE_SEGMENTS,
    1,
    false,
  );
}

function createDriverFinGeometry(): THREE.PlaneGeometry {
  // Each fin is a small triangular plane rotated 45° and
  // attached at the driver base. Size relative to driver radius.
  return new THREE.PlaneGeometry(TOP_RADIUS * 0.22, TOP_HEIGHT * 0.28);
}

// ── Rivet (铆钉) ───────────────────────────────────────────
// Tiny hexagonal cylinders distributed around ring outer and core edge.
// Rendered as InstancedMesh (1 draw call for all rivets).

function createRivetGeometry(): THREE.CylinderGeometry {
  return new THREE.CylinderGeometry(RIVET_RADIUS, RIVET_RADIUS, RIVET_HEIGHT, 6);
}

function computeRivetPlacements(): TopGeometrySet['rivetPlacements'] {
  const placements: TopGeometrySet['rivetPlacements'] = [];

  // Outer ring rivets — sit on top of the attack ring, near outer edge.
  const ringR = TOP_RADIUS * RING_OUTER_RATIO * 0.88;
  for (let i = 0; i < RIVET_COUNT; i++) {
    const angle = (i / RIVET_COUNT) * Math.PI * 2;
    placements.push({
      angle,
      radius: ringR,
      y: TOP_HEIGHT * 0.25 + RING_EXTRUDE_DEPTH + RIVET_HEIGHT * 0.5,
    });
  }

  // Core edge rivets — smaller orbit, on the core's upper surface.
  const coreR = TOP_RADIUS * 0.42 * 0.85;
  for (let i = 0; i < RIVET_COUNT; i++) {
    // Offset by half-step so they don't align with ring rivets.
    const angle = ((i + 0.5) / RIVET_COUNT) * Math.PI * 2;
    placements.push({
      angle,
      radius: coreR,
      y: TOP_HEIGHT * 0.46 + CORE_DOME_HEIGHT + RIVET_HEIGHT * 0.3,
    });
  }

  return placements;
}

// ── Public factory ──────────────────────────────────────────

export function createTopGeometry(
  bladesCount: number = 3,
): TopGeometrySet {
  const ring = createRingGeometry(bladesCount);
  const weightDisc = createWeightDiscGeometry();
  const core = createCoreGeometry();
  const driver = createDriverGeometry();
  const driverFins = createDriverFinGeometry();
  const rivet = createRivetGeometry();
  const rivetPlacements = computeRivetPlacements();
  const collisionRadius = TOP_RADIUS * RING_OUTER_RATIO + RING_BEVEL_SIZE;

  return {
    ring,
    weightDisc,
    core,
    driver,
    driverFins,
    driverFinCount: DRIVER_FIN_COUNT,
    rivet,
    rivetCount: rivetPlacements.length,
    rivetPlacements,
    collisionRadius,
  };
}
