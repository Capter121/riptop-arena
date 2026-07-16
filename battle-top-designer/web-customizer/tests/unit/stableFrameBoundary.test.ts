import { describe, expect, it, vi } from 'vitest';
import { StableFrameBoundary } from '../../src/performance/stableFrameBoundary';

describe('stable render-frame boundary', () => {
  it('completes after the renderer finishes the same frame without waiting for another RAF', () => {
    const firstFrame = vi.fn();
    const stableFrame = vi.fn();
    const boundary = new StableFrameBoundary(firstFrame, stableFrame);
    boundary.beforeRender('nss-p2c-0002', 'nss-p2c-0002');
    expect(firstFrame).toHaveBeenCalledWith('nss-p2c-0002');
    expect(stableFrame).not.toHaveBeenCalled();
    boundary.afterRender('nss-p2c-0002');
    expect(stableFrame).toHaveBeenCalledWith('nss-p2c-0002');
  });

  it('rejects stale or mismatched combinations across interrupted switches', () => {
    const stableFrame = vi.fn();
    const boundary = new StableFrameBoundary(vi.fn(), stableFrame);
    boundary.beforeRender('new', 'old');
    boundary.afterRender('old');
    expect(stableFrame).not.toHaveBeenCalled();
    boundary.beforeRender('new', 'new');
    boundary.afterRender('old');
    expect(stableFrame).not.toHaveBeenCalled();
    boundary.afterRender('new');
    expect(stableFrame).toHaveBeenCalledOnce();
  });
});
