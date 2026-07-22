import { OrbitControls, useProgress } from '@react-three/drei';
import { addAfterEffect, Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { ACESFilmicToneMapping, Color, Group, Matrix4, Mesh, Object3D, PerspectiveCamera, PMREMGenerator, SRGBColorSpace, TextureLoader, Vector3, WebGLRenderTarget } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assembleMatrices } from './assembly';
import { registerSceneCapture, sceneDiagnostics, updateCamera, updatePermanentMatrices, updateWebglResources } from './diagnostics';
import { endPartSwitch, isPartSwitchPending, markOnce, pendingPartSwitchCombinationId } from './performance/marks';
import {
  activeCachedSwitchCombination, completeCachedSwitch, markCachedSwitch, markPartPrepared,
  setCachedSwitchResourceProvider,
} from './performance/cachedSwitchDiagnostics';
import { PresentationCache } from './performance/presentationCache';
import { replacePresentationAttachment } from './performance/presentationAttachment';
import { StableFrameBoundary } from './performance/stableFrameBoundary';
import { combinationId, families, presentationOffsets, type Combination, type Family } from './domain';
import { recordFocusDiagnostic } from './focusDiagnostics';
import { FocusExitFrameGate } from './focusLifecycle';
import { useCustomizer } from './store';
import { resolveStudioQuality } from './rendering/qualityPolicy';
import { shouldRenderSolarWolfBadge, solarWolfBadgePolicy } from './rendering/solarWolfBadge';
import solarWolfBadgeUrl from '../../design/visual-identity/solar-wolf-concept.svg?url';

const cameraPositions = {
  top: new Vector3(0, 0.16, 0.001),
  perspective: new Vector3(0.105, 0.085, 0.105),
  side: new Vector3(0.16, -0.012, 0.001),
  bottom: new Vector3(0.075, -0.12, 0.075),
};
const target = new Vector3(0, -0.012, 0);
const presentationCache = new PresentationCache();
markOnce('phase3b:scene-runtime-loaded');

function ProgressSignal() {
  const progress = useProgress(state => state.progress);
  useEffect(() => useCustomizer.getState().setLoadProgress(Math.max(15, progress)), [progress]);
  return null;
}

function StudioEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const previousEnvironment = scene.environment;
    const pmremGenerator = new PMREMGenerator(gl);
    const roomEnvironment = new RoomEnvironment();
    const environmentTarget = pmremGenerator.fromScene(roomEnvironment);
    scene.environment = environmentTarget.texture;
    return () => {
      if (scene.environment === environmentTarget.texture) scene.environment = previousEnvironment;
      environmentTarget.dispose();
      roomEnvironment.dispose();
      pmremGenerator.dispose();
    };
  }, [gl, scene]);
  return null;
}

function StudioEnvironmentIntensity({ intensity }: { intensity: number }) {
  const { scene } = useThree();
  useEffect(() => {
    const previousIntensity = scene.environmentIntensity;
    scene.environmentIntensity = intensity;
    return () => { scene.environmentIntensity = previousIntensity; };
  }, [intensity, scene]);
  return null;
}

function CaptureBridge() {
  const { camera, gl, scene } = useThree();
  useEffect(() => {
    registerSceneCapture(async (width, height) => {
      const target = new WebGLRenderTarget(width, height, { depthBuffer: true });
      const previousTarget = gl.getRenderTarget();
      const perspective = camera instanceof PerspectiveCamera ? camera : null;
      const previousAspect = perspective?.aspect;
      try {
        if (perspective) {
          perspective.aspect = width / height;
          perspective.updateProjectionMatrix();
        }
        gl.setRenderTarget(target);
        gl.render(scene, camera);
        const pixels = new Uint8Array(width * height * 4);
        gl.readRenderTargetPixels(target, 0, 0, width, height, pixels);
        return { width, height, pixels };
      } finally {
        gl.setRenderTarget(previousTarget);
        if (perspective && previousAspect !== undefined) {
          perspective.aspect = previousAspect;
          perspective.updateProjectionMatrix();
        }
        target.dispose();
      }
    });
    return () => registerSceneCapture(null);
  }, [camera, gl, scene]);
  return null;
}

