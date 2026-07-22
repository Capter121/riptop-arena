export type VisualIdentityLayerType = 'core-badge' | 'blade-sector' | 'blade-ring';

export interface VisualIdentityDefinition {
  id: 'solar_wolf' | 'void_falcon' | 'storm_fang' | 'iron_bastion' | 'orbit_halo' | 'dual_comet';
  partId: string;
  label: string;
  layerType: VisualIdentityLayerType;
  texturePath: string;
  enabledStateKey: string;
  meshBudget: number;
  drawCallBudget: number;
  radialRangeM: readonly [number, number];
  topSurfaceYM: number;
  heightOffsetM: number;
  rotationOffsetsRadians: readonly number[];
  materialPolicy: 'transparent-overlay';
}

export const visualIdentityRegistry = [
  { id: 'solar_wolf', partId: 'core_solar_wolf', label: 'Solar badge', layerType: 'core-badge', texturePath: '../../design/visual-identity/solar-wolf-concept.svg', enabledStateKey: 'solarWolfBadgeEnabled', meshBudget: 1, drawCallBudget: 1, radialRangeM: [0, 0.0076], topSurfaceYM: 0.00016, heightOffsetM: 0.00016, rotationOffsetsRadians: [0], materialPolicy: 'transparent-overlay' },
  { id: 'void_falcon', partId: 'core_void_falcon', label: 'Void badge', layerType: 'core-badge', texturePath: '../../design/visual-identity/void-falcon-concept.svg', enabledStateKey: 'voidFalconBadgeEnabled', meshBudget: 1, drawCallBudget: 1, radialRangeM: [0, 0.0072], topSurfaceYM: 0.00016, heightOffsetM: 0.00016, rotationOffsetsRadians: [0], materialPolicy: 'transparent-overlay' },
  { id: 'storm_fang', partId: 'blade_storm_fang', label: 'Storm pattern', layerType: 'blade-sector', texturePath: '../../design/visual-identity/storm-fang-concept.svg', enabledStateKey: 'stormFangPatternEnabled', meshBudget: 3, drawCallBudget: 3, radialRangeM: [0.018, 0.03], topSurfaceYM: 0.00362, heightOffsetM: 0.00014, rotationOffsetsRadians: [0, Math.PI * 2 / 3, Math.PI * 4 / 3], materialPolicy: 'transparent-overlay' },
  { id: 'iron_bastion', partId: 'blade_iron_bastion', label: 'Bastion pattern', layerType: 'blade-sector', texturePath: '../../design/visual-identity/iron-bastion-concept.svg', enabledStateKey: 'ironBastionPatternEnabled', meshBudget: 3, drawCallBudget: 3, radialRangeM: [0.019, 0.028], topSurfaceYM: 0.00362, heightOffsetM: 0.00014, rotationOffsetsRadians: [0, Math.PI * 2 / 3, Math.PI * 4 / 3], materialPolicy: 'transparent-overlay' },
  { id: 'orbit_halo', partId: 'blade_orbit_halo', label: 'Orbit pattern', layerType: 'blade-ring', texturePath: '../../design/visual-identity/orbit-halo-concept.svg', enabledStateKey: 'orbitHaloPatternEnabled', meshBudget: 1, drawCallBudget: 1, radialRangeM: [0.0278, 0.0312], topSurfaceYM: 0.00362, heightOffsetM: 0.00014, rotationOffsetsRadians: [0], materialPolicy: 'transparent-overlay' },
  { id: 'dual_comet', partId: 'blade_dual_comet', label: 'Comet pattern', layerType: 'blade-sector', texturePath: '../../design/visual-identity/dual-comet-concept.svg', enabledStateKey: 'dualCometPatternEnabled', meshBudget: 3, drawCallBudget: 3, radialRangeM: [0.018, 0.0305], topSurfaceYM: 0.00362, heightOffsetM: 0.00016, rotationOffsetsRadians: [0, Math.PI * 2 / 3, Math.PI * 4 / 3], materialPolicy: 'transparent-overlay' },
] as const satisfies readonly VisualIdentityDefinition[];

export const visualIdentityById = Object.fromEntries(visualIdentityRegistry.map(identity => [identity.id, identity])) as {
  [IdentityId in VisualIdentityDefinition['id']]: Extract<(typeof visualIdentityRegistry)[number], { id: IdentityId }>;
};

export function shouldRenderVisualIdentity(partId: string, enabled: boolean, identityId: VisualIdentityDefinition['id']) {
  return enabled && partId === visualIdentityById[identityId].partId;
}
