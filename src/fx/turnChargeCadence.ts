export const TURN_CHARGE_EMISSION_INTERVAL = 1 / 15;

export function advanceTurnChargeCadence(elapsed: number, dt: number) {
  if (!Number.isFinite(dt) || dt <= 0) return { elapsed, emit: false };

  const nextElapsed = elapsed + dt;
  if (nextElapsed < TURN_CHARGE_EMISSION_INTERVAL) {
    return { elapsed: nextElapsed, emit: false };
  }

  return {
    elapsed: nextElapsed % TURN_CHARGE_EMISSION_INTERVAL,
    emit: true,
  };
}