function CameraRig() {
  const preset = useCustomizer(state => state.cameraPreset);
  const controls = useRef<any>(null);
  const { camera, gl } = useThree();
  useEffect(() => {
    camera.position.copy(cameraPositions[preset]);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    if (controls.current) {
      controls.current.target.copy(target);
      controls.current.update();
    }
  }, [camera, preset]);
  useFrame(() => {
    updateCamera(camera.position.toArray(), camera.position.distanceTo(target));
    updateWebglResources(gl.info.memory.geometries, gl.info.memory.textures, gl.info.programs?.length ?? 0);
  });
  return <OrbitControls ref={controls} makeDefault enablePan={false} minDistance={0.065} maxDistance={0.34} />;
}

function cloneForInstance(source: Object3D): Object3D {
  markCachedSwitch('cached-switch:clone-start');
  const prepared = presentationCache.get(source);
  markCachedSwitch('cached-switch:clone-complete', {
    rootCloneDurationMs: prepared.rootCloneDurationMs,
    materialPreparationDurationMs: prepared.materialPreparationDurationMs,
  });
  return prepared.object;
}

function setBladeFade(scene: Object3D, faded: boolean) {
  scene.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material.userData.originalOpacity === undefined) {
        material.userData.originalOpacity = material.opacity;
        material.userData.originalTransparent = material.transparent;
        material.userData.originalDepthWrite = material.depthWrite;
      }
      material.transparent = faded ? true : Boolean(material.userData.originalTransparent);
      material.opacity = faded ? 0.24 : Number(material.userData.originalOpacity ?? material.opacity);
      material.depthWrite = faded ? false : Boolean(material.userData.originalDepthWrite);
      material.needsUpdate = true;
    }
  });
}

function SolarWolfBadge() {
  const texture = useLoader(TextureLoader, solarWolfBadgeUrl);
  useEffect(() => {
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
  }, [texture]);
  return (
    <mesh position={[0, solarWolfBadgePolicy.topOffsetM, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <circleGeometry args={[solarWolfBadgePolicy.radiusM, 64]} />
      <meshBasicMaterial map={texture} transparent alphaTest={0.02} depthWrite={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} toneMapped={false} />
    </mesh>
  );
}

function PresentationPart({ family, scene, permanent, offset, assistFocus, solarWolfBadge }: {
  family: Family;
  scene: Object3D;
  permanent: Matrix4;
  offset: number;
  assistFocus: boolean;
  solarWolfBadge: boolean;
}) {
  const group = useRef<Group>(null);
  const contentGroup = useRef<Group>(null);
  const attachedContent = useRef<Object3D | null>(null);
  const completedExit = useRef<number | null>(null);
  const recordedFocus = useRef<string | null>(null);
  const sceneReadSequence = useRef(0);
  const exitFrameGate = useRef(new FocusExitFrameGate());
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const focusState = useCustomizer(state => state.focusState);
  const lowPerformance = useCustomizer(state => state.lowPerformance);
  const { camera } = useThree();
  const content = useMemo(() => cloneForInstance(scene), [scene]);
  useLayoutEffect(() => {
    if (!contentGroup.current) return;
    attachedContent.current = replacePresentationAttachment(contentGroup.current, attachedContent.current, content);
  }, [content]);
  useEffect(() => { if (family === 'blade') setBladeFade(content, assistFocus); }, [assistFocus, content, family]);
  useEffect(() => addAfterEffect(() => {
    const current = useCustomizer.getState();
    const focus = current.focusState;
    if (focus.target !== family || focus.phase !== 'active' || !group.current) return;
    const viewReady = focus.modelReady
      && focus.readoutCommitted
      && Math.abs(group.current.position.y - offsetRef.current) < 0.0001
      && camera.position.distanceTo(cameraPositions[current.cameraPreset]) < 0.0001;
    if (viewReady && !focus.activeFramePainted) {
      recordFocusDiagnostic({
        type: 'scene-focus-active-frame-painted',
        sessionId: focus.sessionId,
        target: focus.target,
        phase: focus.phase,
        details: { revision: focus.revision, family, partId: focus.partId, cameraPreset: current.cameraPreset },
      });
      current.markFocusActiveFramePainted(focus.sessionId);
    }
  }), [camera, family]);
  useFrame((_, delta) => {
    if (!group.current) return;
    const reducedMotion = lowPerformance || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const beforeY = group.current.position.y;
    const interpolation = reducedMotion ? 1 : Math.min(1, delta * 7);
    if (reducedMotion) group.current.position.y = offset;
    else group.current.position.y += (offset - group.current.position.y) * interpolation;
    const focusKey = `${focusState.sessionId}:${focusState.revision}`;
    if (family === focusState.target && recordedFocus.current !== focusKey) {
      recordedFocus.current = focusKey;
      sceneReadSequence.current += 1;
      recordFocusDiagnostic({
        type: 'scene-focus-frame',
        sessionId: focusState.sessionId,
        target: focusState.target,
        phase: focusState.phase,
        details: { family, revision: focusState.revision, sceneReadSequence: sceneReadSequence.current, partId: focusState.partId, delta, interpolation, beforeY, afterY: group.current.position.y, targetY: offset, reducedMotion },
      });
    }
    if (family !== focusState.target || focusState.phase !== 'exiting') {
      exitFrameGate.current.reset();
      return;
    }
    const atTarget = Math.abs(group.current.position.y - offset) < 0.0001;
    if (exitFrameGate.current.observe(focusState.sessionId, atTarget) && completedExit.current !== focusState.sessionId) {
      completedExit.current = focusState.sessionId;
      recordFocusDiagnostic({
        type: 'scene-complete-exit',
        sessionId: focusState.sessionId,
        target: focusState.target,
        phase: focusState.phase,
        details: { family, revision: focusState.revision, sceneReadSequence: sceneReadSequence.current, partId: focusState.partId, delta, interpolation, beforeY, afterY: group.current.position.y, targetY: offset, reducedMotion },
      });
      useCustomizer.getState().completeFocusExit(focusState.sessionId);
    }
  });
  return (
    <group matrix={permanent} matrixAutoUpdate={false}>
      <group ref={group}>
        <group ref={contentGroup} />
        {family === 'assist' && assistFocus && (
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.0345, 0.0008, 8, 72]} />
            <meshBasicMaterial color="#ffcc42" transparent opacity={0.92} depthTest={false} />
          </mesh>
        )}
        {family === 'core' && solarWolfBadge && <SolarWolfBadge />}
      </group>
    </group>
  );
}

