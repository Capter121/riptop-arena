import { Material, Mesh, Object3D, Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { nssModelPath, DEFAULT_NSS_MODEL_ROOT } from './modelPaths';

type LoadedModel = { scene: Object3D };
type ModelLoader = { loadAsync(url: string): Promise<LoadedModel> };

function disposeMaterial(material: Material, textures: Set<Texture>): void {
  for (const value of Object.values(material)) {
    if (value instanceof Texture && !textures.has(value)) {
      textures.add(value);
      value.dispose();
    }
  }
  material.dispose();
}

export class NssModelCache {
  private readonly models = new Map<string, Promise<Object3D>>();
  private readonly loader: ModelLoader;
  private readonly modelRoot: string;

  constructor(
    loader: ModelLoader = new GLTFLoader(),
    modelRoot = import.meta.env.VITE_NSS_MODEL_ROOT || DEFAULT_NSS_MODEL_ROOT,
  ) {
    this.loader = loader;
    this.modelRoot = modelRoot;
  }

  load(partId: string): Promise<Object3D> {
    const existing = this.models.get(partId);
    if (existing) return existing;
    const pending = this.loader.loadAsync(nssModelPath(partId, this.modelRoot)).then(gltf => gltf.scene);
    this.models.set(partId, pending);
    pending.catch(() => this.models.delete(partId));
    return pending;
  }

  async instantiate(partId: string): Promise<Object3D> {
    return (await this.load(partId)).clone(true);
  }

  async dispose(): Promise<void> {
    const sources = await Promise.allSettled(this.models.values());
    const geometries = new Set<unknown>();
    const materials = new Set<Material>();
    const textures = new Set<Texture>();
    for (const source of sources) {
      if (source.status !== 'fulfilled') continue;
      source.value.traverse(object => {
        if (!(object instanceof Mesh)) return;
        if (!geometries.has(object.geometry)) {
          geometries.add(object.geometry);
          object.geometry.dispose();
        }
        const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of meshMaterials) {
          if (!materials.has(material)) {
            materials.add(material);
            disposeMaterial(material, textures);
          }
        }
      });
    }
    this.models.clear();
  }
}
