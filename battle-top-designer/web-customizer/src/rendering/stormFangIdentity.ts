export const stormFangIdentityPolicy = {
  bladeId: 'blade_storm_fang',
  innerRadiusM: 0.018,
  outerRadiusM: 0.03,
  topSurfaceYM: 0.00362,
  thetaLengthRadians: 0.48,
  sectorStarts: [0, Math.PI * 2 / 3, Math.PI * 4 / 3],
  additionalDrawCalls: 3,
  additionalTextures: 1,
  additionalMaterials: 1,
  mutatesGlb: false,
  disposeGeometryOnUnmount: true,
  disposeMaterialOnUnmount: true,
  disposeTextureOnUnmount: false,
} as const;

export function shouldRenderStormFangPattern(bladeId: string, enabled: boolean) {
  return enabled && bladeId === stormFangIdentityPolicy.bladeId;
}
