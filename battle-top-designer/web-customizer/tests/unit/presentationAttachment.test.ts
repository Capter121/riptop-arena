import { describe, expect, it, vi } from 'vitest';
import { Group, Object3D } from 'three';
import { replacePresentationAttachment } from '../../src/performance/presentationAttachment';

describe('replacePresentationAttachment', () => {
  it('keeps exactly the latest cached root without cloning or changing its transform', () => {
    const container = new Group();
    const first = new Object3D();
    const second = new Object3D();
    second.position.set(1, 2, 3);

    let attached = replacePresentationAttachment(container, null, first);
    attached = replacePresentationAttachment(container, attached, second);

    expect(attached).toBe(second);
    expect(container.children).toEqual([second]);
    expect(first.parent).toBeNull();
    expect(second.position.toArray()).toEqual([1, 2, 3]);
  });

  it('does not detach and reattach an unchanged root', () => {
    const container = new Group();
    const root = new Object3D();
    const remove = vi.spyOn(container, 'remove');
    const add = vi.spyOn(container, 'add');

    let attached = replacePresentationAttachment(container, null, root);
    attached = replacePresentationAttachment(container, attached, root);

    expect(attached).toBe(root);
    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
  });
});
