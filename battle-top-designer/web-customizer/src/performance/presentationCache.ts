import { Mesh, type Object3D } from 'three';

export class PresentationCache {
  private readonly instances = new Map<Object3D, Object3D>();

  get size() { return this.instances.size; }

  get(source: Object3D): { object: Object3D; cacheHit: boolean; rootCloneDurationMs: number; materialPreparationDurationMs: number } {
    const existing = this.instances.get(source);
    if (existing) return { object: existing, cacheHit: true, rootCloneDurationMs: 0, materialPreparationDurationMs: 0 };
    const cloneStarted = performance.now();
    const object = source.clone(true);
    const materialStarted = performance.now();
    object.traverse(node => {
      if (!(node instanceof Mesh)) return;
      node.geometry = node.geometry;
      node.material = Array.isArray(node.material)
        ? node.material.map(material => material.clone())
        : node.material.clone();
    });
    this.instances.set(source, object);
    return { object, cacheHit: false, rootCloneDurationMs: materialStarted - cloneStarted, materialPreparationDurationMs: performance.now() - materialStarted };
  }

  clear() {
    for (const object of this.instances.values()) {
      object.traverse(node => {
        if (!(node instanceof Mesh)) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach(material => material.dispose());
      });
    }
    this.instances.clear();
  }
}