function Assembly({ combination, onReady }: { combination: Combination; onReady: () => void }) {
  const displayedCombinationId = combinationId(combination);
  const displayedCombinationIdRef = useRef(displayedCombinationId);
  displayedCombinationIdRef.current = displayedCombinationId;
  const mountCalculationDuration = useRef(0);
  const stableFrameBoundary = useMemo(() => new StableFrameBoundary(
    () => markCachedSwitch('cached-switch:first-frame'),
    combinationIdAtRender => {
      markCachedSwitch('cached-switch:stable-frame');
      completeCachedSwitch(combinationIdAtRender);
      endPartSwitch();
    },
  ), []);
  const focusState = useCustomizer(state => state.focusState);
  const exploded = useCustomizer(state => state.exploded);
  const debugAxis = useCustomizer(state => state.debugAxis);
  const lowPerformance = useCustomizer(state => state.lowPerformance);
  const solarWolfBadgeEnabled = useCustomizer(state => state.solarWolfBadgeEnabled);
  const coreGltf = useLoader(GLTFLoader, `${import.meta.env.BASE_URL}${combination.core}.glb`);
  const bladeGltf = useLoader(GLTFLoader, `${import.meta.env.BASE_URL}${combination.blade}.glb`);
  const assistGltf = useLoader(GLTFLoader, `${import.meta.env.BASE_URL}${combination.assist}.glb`);
  const gearGltf = useLoader(GLTFLoader, `${import.meta.env.BASE_URL}${combination.gear}.glb`);
  const tipGltf = useLoader(GLTFLoader, `${import.meta.env.BASE_URL}${combination.tip}.glb`);
  markCachedSwitch('cached-switch:cache-hit');
  const scenes = useMemo(() => ({
    core: coreGltf.scene,
    blade: bladeGltf.scene,
    assist: assistGltf.scene,
    gear: gearGltf.scene,
    tip: tipGltf.scene,
  }), [assistGltf, bladeGltf, coreGltf, gearGltf, tipGltf]);
  const matrices = useMemo(() => {
    const started = performance.now();
    const result = assembleMatrices(scenes, combination);
    mountCalculationDuration.current = performance.now() - started;
    return result;
  }, [combination, scenes]);
  const offsets = presentationOffsets(exploded, focusState.phase === 'exiting' ? null : focusState.target);
  const rotating = useRef<Group>(null);
  useLayoutEffect(() => {
    updatePermanentMatrices(Object.fromEntries(families.map(family => [family, matrices[family].toArray()])));
    markCachedSwitch('cached-switch:mount-complete', { mountCalculationDurationMs: mountCalculationDuration.current });
    markCachedSwitch('cached-switch:react-commit');
  }, [combination, matrices]);
  useEffect(() => {
    families.forEach(family => markPartPrepared(combination[family]));
    onReady();
  }, [combination, matrices, onReady]);
  useEffect(() => addAfterEffect(() => stableFrameBoundary.afterRender(displayedCombinationIdRef.current)), [stableFrameBoundary]);
  useFrame((_, delta) => {
    if (rotating.current) rotating.current.rotation.y += delta * (focusState.target || exploded ? 0.08 : lowPerformance ? 0.12 : 0.22);
    const expectedCombinationId = activeCachedSwitchCombination() ?? pendingPartSwitchCombinationId();
    if (!isPartSwitchPending() || (expectedCombinationId && expectedCombinationId !== displayedCombinationId)) return;
    stableFrameBoundary.beforeRender(expectedCombinationId ?? displayedCombinationId, displayedCombinationId);
  });
  return (
    <group ref={rotating}>
      {families.map(family => (
        <PresentationPart
          key={family}
          family={family}
          scene={scenes[family]}
          permanent={matrices[family]}
          offset={offsets[family]}
          assistFocus={focusState.target === 'assist' && focusState.pulseActive}
          solarWolfBadge={shouldRenderSolarWolfBadge(combination.core, solarWolfBadgeEnabled)}
        />
      ))}
      {debugAxis && <axesHelper args={[0.09]} />}
    </group>
  );
}

