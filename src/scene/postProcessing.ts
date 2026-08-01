import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RGBShiftShader } from 'three/addons/shaders/RGBShiftShader.js';

// ─────────────────────────────────────────────────────────────
//  Phase 2 — Post-processing pipeline.
//  Pass order:  RenderPass → SSAO → UnrealBloomPass
//
//  SSAO adds contact shadows under the tops and between stacked
//  parts, eliminating the floating look.  Skipped on mobile.
//  Bloom makes emissive materials and additive particles glow.
// ─────────────────────────────────────────────────────────────

export interface BloomPipeline {
  composer: EffectComposer;
  /** Call after window resize to keep render target in sync. */
  resize(width: number, height: number): void;
  setBloomStrength(strength: number): void;
  setDistortion(amount: number): void;
}

const BLOOM_STRENGTH = 0.65;
const BLOOM_RADIUS = 0.4;
const BLOOM_THRESHOLD = 0.78;

/** Mobile heuristic: coarse pointer OR explicit small viewport. */
function isMobile(): boolean {
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    navigator.maxTouchPoints > 0
  );
}

export function createBloomPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
): BloomPipeline {
  const mobile = isMobile();
  const resScale = 1.0; // 强制保持 100% 原生超清分辨率，消除移动端/局域网设备画质模糊问题

  const size = renderer.getSize(new THREE.Vector2());
  const w = Math.floor(size.x * resScale);
  const h = Math.floor(size.y * resScale);

  const composer = new EffectComposer(renderer);
  composer.setSize(w, h);

  // Pass 1: Scene render.
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Pass 2: SSAO — contact shadows (desktop only).
  if (!mobile) {
    const ssaoPass = new SSAOPass(scene, camera, w, h);
    ssaoPass.kernelRadius = 0.6;
    ssaoPass.minDistance = 0.001;
    ssaoPass.maxDistance = 0.12;
    composer.addPass(ssaoPass);
  }

  // Pass 3: Bloom — emissive glow.
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(w, h),
    BLOOM_STRENGTH,
    BLOOM_RADIUS,
    BLOOM_THRESHOLD,
  );
  composer.addPass(bloomPass);

  const resize = (width: number, height: number) => {
    const rw = Math.floor(width * resScale);
    const rh = Math.floor(height * resScale);
    composer.setSize(rw, rh);
    bloomPass.resolution.set(rw, rh);
  };

  // Pass 4: RGB Shift for Glitch / Bullet Time
  const rgbShiftPass = new ShaderPass(RGBShiftShader);
  rgbShiftPass.uniforms['amount'].value = 0.00;
  rgbShiftPass.enabled = false;
  composer.addPass(rgbShiftPass);

  const setBloomStrength = (strength: number) => {
    bloomPass.strength = strength;
  };

  const setDistortion = (amount: number) => {
    rgbShiftPass.uniforms['amount'].value = amount * 0.015; 
    rgbShiftPass.enabled = amount > 0.01;
  };

  return { composer, resize, setBloomStrength, setDistortion };
}
