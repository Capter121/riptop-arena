import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const models = {
  blade_storm_fang: '../public/models/parts/blade_storm_fang.glb',
  blade_iron_bastion: '../public/models/parts/blade_iron_bastion.glb',
  blade_orbit_halo: '../public/models/parts/blade_orbit_halo.glb',
  blade_dual_comet: '../public/models/parts/blade_dual_comet.glb',
  core_solar_wolf: '../public/models/parts/core_solar_wolf.glb',
  core_void_falcon: '../public/models/parts/core_void_falcon.glb',
  assist_heavy: '../public/models/parts/assist_heavy.glb',
  assist_guard: '../public/models/parts/assist_guard.glb',
  assist_air: '../public/models/parts/assist_air.glb',
  gear_low: '../public/models/parts/gear_low.glb',
  gear_medium: '../public/models/parts/gear_medium.glb',
  gear_high: '../public/models/parts/gear_high.glb',
  tip_flat_attack: '../public/models/parts/tip_flat_attack.glb',
  tip_ball_defense: '../public/models/parts/tip_ball_defense.glb',
  tip_needle_stamina: '../public/models/parts/tip_needle_stamina.glb',
  tip_taper_balance: '../public/models/parts/tip_taper_balance.glb',
  assembly_phase2b_attack_representative: '../public/models/assemblies/assembly_phase2b_attack_representative.glb',
  assembly_phase2b_defense_representative: '../public/models/assemblies/assembly_phase2b_defense_representative.glb',
  assembly_phase2b_stamina_representative: '../public/models/assemblies/assembly_phase2b_stamina_representative.glb',
  assembly_phase2b_balance_representative: '../public/models/assemblies/assembly_phase2b_balance_representative.glb',
  assembly_phase2b_r1_assist_heavy: '../public/models/assemblies/assembly_storm_attack.glb',
  assembly_phase2b_r1_assist_guard: '../public/models/assemblies/assembly_phase2b_assist_guard.glb',
  assembly_phase2b_r1_assist_air: '../public/models/assemblies/assembly_phase2b_assist_air.glb',
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
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(0.08, -0.1, 0.12); scene.add(key);
const fill = new THREE.DirectionalLight(0xbfd7ff, 1.1); fill.position.set(-0.08, 0.06, 0.08); scene.add(fill);
const loader = new GLTFLoader();
let currentModel = null;
let focusState = null;
let highlightTimer = null;
let lastRestoreError = 0;

function partMeshes(prefix) {
  const meshes = [];
  currentModel?.traverse(object => {
    const partId = object.userData?.part_id || object.name;
    if (object.isMesh && String(partId).includes(prefix)) meshes.push(object);
  });
  return meshes;
}

function snapshot() {
  const materials = new Set();
  let meshCount = 0;
  let transparentMaterialCount = 0;
  let missingNormalMeshes = 0;
  currentModel?.traverse(object => {
    if (!object.isMesh) return;
    meshCount += 1;
    if (!object.geometry.attributes.normal) missingNormalMeshes += 1;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material || materials.has(material.uuid)) continue;
      materials.add(material.uuid);
      if (material.transparent || material.opacity < 1) transparentMaterialCount += 1;
    }
  });
  return {
    modelId: modelId.textContent,
    status: status.dataset.state,
    canvas: { width: renderer.domElement.width, height: renderer.domElement.height },
    camera: camera.position.toArray(),
    target: controls.target.toArray(),
    distance: camera.position.distanceTo(controls.target),
    diagnostics: {
      meshCount,
      materialCount: materials.size,
      transparentMaterialCount,
      missingNormalMeshes,
      drawCalls: renderer.info.render.calls,
    },
    focus: focusState ? {
      state: focusState.active ? 'focused' : 'assembled',
      assistOffsetMm: focusState.assistMeshes.map((mesh, index) => (mesh.position.y - focusState.assistPositions[index].y) * 1000),
      bladeOpacity: focusState.bladeMeshes.flatMap(mesh => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(material => material.opacity)),
      bladeDepthWrite: focusState.bladeMeshes.flatMap(mesh => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(material => material.depthWrite)),
      highlightActive: focusState.highlightActive,
      lastRestoreError,
    } : null,
    axesHelperCount: scene.children.filter(object => object.type === 'AxesHelper').length,
  };
}

