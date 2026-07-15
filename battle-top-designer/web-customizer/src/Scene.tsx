import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { Color, Group, Matrix4, Mesh, Object3D, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assembleMatrices } from './assembly';
import { updateCamera, updatePermanentMatrices } from './diagnostics';
import { families, presentationOffsets, type Combination, type Family } from './domain';
import { useCustomizer } from './store';

const cameraPositions = {
  top: new Vector3(0, 0.16, 0.001),
  perspective: new Vector3(0.105, 0.085, 0.105),
  side: new Vector3(0.16, -0.012, 0.001),
  bottom: new Vector3(0.075, -0.12, 0.075),
};
const target = new Vector3(0, -0.012, 0);

function CameraRig() {
  const preset = useCustomizer(state => state.cameraPreset);
  const controls = useRef<any>(null);
  const { camera } = useThree();
  useEffect(() => {
    camera.position.copy(cameraPositions[preset]);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    if (controls.current) {
      controls.current.target.copy(target);
      controls.current.update();
    }
  }, [camera, preset]);
  useFrame(() => updateCamera(camera.position.toArray(), camera.position.distanceTo(target)));
  return <OrbitControls ref={controls} makeDefault enablePan={false} minDistance={0.065} maxDistance={0.34} />;
}

function cloneForInstance(source: Object3D): Object3D {
  const clone = source.clone(true);
  clone.traverse(object => {
    if (!(object instanceof Mesh)) return;
    object.geometry = object.geometry;
    if (Array.isArray(object.material)) object.material = object.material.map(material => material.clone());
    else object.material = object.material.clone();
  });
  return clone;
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

function PresentationPart({ family, scene, permanent, offset, assistFocus }: {
  family: Family;
  scene: Object3D;
  permanent: Matrix4;
  offset: number;
  assistFocus: boolean;
}) {
  const group = useRef<Group>(null);
  const content = useMemo(() => cloneForInstance(scene), [scene]);
  useEffect(() => { if (family === 'blade') setBladeFade(content, assistFocus); }, [assistFocus, content, family]);
  useEffect(() => () => {
    content.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
  }, [content]);
  useFrame((_, delta) => {
    if (!group.current) return;
    group.current.position.y += (offset - group.current.position.y) * Math.min(1, delta * 7);
  });
  return (
    <group matrix={permanent} matrixAutoUpdate={false}>
      <group ref={group}>
        <primitive object={content} />
        {family === 'assist' && assistFocus && (
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.0345, 0.0008, 8, 72]} />
            <meshBasicMaterial color="#ffcc42" transparent opacity={0.92} depthTest={false} />
          </mesh>
        )}
      </group>
    </group>
  );
}

function Assembly({ combination, onReady }: { combination: Combination; onReady: () => void }) {
  const focus = useCustomizer(state => state.focus);
  const exploded = useCustomizer(state => state.exploded);
  const debugAxis = useCustomizer(state => state.debugAxis);
  const coreGltf = useLoader(GLTFLoader, `${import.meta.env.BASE_URL}${combination.core}.glb`);
  const bladeGltf = useLoader(GLTFLoader, `${import.meta.env.BASE_URL}${combination.blade}.glb`);
  const assistGltf = useLoader(GLTFLoader, `${import.meta.env.BASE_URL}${combination.assist}.glb`);
  const gearGltf = useLoader(GLTFLoader, `${import.meta.env.BASE_URL}${combination.gear}.glb`);
  const tipGltf = useLoader(GLTFLoader, `${import.meta.env.BASE_URL}${combination.tip}.glb`);
  const scenes = useMemo(() => ({
    core: coreGltf.scene,
    blade: bladeGltf.scene,
    assist: assistGltf.scene,
    gear: gearGltf.scene,
    tip: tipGltf.scene,
  }), [assistGltf, bladeGltf, coreGltf, gearGltf, tipGltf]);
  const matrices = useMemo(() => assembleMatrices(scenes, combination), [combination, scenes]);
  const offsets = presentationOffsets(exploded, focus);
  const rotating = useRef<Group>(null);
  useEffect(() => {
    updatePermanentMatrices(Object.fromEntries(families.map(family => [family, matrices[family].toArray()])));
    onReady();
  }, [combination, matrices, onReady]);
  useFrame((_, delta) => {
    if (rotating.current) rotating.current.rotation.y += delta * (focus || exploded ? 0.08 : 0.22);
  });
  return (
    <group ref={rotating}>
      {families.map(family => (
        <PresentationPart
          key={`${family}:${combination[family]}`}
          family={family}
          scene={scenes[family]}
          permanent={matrices[family]}
          offset={offsets[family]}
          assistFocus={focus === 'assist'}
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
  const ready = useCallback(() => useCustomizer.getState().setLoadState('ready'), []);
  return (
    <Canvas camera={{ fov: 34, near: 0.001, far: 10, position: cameraPositions.perspective.toArray() }} dpr={[1, 2]} gl={{ antialias: true, alpha: false }}>
      <color attach="background" args={['#080b12']} />
      <ambientLight intensity={1.6} />
      <hemisphereLight args={['#c9ddff', '#211d2b', 1.8]} />
      <directionalLight position={[0.12, 0.16, 0.1]} intensity={3.2} color={new Color('#fff1d2')} />
      <directionalLight position={[-0.1, 0.04, -0.12]} intensity={1.8} color={new Color('#8bb8ff')} />
      <Suspense fallback={<LoadingSignal />}>
        <Assembly combination={combination} onReady={ready} />
      </Suspense>
      <CameraRig />
    </Canvas>
  );
}
