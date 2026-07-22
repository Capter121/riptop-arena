import { shouldRenderVisualIdentity, visualIdentityById } from './visualIdentityRegistry';

export const voidFalconBadgePolicy = visualIdentityById.void_falcon;
export const ironBastionIdentityPolicy = visualIdentityById.iron_bastion;
export const orbitHaloIdentityPolicy = visualIdentityById.orbit_halo;
export const dualCometIdentityPolicy = visualIdentityById.dual_comet;

export const shouldRenderVoidFalconBadge = (coreId: string, enabled: boolean) => shouldRenderVisualIdentity(coreId, enabled, 'void_falcon');
export const shouldRenderIronBastionPattern = (bladeId: string, enabled: boolean) => shouldRenderVisualIdentity(bladeId, enabled, 'iron_bastion');
export const shouldRenderOrbitHaloPattern = (bladeId: string, enabled: boolean) => shouldRenderVisualIdentity(bladeId, enabled, 'orbit_halo');
export const shouldRenderDualCometPattern = (bladeId: string, enabled: boolean) => shouldRenderVisualIdentity(bladeId, enabled, 'dual_comet');
