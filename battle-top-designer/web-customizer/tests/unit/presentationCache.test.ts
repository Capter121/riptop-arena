import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { PresentationCache } from '../../src/performance/presentationCache';

function source(color: string) {
  const group = new Group();
  group.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color })));
  return group;
}

describe('presentation instance cache', () => {
  it('reuses one prepared instance for the same immutable source', () => {
    const cache = new PresentationCache();
    const input = source('red');
    const first = cache.get(input);
    const second = cache.get(input);
    expect(first.object).toBe(second.object);
    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(cache.size).toBe(1);
  });

  it('shares read-only geometry but never shares source or cross-part materials', () => {
    const cache = new PresentationCache();
    const firstSource = source('red');
    const secondSource = source('blue');
    const firstSourceMesh = firstSource.children[0] as Mesh;
    const first = cache.get(firstSource).object.children[0] as Mesh;
    const second = cache.get(secondSource).object.children[0] as Mesh;
    expect(first.geometry).toBe(firstSourceMesh.geometry);
    expect(first.material).not.toBe(firstSourceMesh.material);
    expect(first.material).not.toBe(second.material);
  });

  it('disposes cached presentation materials only when the scene cache is cleared', () => {
    const cache = new PresentationCache();
    const material = (cache.get(source('red')).object.children[0] as Mesh).material as MeshStandardMaterial;
    const dispose = vi.spyOn(material, 'dispose');
    cache.get(source('blue'));
    expect(dispose).not.toHaveBeenCalled();
    cache.clear();
    expect(dispose).toHaveBeenCalledOnce();
    expect(cache.size).toBe(0);
  });
});
