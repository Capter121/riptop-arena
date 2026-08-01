// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AffinityComparison } from '../../src/affinity/AffinityComparison';
import type { ComparisonModel } from '../../src/comparison/comparisonModel';

describe('AffinityComparison', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (children: ReactNode) => act(() => root.render(children));

  it('renders nothing without an active comparison', () => {
    render(<AffinityComparison comparison={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders signed part deltas with accessible live updates', () => {
    const comparison: ComparisonModel = {
      key: 'part:blade:blade_orbit_halo',
      kind: 'part',
      title: 'Storm Fang → Orbit Halo',
      items: [
        { key: 'defense', label: '防御', kind: 'delta', delta: 5 },
        { key: 'attack', label: '攻击', kind: 'delta', delta: -11 },
      ],
    };

    render(<AffinityComparison comparison={comparison} />);

    const rail = container.querySelector('[data-testid="part-comparison"]');
    expect(rail?.getAttribute('aria-live')).toBe('polite');
    expect(rail?.getAttribute('aria-atomic')).toBe('true');
    expect(rail?.textContent).toContain('Storm Fang → Orbit Halo');
    expect(rail?.textContent).toContain('+5');
    expect(rail?.textContent).toContain('−11');
    expect(container.querySelector('[data-direction="up"]')?.textContent).toContain('+5');
    expect(container.querySelector('[data-direction="down"]')?.textContent).toContain('−11');
  });

  it('renders affinity count and label transitions without relying on color', () => {
    const comparison: ComparisonModel = {
      key: 'affinity:blade:FIRE',
      kind: 'affinity',
      title: '风 → 火',
      items: [
        { key: 'count-FIRE', label: '火数量', kind: 'transition', before: '1', after: '2', direction: 'up' },
        { key: 'primary', label: '主属性', kind: 'transition', before: '光', after: '火', direction: 'change' },
      ],
    };

    render(<AffinityComparison comparison={comparison} />);

    const rail = container.querySelector('[data-testid="affinity-comparison"]');
    expect(rail?.textContent).toContain('1 → 2');
    expect(rail?.textContent).toContain('光 → 火');
    expect(container.querySelector('[data-direction="up"]')?.getAttribute('aria-label')).toContain('提高');
    expect(container.querySelector('[data-direction="change"]')?.getAttribute('aria-label')).toContain('变更');
  });
});
