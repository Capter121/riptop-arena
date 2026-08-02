// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuildRuleViolation, BuildRulePresetId } from '../../../shared/nss/build-rules';
import { BuildRulesPanel } from '../../src/build/BuildRulesPanel';

describe('BuildRulesPanel', () => {
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
  const click = (selector: string) => act(() => container.querySelector<HTMLButtonElement>(selector)?.click());
  const props = (preset: BuildRulePresetId = 'FREE', violations: readonly BuildRuleViolation[] = []) => ({
    preset,
    elementAffinity: 'FIRE' as const,
    violations,
    weight: 2.03,
    affinityCount: 3,
    randomFailure: null,
    randomDisabled: false,
    onPresetChange: vi.fn(),
    onElementAffinityChange: vi.fn(),
    onRandom: vi.fn(),
  });

  it('offers exactly four fixed presets without arbitrary rule inputs', () => {
    const value = props();
    render(<BuildRulesPanel {...value} />);
    expect([...container.querySelectorAll('[data-testid^="rule-preset-"]')].map(node => node.textContent)).toEqual([
      '自由组装', '轻量竞技', '元素专精', '基础零件杯',
    ]);
    expect(container.querySelector('input')).toBeNull();
    click('[data-testid="rule-preset-LIGHTWEIGHT"]');
    expect(value.onPresetChange).toHaveBeenCalledWith('LIGHTWEIGHT');
  });

  it('shows all seven affinities only for element specialist', () => {
    const free = props();
    render(<BuildRulesPanel {...free} />);
    expect(container.querySelector('[data-testid="rule-affinities"]')).toBeNull();

    const specialist = props('ELEMENT_SPECIALIST');
    render(<BuildRulesPanel {...specialist} />);
    expect([...container.querySelectorAll('[data-testid^="rule-affinity-"]')].map(node => node.textContent)).toEqual([
      '风', '火', '水', '木', '土', '光', '暗',
    ]);
    click('[data-testid="rule-affinity-WOOD"]');
    expect(specialist.onElementAffinityChange).toHaveBeenCalledWith('WOOD');
  });

  it('renders legal summaries and dispatches the random action', () => {
    const value = props('LIGHTWEIGHT');
    render(<BuildRulesPanel {...value} />);
    expect(container.querySelector('[data-testid="rule-status"]')?.textContent).toContain('符合轻量竞技');
    expect(container.querySelector('[data-testid="rule-status"]')?.textContent).toContain('2.03 / 2.10');
    click('[data-testid="rule-random"]');
    expect(value.onRandom).toHaveBeenCalledOnce();
  });

  it('renders every violation and a local random failure', () => {
    const violations: readonly BuildRuleViolation[] = [
      { code: 'DISABLED_PART', partId: 'blade_iron_bastion', family: 'blade', displayName: 'Iron Bastion' },
      { code: 'DISABLED_PART', partId: 'assist_heavy', family: 'assist', displayName: 'Heavy Assist' },
    ];
    render(<BuildRulesPanel {...props('BASIC_PARTS_CUP', violations)} randomFailure="当前规则没有合法组合。" />);
    const status = container.querySelector('[data-testid="rule-status"]');
    expect(status?.textContent).toContain('Iron Bastion 在基础零件杯中不可用');
    expect(status?.textContent).toContain('Heavy Assist 在基础零件杯中不可用');
    expect(status?.textContent).toContain('当前规则没有合法组合');
  });

  it('explains weight and affinity violations with exact deficits', () => {
    render(<BuildRulesPanel {...props('LIGHTWEIGHT', [{ code: 'WEIGHT_LIMIT', actual: 2.18, maximum: 2.1, excess: 0.08 }])} />);
    expect(container.querySelector('[data-testid="rule-status"]')?.textContent).toContain('总重量 2.18');
    expect(container.querySelector('[data-testid="rule-status"]')?.textContent).toContain('超过上限 0.08');

    render(<BuildRulesPanel {...props('ELEMENT_SPECIALIST', [{ code: 'AFFINITY_MINIMUM', affinity: 'FIRE', actual: 2, minimum: 3, missing: 1 }])} />);
    expect(container.querySelector('[data-testid="rule-status"]')?.textContent).toContain('火属性 2 / 3');
    expect(container.querySelector('[data-testid="rule-status"]')?.textContent).toContain('还缺 1 件');
  });

  it('disables only the random action while the model is busy', () => {
    render(<BuildRulesPanel {...props()} randomDisabled />);
    expect(container.querySelector<HTMLButtonElement>('[data-testid="rule-random"]')?.disabled).toBe(true);
    expect([...container.querySelectorAll<HTMLButtonElement>('[data-testid^="rule-preset-"]')].every(button => !button.disabled)).toBe(true);
    expect(container.querySelector('[data-testid="enter-arena"]')).toBeNull();
  });
});