function LoadingSignal() {
  useEffect(() => useCustomizer.getState().setLoadState('loading'), []);
  return null;
}

export function CustomizerScene({ combination }: { combination: Combination }) {
  const lowPerformance = useCustomizer(state => state.lowPerformance);
  const quality = resolveStudioQuality(lowPerformance);
  const ready = useCallback(() => {
    useCustomizer.getState().setLoadState('ready');
    markOnce('phase3b:first-model-ready');
    requestAnimationFrame(() => markOnce('phase3b:interaction-ready'));
  }, []);
  useEffect(() => setCachedSwitchResourceProvider(() => sceneDiagnostics().webglResources), []);
  useEffect(() => () => presentationCache.clear(), []);
  return (
    <>
      <ProgressSignal />
      <Canvas camera={{ fov: 34, near: 0.001, far: 10, position: cameraPositions.perspective.toArray() }} dpr={quality.pixelRatio} shadows={quality.shadows} gl={{ antialias: quality.antialias, alpha: false, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1, outputColorSpace: SRGBColorSpace }}>
        <color attach="background" args={['#080b12']} />
        <StudioEnvironment />
        <StudioEnvironmentIntensity intensity={quality.environmentIntensity} />
        <ambientLight intensity={lowPerformance ? 1.9 : 1.6} />
        {!lowPerformance && <hemisphereLight args={['#c9ddff', '#211d2b', 1.8]} />}
        <directionalLight position={[0.12, 0.16, 0.1]} intensity={3.2} color={new Color('#fff1d2')} />
        {!lowPerformance && <directionalLight position={[-0.1, 0.04, -0.12]} intensity={1.8} color={new Color('#8bb8ff')} />}
        <Suspense fallback={<LoadingSignal />}>
          <Assembly combination={combination} onReady={ready} />
        </Suspense>
        <CaptureBridge />
        <CameraRig />
      </Canvas>
    </>
  );
}
