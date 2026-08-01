import type { ComparisonItem, ComparisonModel } from '../comparison/comparisonModel';

function comparisonValue(item: ComparisonItem) {
  if (item.kind === 'transition') return `${item.before} → ${item.after}`;
  if (item.delta > 0) return `+${item.delta}`;
  return `−${Math.abs(item.delta)}`;
}

function comparisonDirection(item: ComparisonItem) {
  if (item.kind === 'transition') return item.direction;
  return item.delta > 0 ? 'up' : 'down';
}

function directionLabel(direction: 'up' | 'down' | 'change') {
  if (direction === 'up') return '提高';
  if (direction === 'down') return '降低';
  return '变更';
}

export function AffinityComparison({ comparison }: { comparison: ComparisonModel | null }) {
  if (!comparison) return null;

  return (
    <aside
      className={`comparison-rail comparison-rail-${comparison.kind}`}
      data-testid={`${comparison.kind}-comparison`}
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="comparison-heading">
        <span>临时预览</span>
        <strong>{comparison.title}</strong>
      </div>
      <div className="comparison-items">
        {comparison.items.map(item => {
          const direction = comparisonDirection(item);
          return (
            <span
              className="comparison-item"
              data-direction={direction}
              aria-label={`${item.label}${directionLabel(direction)}：${comparisonValue(item)}`}
              key={item.key}
            >
              <span>{item.label}</span>
              <strong>{comparisonValue(item)}</strong>
            </span>
          );
        })}
      </div>
    </aside>
  );
}
