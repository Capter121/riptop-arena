// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BuildProfileResult } from '../../../shared/nss/build-profile';
import { BuildProfilePanel } from '../../src/build/BuildProfilePanel';

describe('BuildProfilePanel', () => {
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

  it('renders nothing without a valid derived profile', () => {
    render(<BuildProfilePanel profile={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows one primary, at most two secondary tendencies, and raw attribute reasons', () => {
    const profile: BuildProfileResult = {
      primary: 'ASSAULT',
      secondary: ['COUNTER', 'BALANCED'],
      reasons: [
        { kind: 'attribute', attribute: 'attack', value: 74 },
        { kind: 'attribute', attribute: 'balance', value: 56 },
        { kind: 'attribute', attribute: 'weight', value: 61 },
      ],
    };
    render(<BuildProfilePanel profile={profile} />);

    const panel = container.querySelector('[data-testid="build-profile-panel"]');
    expect(panel?.getAttribute('data-profile')).toBe('ASSAULT');
    expect(container.querySelector('[data-testid="build-profile-primary"]')?.textContent).toBe('强袭');
    expect([...container.querySelectorAll('[data-testid="build-profile-secondary"]')].map(item => item.textContent)).toEqual(['反击', '均衡']);
    expect(container.querySelector('[data-testid="build-profile-reasons"]')?.textContent).toContain('攻击 74');
    expect(container.querySelector('[data-testid="build-profile-reasons"]')?.textContent).toContain('平衡 56');
    expect(container.querySelector('[data-testid="build-profile-reasons"]')?.textContent).toContain('重量倾向 61');
    expect(panel?.textContent).toContain('仅作打法建议');
    expect(panel?.textContent).toContain('不提供额外加成');
    expect(panel?.querySelector('button')).toBeNull();
    expect(panel?.textContent).not.toContain('评分');
  });

  it('explains offense resonance with affinity, count, and existing bonus', () => {
    render(<BuildProfilePanel profile={{
      primary: 'BURST',
      secondary: [],
      reasons: [{ kind: 'offense-resonance', affinity: 'FIRE', count: 5, bonus: 0.15 }],
    }} />);

    expect(container.querySelector('[data-testid="build-profile-primary"]')?.textContent).toBe('爆裂');
    expect(container.querySelector('[data-testid="build-profile-reasons"]')?.textContent).toContain('5 件火属性');
    expect(container.querySelector('[data-testid="build-profile-reasons"]')?.textContent).toContain('元素进攻共鸣 +15%');
  });

  it('explains balanced harmony and the counter floor without formulas', () => {
    render(<BuildProfilePanel profile={{
      primary: 'BALANCED',
      secondary: [],
      reasons: [
        { kind: 'balance-spread', value: 8 },
        { kind: 'harmony', distribution: '2-2-1', defenseBonus: 0.05, stabilityBonus: 0.06 },
      ],
    }} />);
    expect(container.querySelector('[data-testid="build-profile-reasons"]')?.textContent).toContain('四项最大差值 8');
    expect(container.querySelector('[data-testid="build-profile-reasons"]')?.textContent).toContain('协调共鸣 2-2-1');
    expect(container.querySelector('[data-testid="build-profile-reasons"]')?.textContent).toContain('防御 +5%');
    expect(container.querySelector('[data-testid="build-profile-reasons"]')?.textContent).toContain('稳定性 +6%');

    render(<BuildProfilePanel profile={{
      primary: 'COUNTER',
      secondary: [],
      reasons: [
        { kind: 'counter-floor', attribute: 'defense', value: 64 },
        { kind: 'attribute', attribute: 'attack', value: 75 },
        { kind: 'attribute', attribute: 'balance', value: 72 },
      ],
    }} />);
    expect(container.querySelector('[data-testid="build-profile-reasons"]')?.textContent).toContain('最低项：防御 64');
    expect(container.textContent).not.toContain('× 0.55');
  });
});
