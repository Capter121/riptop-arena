// BalanceConfig — every tunable constant from PRD ch.10.7 in one place.
// Tweaking balance = editing this file, no logic changes.

export const BALANCE = {
  // Global damage scaling -> controls match length (lower = longer, more decisions).
  DMG: 0.74,
  // Attack marginal-diminishing exponent (PRD ch.10.8 lever #1): damage uses
  // ATK^ATK_EXP so glass-cannon attack stops swamping the counter triangle.
  ATK_EXP: 0.82,
  // Defense half-life: opponent DEF = MIT gives ~50% mitigation.
  MIT: 62,
  // Speed/Weight/Trajectory counter triangle multipliers.
  COUNTER_WIN: 1.14,
  COUNTER_LOSE: 0.88,
  // Avoidance: (defSpd+defTrj - atkSpd-atkTrj) * coeff, capped. Speed/trajectory's
  // survival identity (PRD lever #4) — buffed so pure-speed builds are viable.
  DODGE_COEFF: 0.008,
  DODGE_CAP: 0.5,
  // Stamina pool = (BASE + WGT*WEIGHT_COEFF) * launchMult.
  STAMINA_BASE: 820,
  STAMINA_WEIGHT_COEFF: 4.0,
  // Per-second drain model.
  DRAIN_BASE: 5.6,
  DRAIN_SPEED_DIV: 440,
  DRAIN_WEIGHT_DIV: 240,
  DRAIN_WEIGHT_CAP: 0.18,
  DRAIN_DEF_DIV: 320,
  DRAIN_DEF_CAP: 0.15,
  // Reaction (self) drain for the attacker.
  REACTION_COEFF: 0.46,
  REACTION_WEIGHT_DIV: 45,
  // Collision cadence.
  COLLIDE_BASE: 1.25,
  COLLIDE_SPEED_DIV: 110,
  COLLIDE_JITTER: [0.7, 1.3],
  // Tops must be within this centre distance (world units) for a hit to land
  // and spark -> no collision VFX while they are far apart.
  CONTACT_DIST: 1.8,
  // Synergy (within one top).
  SYNERGY_THRESHOLD: 26,
  SYNERGY_COEFF: 0.12,
  // Crit (driven by BST).
  CRIT_CHANCE_BASE: 0.05,
  CRIT_CHANCE_PER_BST: 0.013,
  CRIT_CHANCE_CAP: 0.50,
  CRIT_MULT_BASE: 1.5,
  CRIT_MULT_PER_BST: 0.022,
  // Finisher (per collision-direction). Two distinct dramatic KOs:
  //   彈飛 ring-out  — flung out of the bowl (gated by arena.ringout)
  //   解體 burst     — top disassembles (not gated by arena; loves attacker BST)
  // Finishers only roll once the defender is past the execution line.
  EXECUTE_THRESHOLD: 0.2, // 斬殺線 — 20% stamina
  KO_RING_BASE: 0.014,
  KO_BURST_BASE: 0.008,
  // Finisher chance scales up as the defender weakens: x(1 + ramp*(1-frac)^2).
  KO_LOW_STAMINA: 5.0,
  // Crit knockback: chance to shove the defender (lighter = more likely/farther).
  CRIT_KB_CHANCE_BASE: 0.78,
  CRIT_KB_CHANCE_PER_WGT: 0.013,
  CRIT_KB_FORCE: 6.5,
  // Damage roll spread.
  DMG_ROLL: [0.88, 1.12],
  // Arena pull -> extra collision damage.
  PULL_DMG_COEFF: 0.12,
  // Match cap.
  MATCH_TIME_LIMIT: 60, // seconds
  TICK_HZ: 60,
};

// Normalisation maxima for the counter "dominant stat" decision.
// Taken from PRD ch.5 全陀螺範圍 upper bounds.
export const STAT_MAX = {
  spd: 46,
  wgt: 44,
  trj: 39,
  atk: 39,
  def: 44,
  bst: 34,
};

// Score per win type (PRD ch.10.6). Both finisher types are worth 2.
export const WIN_SCORE = {
  spinout: 1,
  ringout: 2, // 彈飛
  burst: 2, // 解體
  decision: 1,
};
