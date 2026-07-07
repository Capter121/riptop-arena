export const ARENA_RADIUS = 8.6;
export const ARENA_FLOOR_Y = 0;
export const TOP_RADIUS = 0.82;
export const TOP_HEIGHT = 0.52;
export const COUNTDOWN_SECONDS = 3;
export const ROUND_TIME = 45;
export const MAX_BURST = 100;
export const LAUNCH_MAX_POWER = 1;
export const COLLISION_COOLDOWN = 0.08;
export const PLAYER_DASH_COOLDOWN = 0.45;

export const CAMERA_TUNING = {
  chaseDistanceStart: 1.6,
  chaseDistanceRange: 1.9,
  chaseSpeedScale: 0.035,
  chaseOffsetScale: 0.95,
  dangerStart: 0.6,
  dangerRange: 0.18,
  dangerFocusBias: 0.72,
  dangerDistanceBoost: 3.45,
  dangerHeightBoost: 2.35,
  dangerCompressionBoost: 1.38,
};

// ── Procedural geometry parameters ──────────────────────────
export const RING_BLADES_DEFAULT = 6;
export const RING_INNER_RATIO = 0.52;
export const RING_OUTER_RATIO = 1.12;
export const RING_BLADE_DEPTH = 0.18;
export const RING_EXTRUDE_DEPTH = 0.22;
export const RING_BEVEL_SIZE = 0.06;
export const RING_BEVEL_THICKNESS = 0.05;
export const CORE_SEGMENTS = 8;
export const CORE_DOME_HEIGHT = 0.08;
export const DRIVER_CONE_SEGMENTS = 12;

// ── Phase 2: stacked geometry parameters ────────────────────
export const WEIGHT_DISC_SLOTS = 6;
export const WEIGHT_DISC_THICKNESS = 0.06;
export const RIVET_COUNT = 6;
export const RIVET_RADIUS = 0.025;
export const RIVET_HEIGHT = 0.04;
export const DRIVER_FIN_COUNT = 3;
export const EDGE_GRIND_THRESHOLD = 0.82;
export const ARENA_SLOPE_START = 0.6; // Slope begins at 60% of ARENA_RADIUS
export const SLOPE_STEEPNESS = 1.2; // Height multiplier for the curve
