export const solarWolfBadgePolicy = {
  coreId: 'core_solar_wolf',
  radiusM: 0.0076,
  topOffsetM: 0.00016,
  additionalDrawCalls: 1,
  additionalTextures: 1,
} as const;

export function shouldRenderSolarWolfBadge(coreId: string, enabled: boolean) {
  return enabled && coreId === solarWolfBadgePolicy.coreId;
}
