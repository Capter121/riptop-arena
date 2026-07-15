import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const models = {
  blade_storm_fang: '../public/models/parts/blade_storm_fang.glb',
  blade_iron_bastion: '../public/models/parts/blade_iron_bastion.glb',
  blade_orbit_halo: '../public/models/parts/blade_orbit_halo.glb',
  blade_dual_comet: '../public/models/parts/blade_dual_comet.glb',
  core_void_falcon: '../public/models/parts/core_void_falcon.glb',
  assist_guard: '../public/models/parts/assist_guard.glb',
  assist_air: '../public/models/parts/assist_air.glb',
  gear_medium: '../public/models/parts/gear_medium.glb',
  gear_high: '../public/models/parts/gear_high.glb',
};
const viewport = document.querySelector('#viewport');
const select = document.querySelector('#model-select');
const status = document.querySelector('#load-status');
const modelId = document.querySelector('#model-id');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setSize(viewport.clientWidth, viewport.clientHeight, false);
viewport.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1420);
const camera = new THREE.PerspectiveCamera(35, viewport.clientWidth / viewport.clientHeight, 0.001, 10);
const resetPosition = new THREE.Vector3(0.09, -0.09, 0.075);
camera.position.copy(resetPosition);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false;
controls.target.set(0, 0, 0);
controls.saveState();
scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x172033, 2.2));
const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(0.08, -0.1, 0.12); scene.add(key);
scene.add(new THREE.AxesHelper(0.045));
const loader = new GLTFLoader();
let currentModel = null;

function snapshot() {
  return {
    modelId: modelId.textContent,
    status: status.dataset.state,
    canvas: { width: renderer.domElement.width, height: renderer.domElement.height },
    camera: camera.position.toArray(),
    target: controls.target.toArray(),
    distance: camera.position.distanceTo(controls.target),
  };
}

function resetCamera() {
  camera.position.copy(resetPosition);
  controls.target.set(0, 0, 0);
  controls.update();
}

async function loadModel(id) {
  status.textContent = 'Loading'; status.dataset.state = 'loading';
  if (currentModel) scene.remove(currentModel);
  const gltf = await loader.loadAsync(models[id]);
  currentModel = gltf.scene;
  const center = new THREE.Box3().setFromObject(currentModel).getCenter(new THREE.Vector3());
  currentModel.position.sub(center);
  scene.add(currentModel);
  modelId.textContent = id;
  status.textContent = 'Ready'; status.dataset.state = 'ready';
}

select.addEventListener('change', () => loadModel(select.value).catch(showError));
document.querySelector('#reset-camera').addEventListener('click', resetCamera);
function showError(error) { status.textContent = error.message; status.dataset.state = 'error'; console.error(error); }
window.__NSS_PREVIEW__ = { snapshot, resetCamera, loadModel };
await loadModel(select.value).catch(showError);
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