function resetCamera() {
  camera.position.copy(resetPosition);
  controls.target.set(0, 0, 0);
  controls.update();
}

function restoreAssembly() {
  if (!focusState) return;
  if (highlightTimer) clearTimeout(highlightTimer);
  focusState.assistMeshes.forEach((mesh, index) => {
    mesh.position.copy(focusState.assistPositions[index]);
    mesh.material = focusState.assistMaterials[index];
  });
  focusState.bladeMeshes.forEach((mesh, index) => { mesh.material = focusState.bladeMaterials[index]; });
  lastRestoreError = Math.max(0, ...focusState.assistMeshes.map((mesh, index) => mesh.position.distanceTo(focusState.assistPositions[index])));
  focusState.active = false;
  focusState.highlightActive = false;
  resetCamera();
}

function focusAssist() {
  if (focusState?.active) restoreAssembly();
  const assistMeshes = partMeshes('assist_');
  const bladeMeshes = partMeshes('blade_');
  if (!assistMeshes.length || !bladeMeshes.length) throw new Error('Assist focus requires an assembled fixture');
  focusState = {
    active: true,
    highlightActive: true,
    assistMeshes,
    bladeMeshes,
    assistPositions: assistMeshes.map(mesh => mesh.position.clone()),
    assistMaterials: assistMeshes.map(mesh => mesh.material),
    bladeMaterials: bladeMeshes.map(mesh => mesh.material),
  };
  assistMeshes.forEach(mesh => {
    mesh.position.y += 0.006;
    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const focused = source.map(material => {
      const clone = material.clone();
      clone.emissive?.set(0xffa62b);
      clone.emissiveIntensity = 1.3;
      return clone;
    });
    mesh.material = Array.isArray(mesh.material) ? focused : focused[0];
  });
  bladeMeshes.forEach(mesh => {
    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const faded = source.map(material => {
      const clone = material.clone();
      clone.transparent = true;
      clone.opacity = 0.22;
      clone.depthWrite = false;
      return clone;
    });
    mesh.material = Array.isArray(mesh.material) ? faded : faded[0];
  });
  camera.position.set(0.085, 0.085, 0.07);
  controls.target.set(0, 0, 0);
  controls.update();
  highlightTimer = setTimeout(() => {
    assistMeshes.forEach(mesh => {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        material.emissive?.set(0x000000);
        material.emissiveIntensity = 0;
      }
    });
    focusState.highlightActive = false;
  }, 800);
}

async function loadModel(id) {
  status.textContent = 'Loading'; status.dataset.state = 'loading';
  if (highlightTimer) clearTimeout(highlightTimer);
  focusState = null;
  if (currentModel) scene.remove(currentModel);
  const gltf = await loader.loadAsync(models[id]);
  currentModel = gltf.scene;
  const center = new THREE.Box3().setFromObject(currentModel).getCenter(new THREE.Vector3());
  currentModel.position.sub(center);
  scene.add(currentModel);
  modelId.textContent = id;
  status.textContent = 'Ready'; status.dataset.state = 'ready';
  if (id.startsWith('assembly_phase2b_r1_assist_')) focusAssist();
}

select.addEventListener('change', () => loadModel(select.value).catch(showError));
document.querySelector('#reset-camera').addEventListener('click', resetCamera);
document.querySelector('#focus-assist').addEventListener('click', () => { try { focusAssist(); } catch (error) { showError(error); } });
document.querySelector('#restore-assembly').addEventListener('click', restoreAssembly);
function showError(error) { status.textContent = error.message; status.dataset.state = 'error'; console.error(error); }
window.__NSS_PREVIEW__ = { snapshot, resetCamera, loadModel, focusAssist, restoreAssembly };
await loadModel(select.value).catch(showError);
window.addEventListener('resize', () => {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
});
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
