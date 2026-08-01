import type { PartAffinity } from '../../../shared/nss/affinity';
import { resolveAffinityProfile } from '../../../shared/nss/affinity';
import { attributeNames, conceptAttributes } from '../attributes';
import { partById, type AffinitySelection, type Combination, type Family } from '../domain';
import { createAffinityViewModel } from '../affinity/affinityViewModel';

const attributeLabels = {
  attack: '攻击', defense: '防御', stamina: '持久', balance: '平衡', weight: '重量倾向', height: '高度倾向',
} as const;

export type DeltaComparisonItem = {
  key: string;
  label: string;
  kind: 'delta';
  delta: number;
};

export type TransitionComparisonItem = {
  key: string;
  label: string;
  kind: 'transition';
  before: string;
  after: string;
  direction: 'up' | 'down' | 'change';
};

export type ComparisonItem = DeltaComparisonItem | TransitionComparisonItem;

export type ComparisonModel = {
  key: string;
  kind: 'part' | 'affinity';
  title: string;
  items: ComparisonItem[];
};

export function comparePartCandidate(combination: Combination, family: Family, candidateId: string): ComparisonModel | null {
  if (combination[family] === candidateId) return null;
  const currentPart = partById.get(combination[family]);
  const candidatePart = partById.get(candidateId);
  if (!currentPart || candidatePart?.family !== family) return null;

  const current = conceptAttributes(combination);
  const candidate = conceptAttributes({ ...combination, [family]: candidateId });
  const items = attributeNames.flatMap(name => {
    const delta = candidate[name] - current[name];
    return delta === 0 ? [] : [{ key: name, label: attributeLabels[name], kind: 'delta' as const, delta }];
  });
  return items.length === 0 ? null : {
    key: `part:${family}:${candidateId}`,
    kind: 'part',
    title: `${currentPart.displayName} → ${candidatePart.displayName}`,
    items,
  };
}

export function compareAffinityCandidate(affinities: AffinitySelection, family: Family, candidateAffinity: PartAffinity): ComparisonModel | null {
  if (affinities[family] === candidateAffinity) return null;
  const candidateAffinities = { ...affinities, [family]: candidateAffinity };
  const current = createAffinityViewModel(resolveAffinityProfile(affinities));
  const candidate = createAffinityViewModel(resolveAffinityProfile(candidateAffinities));
  const currentLabels = new Map(current.counts.map(entry => [entry.affinity, entry.label]));
  const items: ComparisonItem[] = [];

  for (const entry of current.counts) {
    const next = candidate.counts.find(candidateEntry => candidateEntry.affinity === entry.affinity)!;
    if (entry.count === next.count) continue;
    items.push({
      key: `count-${entry.affinity}`,
      label: `${entry.label}数量`,
      kind: 'transition',
      before: String(entry.count),
      after: String(next.count),
      direction: next.count > entry.count ? 'up' : 'down',
    });
  }
  if (current.primary.affinity !== candidate.primary.affinity) {
    items.push({ key: 'primary', label: '主属性', kind: 'transition', before: current.primary.label, after: candidate.primary.label, direction: 'change' });
  }
  if (current.resonance.label !== candidate.resonance.label) {
    items.push({ key: 'resonance', label: '共鸣', kind: 'transition', before: current.resonance.label, after: candidate.resonance.label, direction: 'change' });
  }
  const currentBonuses = current.bonuses.join(' · ') || '无';
  const candidateBonuses = candidate.bonuses.join(' · ') || '无';
  if (currentBonuses !== candidateBonuses) {
    items.push({ key: 'bonuses', label: '加成', kind: 'transition', before: currentBonuses, after: candidateBonuses, direction: 'change' });
  }

  return items.length === 0 ? null : {
    key: `affinity:${family}:${candidateAffinity}`,
    kind: 'affinity',
    title: `${currentLabels.get(affinities[family])} → ${currentLabels.get(candidateAffinity)}`,
    items,
  };
}
