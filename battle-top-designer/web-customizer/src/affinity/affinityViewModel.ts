import {
  AFFINITIES,
  getAffinityRelation,
  type AffinityProfile,
  type PartAffinity,
} from '../../../shared/nss/affinity';

const affinityLabels: Record<PartAffinity, string> = {
  WIND: '风',
  FIRE: '火',
  WATER: '水',
  WOOD: '木',
  EARTH: '土',
  LIGHT: '光',
  DARK: '暗',
};

type AffinityLabel = { affinity: PartAffinity; label: string };

export type AffinityViewModel = {
  primary: AffinityLabel;
  counts: Array<AffinityLabel & { count: number }>;
  resonance: { kind: AffinityProfile['resonance']['kind']; label: string };
  strengths: AffinityLabel[];
  weaknesses: AffinityLabel[];
  bonuses: string[];
};

function label(affinity: PartAffinity): AffinityLabel {
  return { affinity, label: affinityLabels[affinity] };
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function createAffinityViewModel(profile: AffinityProfile): AffinityViewModel {
  const resonance = profile.resonance.kind === 'offense'
    ? { kind: 'offense' as const, label: `纯属性进攻共鸣（${profile.resonance.count}件）` }
    : profile.resonance.kind === 'harmony'
      ? { kind: 'harmony' as const, label: `协调共鸣（${profile.resonance.distribution}）` }
      : { kind: 'none' as const, label: '无共鸣' };

  const bonuses = profile.resonance.kind === 'offense'
    ? [`元素进攻 +${percent(profile.resonance.bonus)}`]
    : profile.resonance.kind === 'harmony'
      ? [
          `防御 +${percent(profile.resonance.defenseBonus)}`,
          `稳定性 +${percent(profile.resonance.stabilityBonus)}`,
        ]
      : [];

  return {
    primary: label(profile.primary),
    counts: AFFINITIES.map(affinity => ({ ...label(affinity), count: profile.counts[affinity] })),
    resonance,
    strengths: AFFINITIES.filter(affinity => getAffinityRelation(profile.primary, affinity) === 'advantage').map(label),
    weaknesses: AFFINITIES.filter(affinity => getAffinityRelation(affinity, profile.primary) === 'advantage').map(label),
    bonuses,
  };
}
