// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAffinityProfile, type PartAffinity } from '../../../shared/nss/affinity';
import { AffinityBadge } from '../../src/affinity/AffinityBadge';
import { AffinityPanel } from '../../src/affinity/AffinityPanel';
import { createAffinityViewModel, type AffinityViewModel } from '../../src/affinity/affinityViewModel';

const affinities: PartAffinity[] = ['WIND', 'FIRE', 'WATER', 'WOOD', 'EARTH', 'LIGHT', 'DARK'];

describe('affinity customizer components', () => {
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

  it('shows an icon, Chinese name, and stable affinity hook for every affinity', () => {
    render(<>{affinities.map(affinity => <AffinityBadge key={affinity} affinity={affinity} />)}</>);

    const badges = [...container.querySelectorAll<HTMLElement>('[data-affinity]')];
    expect(badges).toHaveLength(7);
    expect(badges.map(badge => badge.dataset.affinity)).toEqual(affinities);
    expect(badges.map(badge => badge.textContent)).toEqual(['≋风', '◆火', '●水', '✦木', '⬢土', '☀光', '☾暗']);
    expect(badges.every(badge => badge.querySelector('[aria-hidden="true"]'))).toBe(true);
    expect(badges.map(badge => badge.getAttribute('aria-label'))).toEqual([
      '风属性', '火属性', '水属性', '木属性', '土属性', '光属性', '暗属性',
    ]);
  });

  it('selects one affinity and explains offense resonance and matchups', () => {
    const onSelect = vi.fn();
    const viewModel = createAffinityViewModel(resolveAffinityProfile({
      core: 'FIRE', blade: 'FIRE', assist: 'FIRE', gear: 'FIRE', tip: 'WATER',
    }));
    render(<AffinityPanel familyLabel="主刀" selectedAffinity="FIRE" viewModel={viewModel} onSelect={onSelect} />);

    const buttons = [...container.querySelectorAll<HTMLButtonElement>('[data-testid^="affinity-option-"]')];
    expect(buttons).toHaveLength(7);
    expect(buttons.filter(button => button.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    expect(container.querySelector('[data-testid="affinity-option-FIRE"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-testid="affinity-count-FIRE"]')?.textContent).toContain('4');
    expect(container.querySelector('[data-testid="affinity-primary"]')?.textContent).toContain('火');
    expect(container.querySelector('[data-testid="affinity-resonance"]')?.textContent).toContain('纯属性进攻共鸣（4件）');
    expect(container.querySelector('[data-testid="affinity-bonuses"]')?.textContent).toContain('元素进攻 +10%');
    expect(container.querySelector('[data-testid="affinity-strengths"]')?.textContent).toContain('木');
    expect(container.querySelector('[data-testid="affinity-weaknesses"]')?.textContent).toContain('水');

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="affinity-option-WATER"]')!.click());
    expect(onSelect).toHaveBeenCalledWith('WATER');
  });

  it('shows harmony bonuses and a clear empty resonance state', () => {
    const harmony = createAffinityViewModel(resolveAffinityProfile({
      core: 'LIGHT', blade: 'WIND', assist: 'FIRE', gear: 'WATER', tip: 'EARTH',
    }));
    const noResonance: AffinityViewModel = {
      ...harmony,
      resonance: { kind: 'none', label: '无共鸣' },
      bonuses: [],
    };

    render(<AffinityPanel familyLabel="核心" selectedAffinity="LIGHT" viewModel={harmony} onSelect={() => undefined} />);
    expect(container.querySelector('[data-testid="affinity-resonance"]')?.textContent).toContain('协调共鸣（1-1-1-1-1）');
    expect(container.querySelector('[data-testid="affinity-bonuses"]')?.textContent).toContain('防御 +9%');
    expect(container.querySelector('[data-testid="affinity-bonuses"]')?.textContent).toContain('稳定性 +10%');

    render(<AffinityPanel familyLabel="核心" selectedAffinity="LIGHT" viewModel={noResonance} onSelect={() => undefined} />);
    expect(container.querySelector('[data-testid="affinity-resonance"]')?.textContent).toContain('未形成共鸣');
    expect(container.querySelector('[data-testid="affinity-bonuses"]')).toBeNull();
  });
});
