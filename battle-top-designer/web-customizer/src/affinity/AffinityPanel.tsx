import { AFFINITIES, type PartAffinity } from '../../../shared/nss/affinity';
import { PreviewableButton } from '../comparison/PreviewableButton';
import type { ComparisonModel } from '../comparison/comparisonModel';
import { AffinityComparison } from './AffinityComparison';
import type { AffinityViewModel } from './affinityViewModel';
import { AffinityBadge } from './AffinityBadge';

type AffinityPanelProps = {
  familyLabel: string;
  selectedAffinity: PartAffinity;
  viewModel: AffinityViewModel;
  onSelect: (affinity: PartAffinity) => void;
  comparison?: ComparisonModel | null;
  previewedAffinity?: PartAffinity | null;
  onPreviewStart?: (affinity: PartAffinity) => void;
  onPreviewEnd?: (affinity: PartAffinity) => void;
};

export function AffinityPanel({
  familyLabel, selectedAffinity, viewModel, onSelect, comparison = null, previewedAffinity = null,
  onPreviewStart = () => undefined, onPreviewEnd = () => undefined,
}: AffinityPanelProps) {
  const labelByAffinity = new Map(viewModel.counts.map(entry => [entry.affinity, entry.label]));
  const resonanceLabel = viewModel.resonance.kind === 'none' ? '未形成共鸣' : viewModel.resonance.label;

  return (
    <section className="affinity-panel" data-testid="affinity-panel" aria-labelledby="affinity-panel-title">
      <div className="affinity-panel-heading">
        <div>
          <span className="affinity-panel-eyebrow">附加属性</span>
          <h3 id="affinity-panel-title">{familyLabel}</h3>
        </div>
        <AffinityBadge affinity={selectedAffinity} />
      </div>

      <div className="affinity-options" role="group" aria-label={`为${familyLabel}选择附加属性`}>
        {AFFINITIES.map(affinity => (
          <PreviewableButton
            type="button"
            key={affinity}
            data-testid={`affinity-option-${affinity}`}
            className={previewedAffinity === affinity ? 'previewing' : ''}
            aria-label={`将${familyLabel}设为${labelByAffinity.get(affinity)}属性`}
            aria-pressed={selectedAffinity === affinity}
            previewDisabled={selectedAffinity === affinity}
            onPreviewStart={() => onPreviewStart(affinity)}
            onPreviewEnd={() => onPreviewEnd(affinity)}
            onClick={() => onSelect(affinity)}
          >
            <AffinityBadge affinity={affinity} compact />
          </PreviewableButton>
        ))}
      </div>

      <AffinityComparison comparison={comparison} />

      <div className="affinity-summary">
        <div className="affinity-counts" aria-label="五层属性数量">
          {viewModel.counts.map(entry => (
            <span className={entry.count > 0 ? 'active' : ''} data-testid={`affinity-count-${entry.affinity}`} key={entry.affinity}>
              <AffinityBadge affinity={entry.affinity} compact />
              <strong>{entry.count}</strong>
            </span>
          ))}
        </div>

        <dl className="affinity-results">
          <div><dt>主属性</dt><dd data-testid="affinity-primary"><AffinityBadge affinity={viewModel.primary.affinity} /></dd></div>
          <div><dt>共鸣</dt><dd data-testid="affinity-resonance">{resonanceLabel}</dd></div>
          {viewModel.bonuses.length > 0 && <div><dt>加成</dt><dd data-testid="affinity-bonuses">{viewModel.bonuses.join(' · ')}</dd></div>}
          <div><dt>克制</dt><dd data-testid="affinity-strengths">{viewModel.strengths.map(entry => entry.label).join('、') || '无'}</dd></div>
          <div><dt>弱点</dt><dd data-testid="affinity-weaknesses">{viewModel.weaknesses.map(entry => entry.label).join('、') || '无'}</dd></div>
        </dl>
      </div>
    </section>
  );
}
