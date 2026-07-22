export const NSS_FAMILIES = ['core', 'blade', 'assist', 'gear', 'tip'] as const;
export type NssFamily = (typeof NSS_FAMILIES)[number];
export type NssCombination = Record<NssFamily, string>;

export type NssBattleLoadoutV1 = {
  schemaVersion: 1;
  interfaceId: 'NSS-V1';
  combination: NssCombination;
};

export type NssPartRecord = {
  id: string;
  displayName: string;
  family: NssFamily;
  partType: string;
  interfaceId: 'NSS-V1';
  heightMm: number;
  specSha256: string;
};

export type NssBattlePartRecord = {
  id: string;
  family: NssFamily;
  stats: {
    attack: number;
    defense: number;
    stamina: number;
    mobility: number;
    burstResist: number;
  };
  physics: {
    weight: number;
    collisionRadius?: number;
  };
};
