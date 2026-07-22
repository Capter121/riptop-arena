import { OrbitControls, useProgress } from '@react-three/drei';
import { addAfterEffect, Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { ACESFilmicToneMapping, Group, Matrix4, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, PMREMGenerator, SRGBColorSpace, TextureLoader, Vector3, WebGLRenderTarget } from 'three';
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
import { cameraTransitionProgress, easeOutQuad, showcaseCameraPresets } from './rendering/showcaseCamera';
import { turntableRotationDelta } from './rendering/showcasePolicy';
import { resolveStudioLighting } from './rendering/studioLighting';
import { shouldRenderSolarWolfBadge, solarWolfBadgePolicy } from './rendering/solarWolfBadge';
import { shouldRenderStormFangPattern, stormFangIdentityPolicy } from './rendering/stormFangIdentity';
import {
  dualCometIdentityPolicy, ironBastionIdentityPolicy, orbitHaloIdentityPolicy,
  shouldRenderDualCometPattern, shouldRenderIronBastionPattern, shouldRenderOrbitHaloPattern,
  shouldRenderVoidFalconBadge, voidFalconBadgePolicy,
} from './rendering/remainingVisualIdentities';
import solarWolfBadgeUrl from '../../design/visual-identity/solar-wolf-concept.svg?url';
import stormFangIdentityUrl from '../../design/visual-identity/storm-fang-concept.svg?url';
import voidFalconBadgeUrl from '../../design/visual-identity/void-falcon-concept.svg?url';
import ironBastionIdentityUrl from '../../design/visual-identity/iron-bastion-concept.svg?url';
import orbitHaloIdentityUrl from '../../design/visual-identity/orbit-halo-concept.svg?url';
import dualCometIdentityUrl from '../../design/visual-identity/dual-comet-concept.svg?url';

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

function StudioLightingRig({ lowPerformance, showcaseEnabled }: { lowPerformance: boolean; showcaseEnabled: boolean }) {
  const lighting = resolveStudioLighting(lowPerformance, showcaseEnabled);
  return (
    <>
      <ambientLight intensity={lighting.ambientIntensity} />
      {lighting.hemisphere.enabled && <hemisphereLight args={[lighting.hemisphere.skyColor, lighting.hemisphere.groundColor, lighting.hemisphere.intensity]} />}
      {lighting.key.enabled && <directionalLight position={lighting.key.position} intensity={lighting.key.intensity} color={lighting.key.color} castShadow={false} />}
      {lighting.fill.enabled && <directionalLight position={lighting.fill.position} intensity={lighting.fill.intensity} color={lighting.fill.color} castShadow={false} />}
      {lighting.rim.enabled && <directionalLight position={lighting.rim.position} intensity={lighting.rim.intensity} color={lighting.rim.color} castShadow={false} />}
    </>
  );
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
  const showcaseEnabled = useCustomizer(state => state.showcaseEnabled);
  const showcaseCameraPreset = useCustomizer(state => state.showcaseCameraPreset);
  const controls = useRef<any>(null);
  const transition = useRef({
    active: false,
    elapsedMs: 0,
    durationMs: 0,
    startPosition: new Vector3(),
    startTarget: new Vector3(),
    endPosition: new Vector3(),
    endTarget: new Vector3(),
  });
  const { camera, gl } = useThree();
  useEffect(() => {
    const next = showcaseEnabled ? showcaseCameraPresets[showcaseCameraPreset] : {
      position: cameraPositions[preset].toArray() as [number, number, number], target: target.toArray() as [number, number, number], durationMs: 260,
    };
    transition.current.startPosition.copy(camera.position);
    transition.current.startTarget.copy(controls.current?.target ?? target);
    transition.current.endPosition.set(next.position[0], next.position[1], next.position[2]);
    transition.current.endTarget.set(next.target[0], next.target[1], next.target[2]);
    transition.current.durationMs = next.durationMs;
    transition.current.elapsedMs = 0;
    transition.current.active = true;
  }, [camera, preset, showcaseCameraPreset, showcaseEnabled]);
  useFrame((_, delta) => {
    if (transition.current.active && !useCustomizer.getState().turntablePausedByInteraction) {
      transition.current.elapsedMs += delta * 1000;
      const progress = cameraTransitionProgress(transition.current.elapsedMs, transition.current.durationMs);
      const eased = easeOutQuad(progress);
      camera.position.lerpVectors(transition.current.startPosition, transition.current.endPosition, eased);
      if (controls.current) {
        controls.current.target.lerpVectors(transition.current.startTarget, transition.current.endTarget, eased);
        controls.current.update();
      } else camera.lookAt(transition.current.endTarget);
      if (progress === 1) transition.current.active = false;
    }
    updateCamera(camera.position.toArray(), camera.position.distanceTo(target));
    updateWebglResources(gl.info.memory.geometries, gl.info.memory.textures, gl.info.programs?.length ?? 0);
  });
  return <OrbitControls ref={controls} makeDefault enablePan={false} minDistance={0.065} maxDistance={0.34} onStart={() => {
    transition.current.active = false;
    useCustomizer.getState().setTurntablePausedByInteraction(true);
  }} onEnd={() => useCustomizer.getState().setTurntablePausedByInteraction(false)} />;
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

function StormFangPattern() {
  const texture = useLoader(TextureLoader, stormFangIdentityUrl);
  const material = useMemo(() => new MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.02,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    toneMapped: false,
  }), [texture]);
  useEffect(() => {
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    return () => material.dispose();
  }, [material, texture]);
  return (
    <group>
      {stormFangIdentityPolicy.sectorStarts.map(start => (
        <mesh key={start} position={[0, stormFangIdentityPolicy.topSurfaceYM, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
          <ringGeometry args={[stormFangIdentityPolicy.innerRadiusM, stormFangIdentityPolicy.outerRadiusM, 24, 1, start, stormFangIdentityPolicy.thetaLengthRadians]} />
          <primitive object={material} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

function VoidFalconBadge() {
  const texture = useLoader(TextureLoader, voidFalconBadgeUrl);
  useEffect(() => {
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
  }, [texture]);
  return (
    <mesh position={[0, voidFalconBadgePolicy.topSurfaceYM, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <circleGeometry args={[voidFalconBadgePolicy.radialRangeM[1], 64]} />
      <meshBasicMaterial map={texture} transparent alphaTest={0.02} depthWrite={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} toneMapped={false} />
    </mesh>
  );
}

function BladeSectorIdentity({ textureUrl, identity }: { textureUrl: string; identity: typeof ironBastionIdentityPolicy | typeof dualCometIdentityPolicy }) {
  const texture = useLoader(TextureLoader, textureUrl);
  const material = useMemo(() => new MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.02,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    toneMapped: false,
  }), [texture]);
  useEffect(() => {
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    return () => material.dispose();
  }, [material, texture]);
  return (
    <group>
      {identity.rotationOffsetsRadians.map(start => (
        <mesh key={start} position={[0, identity.topSurfaceYM, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
          <ringGeometry args={[identity.radialRangeM[0], identity.radialRangeM[1], 24, 1, start, 0.48]} />
          <primitive object={material} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

function OrbitHaloPattern() {
  const texture = useLoader(TextureLoader, orbitHaloIdentityUrl);
  const material = useMemo(() => new MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.02,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    toneMapped: false,
  }), [texture]);
  useEffect(() => {
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    return () => material.dispose();
  }, [material, texture]);
  return (
    <mesh position={[0, orbitHaloIdentityPolicy.topSurfaceYM, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <ringGeometry args={[orbitHaloIdentityPolicy.radialRangeM[0], orbitHaloIdentityPolicy.radialRangeM[1], 48]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function PresentationPart({ family, scene, permanent, offset, assistFocus, solarWolfBadge, voidFalconBadge, stormFangPattern, ironBastionPattern, orbitHaloPattern, dualCometPattern }: {
  family: Family;
  scene: Object3D;
  permanent: Matrix4;
  offset: number;
  assistFocus: boolean;
  solarWolfBadge: boolean;
  voidFalconBadge: boolean;
  stormFangPattern: boolean;
  ironBastionPattern: boolean;
  orbitHaloPattern: boolean;
  dualCometPattern: boolean;
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
        {family === 'core' && voidFalconBadge && <VoidFalconBadge />}
        {family === 'blade' && stormFangPattern && <StormFangPattern />}
        {family === 'blade' && ironBastionPattern && <BladeSectorIdentity textureUrl={ironBastionIdentityUrl} identity={ironBastionIdentityPolicy} />}
        {family === 'blade' && orbitHaloPattern && <OrbitHaloPattern />}
        {family === 'blade' && dualCometPattern && <BladeSectorIdentity textureUrl={dualCometIdentityUrl} identity={dualCometIdentityPolicy} />}
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
  const turntableEnabled = useCustomizer(state => state.turntableEnabled);
  const turntablePausedByInteraction = useCustomizer(state => state.turntablePausedByInteraction);
  const turntableSpeed = useCustomizer(state => state.turntableSpeed);
  const solarWolfBadgeEnabled = useCustomizer(state => state.solarWolfBadgeEnabled);
  const stormFangPatternEnabled = useCustomizer(state => state.stormFangPatternEnabled);
  const voidFalconBadgeEnabled = useCustomizer(state => state.voidFalconBadgeEnabled);
  const ironBastionPatternEnabled = useCustomizer(state => state.ironBastionPatternEnabled);
  const orbitHaloPatternEnabled = useCustomizer(state => state.orbitHaloPatternEnabled);
  const dualCometPatternEnabled = useCustomizer(state => state.dualCometPatternEnabled);
  const modelRoot = import.meta.env.VITE_NSS_MODEL_ROOT || import.meta.env.BASE_URL;
  const normalizedModelRoot = modelRoot.endsWith('/') ? modelRoot : `${modelRoot}/`;
  const coreGltf = useLoader(GLTFLoader, `${normalizedModelRoot}${combination.core}.glb`);
  const bladeGltf = useLoader(GLTFLoader, `${normalizedModelRoot}${combination.blade}.glb`);
  const assistGltf = useLoader(GLTFLoader, `${normalizedModelRoot}${combination.assist}.glb`);
  const gearGltf = useLoader(GLTFLoader, `${normalizedModelRoot}${combination.gear}.glb`);
  const tipGltf = useLoader(GLTFLoader, `${normalizedModelRoot}${combination.tip}.glb`);
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
    if (rotating.current) rotating.current.rotation.y += turntableRotationDelta(turntableEnabled, turntablePausedByInteraction, turntableSpeed, delta);
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
          voidFalconBadge={shouldRenderVoidFalconBadge(combination.core, voidFalconBadgeEnabled)}
          stormFangPattern={shouldRenderStormFangPattern(combination.blade, stormFangPatternEnabled)}
          ironBastionPattern={shouldRenderIronBastionPattern(combination.blade, ironBastionPatternEnabled)}
          orbitHaloPattern={shouldRenderOrbitHaloPattern(combination.blade, orbitHaloPatternEnabled)}
          dualCometPattern={shouldRenderDualCometPattern(combination.blade, dualCometPatternEnabled)}
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
  const showcaseEnabled = useCustomizer(state => state.showcaseEnabled);
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
        <StudioLightingRig lowPerformance={lowPerformance} showcaseEnabled={showcaseEnabled} />
        <Suspense fallback={<LoadingSignal />}>
          <Assembly combination={combination} onReady={ready} />
        </Suspense>
        <CaptureBridge />
        <CameraRig />
      </Canvas>
    </>
  );
}
