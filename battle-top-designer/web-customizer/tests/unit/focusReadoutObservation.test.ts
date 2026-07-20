import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { observeBeforeSelection } from '../stage7/helpers/focusReadout';

function deferred<T = void>() {
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

describe('transient focus readout observation ordering', () => {
  it('observes a readout that appears immediately after the click starts', async () => {
    const order: string[] = [];
    let seen!: () => void;
    const visible = new Promise<void>(resolve => { seen = resolve; });
    await observeBeforeSelection({
      observe: () => { order.push('observe'); return visible; },
      select: async () => { order.push('click'); seen(); },
      verify: async () => { order.push('verify'); },
    });
    expect(order).toEqual(['observe', 'click', 'verify']);
  });

  it('captures a readout that disappears during the click action', async () => {
    let visible = false;
    let seen!: () => void;
    const observation = new Promise<void>(resolve => { seen = resolve; });
    await observeBeforeSelection({
      observe: () => observation,
      select: async () => { visible = true; seen(); visible = false; },
      verify: async () => undefined,
    });
    expect(visible).toBe(false);
  });

  it('keeps the observation armed through a controlled slow selection without wall-clock delay', async () => {
    const selectionMayFinish = deferred();
    const readoutVisible = deferred();
    const order: string[] = [];
    let settled = false;
    const readout = {
      waitFor: vi.fn(async ({ state }: { state: 'visible' }) => {
        order.push(`wait:${state}`);
        await readoutVisible.promise;
      }),
      assertText: vi.fn(async (text: string) => { order.push(`text:${text}`); }),
    };

    const lifecycle = observeBeforeSelection({
      observe: async () => {
        order.push('observe');
        await readout.waitFor({ state: 'visible' });
        await readout.assertText('Gear ready');
      },
      select: async () => {
        order.push('select');
        await selectionMayFinish.promise;
        order.push('selection-complete');
        readoutVisible.resolve();
      },
      verify: async () => { order.push('verify'); },
    });
    void lifecycle.then(() => { settled = true; });

    await Promise.resolve();
    expect(settled).toBe(false);
    expect(readout.waitFor).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['observe', 'wait:visible', 'select']);

    selectionMayFinish.resolve();
    await lifecycle;

    expect(order).toEqual([
      'observe', 'wait:visible', 'select', 'selection-complete', 'text:Gear ready', 'verify',
    ]);
    expect(readout.assertText).toHaveBeenCalledTimes(1);
  });

  it('fails after a controlled selection when the readout observation rejects', async () => {
    const observation = deferred();
    const selected = deferred();
    const lifecycle = observeBeforeSelection({
      observe: () => observation.promise,
      select: async () => { selected.resolve(); },
      verify: async () => undefined,
    });

    await selected.promise;
    observation.reject(new Error('readout missing'));
    await expect(lifecycle).rejects.toThrow('readout missing');
  });

  it('keeps visibility waiting sequentially before expected text verification without a fixed timeout', () => {
    const source = readFileSync(resolve('tests/stage7/helpers/focusReadout.ts'), 'utf8');
    const visible = source.indexOf("await readout.waitFor({ state: 'visible' });");
    const text = source.indexOf('await expect(readout).toHaveText(expectedText);');

    expect(visible).toBeGreaterThan(-1);
    expect(text).toBeGreaterThan(visible);
    expect(source).not.toMatch(/waitFor\(\{\s*state:\s*'visible',\s*timeout:/);
    expect(source).not.toContain('waitForTimeout');
  });

  it('fails when the readout never appears', async () => {
    await expect(observeBeforeSelection({
      observe: async () => { throw new Error('readout missing'); },
      select: async () => undefined,
      verify: async () => undefined,
    })).rejects.toThrow('readout missing');
  });

  it('fails when the observed readout text is wrong', async () => {
    await expect(observeBeforeSelection({
      observe: async () => { throw new Error('wrong readout text'); },
      select: async () => undefined,
      verify: async () => undefined,
    })).rejects.toThrow('wrong readout text');
  });

  it('fails when the model is ready but the readout was not observed', async () => {
    const verify = vi.fn(async () => undefined);
    await expect(observeBeforeSelection({
      observe: async () => { throw new Error('readout missing'); },
      select: async () => undefined,
      verify,
    })).rejects.toThrow('readout missing');
    expect(verify).not.toHaveBeenCalled();
  });

  it('fails when task progress increases without a readout observation', async () => {
    let progress = '1/4';
    await expect(observeBeforeSelection({
      observe: async () => { throw new Error('readout missing'); },
      select: async () => { progress = '2/4'; },
      verify: async () => undefined,
    })).rejects.toThrow('readout missing');
    expect(progress).toBe('2/4');
  });

  it('fails when the option click fails', async () => {
    await expect(observeBeforeSelection({
      observe: async () => undefined,
      select: async () => { throw new Error('click failed'); },
      verify: async () => undefined,
    })).rejects.toThrow('click failed');
  });

  it('clicks exactly once', async () => {
    const select = vi.fn(async () => undefined);
    await observeBeforeSelection({ observe: async () => undefined, select, verify: async () => undefined });
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('does not retry a failed observation', async () => {
    const observe = vi.fn(async () => { throw new Error('missing once'); });
    const select = vi.fn(async () => undefined);
    await expect(observeBeforeSelection({ observe, select, verify: async () => undefined })).rejects.toThrow('missing once');
    expect(observe).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('does not use fixed sleeps', async () => {
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    await observeBeforeSelection({
      observe: async () => undefined,
      select: async () => undefined,
      verify: async () => undefined,
    });
    expect(timeout).not.toHaveBeenCalled();
    timeout.mockRestore();
  });
});
