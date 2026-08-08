import type { AffinityRelation, PartAffinity } from '../../battle-top-designer/shared/nss/affinity';
import type { BattleAffinityProfile } from '../gameplay/battleAffinity';
import type { DamageResult } from '../gameplay/damage';

export type AffinityBadge = Readonly<{
  key: PartAffinity | 'NEUTRAL';
  label: string;
  color: string;
}>;

export type AffinityMatchupPresentation = Readonly<{
  playerBadge: AffinityBadge;
  enemyBadge: AffinityBadge;
  playerResonanceLabel: string;
  enemyResonanceLabel: string;
  relationLabel: string;
}>;

export type AffinityDamageTotals = Readonly<{
  physical: number;
  elemental: number;
  resonance: number;
  relation: number;
}>;

export type AffinityDamageSummary = Readonly<{
  dealt: AffinityDamageTotals;
  taken: AffinityDamageTotals;
}>;

const AFFINITY_BADGES: Readonly<Record<PartAffinity, AffinityBadge>> = Object.freeze({
  WIND: Object.freeze({ key: 'WIND', label: '风', color: '#79e6ad' }),
  FIRE: Object.freeze({ key: 'FIRE', label: '火', color: '#ff6b45' }),
  WATER: Object.freeze({ key: 'WATER', label: '水', color: '#5ac8fa' }),
  WOOD: Object.freeze({ key: 'WOOD', label: '木', color: '#9fe870' }),
  EARTH: Object.freeze({ key: 'EARTH', label: '土', color: '#d7a86e' }),
  LIGHT: Object.freeze({ key: 'LIGHT', label: '光', color: '#fff1a8' }),
  DARK: Object.freeze({ key: 'DARK', label: '暗', color: '#b58cff' }),
});

const NEUTRAL_BADGE: AffinityBadge = Object.freeze({ key: 'NEUTRAL', label: '无', color: '#93a4b8' });
const EMPTY_TOTALS: AffinityDamageTotals = Object.freeze({ physical: 0, elemental: 0, resonance: 0, relation: 0 });

export function getAffinityBadge(affinity: PartAffinity | null): AffinityBadge {
  return affinity ? AFFINITY_BADGES[affinity] : NEUTRAL_BADGE;
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function getResonanceLabel(profile: BattleAffinityProfile) {
  const resonance = profile.resonance;
  if (resonance.kind === 'offense') {
    return `${getAffinityBadge(resonance.affinity).label}系进攻共鸣 · ${resonance.count}件 · +${percent(resonance.bonus)}`;
  }
  if (resonance.kind === 'harmony') {
    return `调和共鸣 · 防御 +${percent(resonance.defenseBonus)} · 稳定 +${percent(resonance.stabilityBonus)}`;
  }
  return '无共鸣';
}

export function createAffinityMatchupPresentation(
  player: BattleAffinityProfile,
  enemy: BattleAffinityProfile,
  playerRelation: AffinityRelation,
  enemyRelation: AffinityRelation,
): AffinityMatchupPresentation {
  const isMutualCounter = playerRelation === 'advantage' && enemyRelation === 'advantage';
  const relationLabel = isMutualCounter
    ? '光暗双向克制'
    : playerRelation === 'advantage'
      ? '我方克制敌方'
      : playerRelation === 'disadvantage'
        ? '敌方克制我方'
        : '属性中立';

  return {
    playerBadge: getAffinityBadge(player.primary),
    enemyBadge: getAffinityBadge(enemy.primary),
    playerResonanceLabel: getResonanceLabel(player),
    enemyResonanceLabel: getResonanceLabel(enemy),
    relationLabel,
  };
}

export function renderAffinityBadge(container: HTMLElement, badge: AffinityBadge) {
  const renderKey = `${badge.key}:${badge.label}`;
  if (container.dataset.affinityRenderKey === renderKey) return;
  container.dataset.affinityRenderKey = renderKey;
  container.replaceChildren();
  const element = document.createElement('span');
  element.className = 'affinity-badge';
  element.dataset.affinity = badge.key;
  element.style.setProperty('--affinity-color', badge.color);
  element.textContent = `${badge.label}属性`;
  container.append(element);
}

export function renderAffinityMatchup(container: HTMLElement, matchup: AffinityMatchupPresentation) {
  container.replaceChildren();
  const eyebrow = document.createElement('div');
  const sides = document.createElement('div');
  const player = document.createElement('div');
  const enemy = document.createElement('div');
  const versus = document.createElement('div');
  const relation = document.createElement('div');

  eyebrow.className = 'affinity-versus__eyebrow';
  eyebrow.textContent = '属性对局';
  sides.className = 'affinity-versus__sides';
  player.className = 'affinity-versus__side';
  enemy.className = 'affinity-versus__side';
  versus.className = 'affinity-versus__mark';
  versus.textContent = 'VS';
  relation.className = 'affinity-versus__relation';
  relation.textContent = matchup.relationLabel;

  const appendSide = (side: HTMLElement, label: string, badge: AffinityBadge, resonance: string) => {
    const sideLabel = document.createElement('span');
    const badgeHost = document.createElement('div');
    const resonanceLabel = document.createElement('small');
    sideLabel.textContent = label;
    sideLabel.className = 'affinity-versus__side-label';
    resonanceLabel.textContent = resonance;
    resonanceLabel.className = 'affinity-versus__resonance';
    renderAffinityBadge(badgeHost, badge);
    side.append(sideLabel, badgeHost, resonanceLabel);
  };

  appendSide(player, '我方', matchup.playerBadge, matchup.playerResonanceLabel);
  appendSide(enemy, '敌方', matchup.enemyBadge, matchup.enemyResonanceLabel);
  sides.append(player, versus, enemy);
  container.append(eyebrow, sides, relation);
}

function signed(value: number) {
  return value >= 0 ? `+${value}` : String(value);
}

export function formatAffinityDamageLog(result: DamageResult) {
  if (result.didMiss || result.finalDamage <= 0) return '';
  const parts: string[] = [];
  if (result.affinityRelation === 'advantage') parts.push(`属性优势 ${signed(result.relationContribution)}`);
  if (result.affinityRelation === 'disadvantage') parts.push(`属性劣势 ${signed(result.relationContribution)}`);
  if (result.resonanceContribution !== 0) parts.push(`进攻共鸣 ${signed(result.resonanceContribution)}`);
  return parts.join(' · ');
}

export function createEmptyAffinityDamageSummary(): AffinityDamageSummary {
  return { dealt: EMPTY_TOTALS, taken: EMPTY_TOTALS };
}

export function accumulateAffinityDamageSummary(
  summary: AffinityDamageSummary,
  result: DamageResult,
): AffinityDamageSummary {
  if (result.didMiss || result.finalDamage <= 0) return summary;
  const key = result.defender === 'enemy' ? 'dealt' : 'taken';
  const current = summary[key];
  return {
    ...summary,
    [key]: {
      physical: current.physical + result.physicalDamage,
      elemental: current.elemental + result.elementalDamage,
      resonance: current.resonance + result.resonanceContribution,
      relation: current.relation + result.relationContribution,
    },
  };
}
