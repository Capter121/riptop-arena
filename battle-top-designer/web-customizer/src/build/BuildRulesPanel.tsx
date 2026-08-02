import { AFFINITIES, type PartAffinity } from '../../../shared/nss/affinity';
import type { BuildRulePresetId, BuildRuleViolation } from '../../../shared/nss/build-rules';

const presetLabels: Record<BuildRulePresetId, string> = {
  FREE: '自由组装',
  LIGHTWEIGHT: '轻量竞技',
  ELEMENT_SPECIALIST: '元素专精',
  BASIC_PARTS_CUP: '基础零件杯',
};

const affinityLabels: Record<PartAffinity, string> = {
  WIND: '风', FIRE: '火', WATER: '水', WOOD: '木', EARTH: '土', LIGHT: '光', DARK: '暗',
};

type BuildRulesPanelProps = {
  preset: BuildRulePresetId;
  elementAffinity: PartAffinity;
  violations: readonly BuildRuleViolation[];
  weight: number;
  affinityCount: number;
  randomFailure: string | null;
  randomDisabled: boolean;
  onPresetChange: (preset: BuildRulePresetId) => void;
  onElementAffinityChange: (affinity: PartAffinity) => void;
  onRandom: () => void;
};

function violationText(violation: BuildRuleViolation): string {
  if (violation.code === 'DISABLED_PART') return `${violation.displayName} 在基础零件杯中不可用`;
  if (violation.code === 'WEIGHT_LIMIT') {
    return `总重量 ${violation.actual.toFixed(2)}，超过上限 ${violation.excess.toFixed(2)}`;
  }
  return `${affinityLabels[violation.affinity]}属性 ${violation.actual} / ${violation.minimum}，还缺 ${violation.missing} 件`;
}

function legalText(preset: BuildRulePresetId, weight: number, affinity: PartAffinity, affinityCount: number): string {
  if (preset === 'FREE') return '当前装配不受规则限制';
  if (preset === 'LIGHTWEIGHT') return `符合轻量竞技 · ${weight.toFixed(2)} / 2.10`;
  if (preset === 'ELEMENT_SPECIALIST') return `符合元素专精 · ${affinityLabels[affinity]}属性 ${affinityCount} / 3`;
  return '符合基础零件杯 · 未使用禁用零件';
}

export function BuildRulesPanel({
  preset, elementAffinity, violations, weight, affinityCount, randomFailure, randomDisabled,
  onPresetChange, onElementAffinityChange, onRandom,
}: BuildRulesPanelProps) {
  const hasError = violations.length > 0 || randomFailure !== null;

  return (
    <section className="build-rules-panel" data-testid="build-rules-panel" data-preset={preset} aria-labelledby="build-rules-title">
      <div className="build-rules-heading">
        <div>
          <span>装配规则</span>
          <h4 id="build-rules-title">{presetLabels[preset]}</h4>
        </div>
        <button type="button" className="primary" data-testid="rule-random" disabled={randomDisabled} onClick={onRandom}>
          按规则随机
        </button>
      </div>

      <div className="build-rule-presets" role="group" aria-label="选择装配规则预设">
        {(Object.keys(presetLabels) as BuildRulePresetId[]).map(id => (
          <button
            type="button"
            key={id}
            data-testid={`rule-preset-${id}`}
            aria-pressed={preset === id}
            onClick={() => onPresetChange(id)}
          >
            {presetLabels[id]}
          </button>
        ))}
      </div>

      {preset === 'ELEMENT_SPECIALIST' && (
        <div className="build-rule-affinities" data-testid="rule-affinities" role="group" aria-label="选择元素专精属性">
          {AFFINITIES.map(affinity => (
            <button
              type="button"
              key={affinity}
              data-testid={`rule-affinity-${affinity}`}
              aria-pressed={elementAffinity === affinity}
              onClick={() => onElementAffinityChange(affinity)}
            >
              {affinityLabels[affinity]}
            </button>
          ))}
        </div>
      )}

      <div className={hasError ? 'build-rule-status invalid' : 'build-rule-status valid'} data-testid="rule-status" role="status" aria-live="polite">
        {violations.length === 0 && !randomFailure && <p>✓ {legalText(preset, weight, elementAffinity, affinityCount)}</p>}
        {violations.length > 0 && (
          <ul>{violations.map((violation, index) => <li key={`${violation.code}-${index}`}>⚠ {violationText(violation)}</li>)}</ul>
        )}
        {randomFailure && <p>⚠ {randomFailure}</p>}
      </div>
    </section>
  );
}
