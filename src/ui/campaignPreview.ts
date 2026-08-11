import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { CampaignLoadout } from '../data/campaign/opponents';
import { createNssBattleTopVisual, destroyNssBattleTopVisual } from '../nss/battleTopVisual';
import { NssModelCache } from '../nss/modelCache';

export function mountCampaignPreview(container: HTMLElement, loadout: CampaignLoadout): () => void {
  const cache = new NssModelCache();
  const scene = new Scene();
  const camera = new PerspectiveCamera(34, 1, 0.1, 2_000);
  let renderer: WebGLRenderer | null = null;
  let frame = 0;
  let cancelled = false;
  let assembly: Awaited<ReturnType<typeof createNssBattleTopVisual>> | null = null;
  let observer: ResizeObserver | null = null;

  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setClearColor(new Color(0x000000), 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    container.replaceChildren(renderer.domElement);
  } catch {
    container.textContent = '当前设备无法显示 3D 预览';
    void cache.dispose();
    return () => {};
  }

  scene.add(new AmbientLight(0xb8dfff, 2.2));
  const key = new DirectionalLight(0xffffff, 4.4);
  key.position.set(3, 5, 4);
  scene.add(key);
  const rim = new DirectionalLight(0x7ef0ff, 3.2);
  rim.position.set(-4, 2, -3);
  scene.add(rim);

  const resize = () => {
    if (!renderer) return;
    const width = Math.max(1, container.clientWidth || 320);
    const height = Math.max(1, container.clientHeight || 240);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(resize);
    observer.observe(container);
  }

  const battleLoadout = {
    schemaVersion: 2 as const,
    interfaceId: 'NSS-V1' as const,
    combination: { ...loadout.combination },
    affinities: { ...loadout.affinities },
  };
  void createNssBattleTopVisual(cache, battleLoadout).then(created => {
    if (cancelled) {
      destroyNssBattleTopVisual(created);
      return;
    }
    assembly = created;
    scene.add(created.root);
    created.root.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(created.root);
    const center = bounds.getCenter(new Vector3());
    const size = Math.max(bounds.getSize(new Vector3()).length(), 1);
    created.root.position.sub(center);
    camera.position.set(size * 0.72, size * 0.52, size * 0.92);
    camera.near = Math.max(0.1, size / 100);
    camera.far = size * 10;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const render = () => {
      if (cancelled || !renderer || !assembly) return;
      if (!reducedMotion) assembly.root.rotation.y += 0.006;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();
  }).catch(() => {
    if (!cancelled) container.textContent = '陀螺模型加载失败';
  });

  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    if (assembly) destroyNssBattleTopVisual(assembly);
    renderer?.dispose();
    renderer?.domElement.remove();
    renderer = null;
    void cache.dispose();
  };
}
