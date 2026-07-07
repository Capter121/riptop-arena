// Shared Three.js stage: one WebGL renderer + scene + camera + IBL env map +
// bloom post-processing chain + a fixed render loop. Screens swap content in
// `root` and register an onFrame callback. One GL context for the whole app.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { buildEnvironment } from './Environment.js';

// Vignette + subtle warm grade for cinematic framing.
const VignetteGrade = {
  uniforms: {
    tDiffuse: { value: null },
    uStrength: { value: 0.9 },
    uTint: { value: new THREE.Color(0.12, 0.04, 0.05) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uStrength; uniform vec3 uTint; varying vec2 vUv;
    void main(){
      vec4 col = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float vig = smoothstep(0.9, 0.28, length(d) * 1.35);
      col.rgb *= mix(1.0, vig, uStrength);
      col.rgb = mix(col.rgb, col.rgb * (1.0 + uTint), 0.3);
      gl_FragColor = col;
    }`,
};

export class ThreeStage {
  constructor(container) {
    this.container = container;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    // Scene graph exists regardless of GL so screens never crash on a missing
    // renderer (graceful degradation for browsers/sandboxes without WebGL2).
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0508);
    // Warm dark fog so the stadium tribunes + crowd stay readable at distance.
    this.scene.fog = new THREE.FogExp2(0x190a10, 0.0072);
    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 400);
    this.camera.position.set(0, 9, 13);
    this.camera.lookAt(0, 0, 0);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.timer = new THREE.Timer();
    this.elapsed = 0;
    this.onFrame = null;
    this._running = false;
    this._loop = this._loop.bind(this);
    this.gl = false;
    this.renderer = null;
    this.composer = null;
    // Cap resolution harder on phones (fewer fragments = smoother on mobile GPUs).
    const coarse = window.matchMedia && window.matchMedia('(max-width: 820px), (pointer: coarse)').matches;
    this.pixelCap = coarse ? 1.5 : 2;

    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.pixelCap));
      this.renderer.setSize(w, h);
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      // EffectComposer + OutputPass owns tone mapping (official-example pattern).
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.0;
      container.appendChild(this.renderer.domElement);

      // IBL — RoomEnvironment (zero downloads), pre-filtered to a PMREM map.
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const env = new RoomEnvironment();
      this.envMap = pmrem.fromScene(env, 0.04).texture;
      this.scene.environment = this.envMap;
      env.dispose();
      pmrem.dispose();

      // Lights: one shadow-casting key light + soft fills.
      const key = new THREE.DirectionalLight(0xffffff, 1.6);
      key.position.set(8, 16, 8);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 60;
      key.shadow.camera.left = -16;
      key.shadow.camera.right = 16;
      key.shadow.camera.top = 16;
      key.shadow.camera.bottom = -16;
      key.shadow.bias = -0.0012;
      key.shadow.normalBias = 0.02;
      this.scene.add(key);
      this.keyLight = key;

      const rim = new THREE.DirectionalLight(0xff5a44, 0.55);
      rim.position.set(-10, 6, -8);
      this.scene.add(rim);
      this.scene.add(new THREE.AmbientLight(0x4a2a30, 0.5));

      // Persistent arena hall + crowd behind every screen (survives clearContent).
      this.environment = buildEnvironment(this.scene);

      // Post-processing: bloom for emissive accents + sparks.
      this.composer = new EffectComposer(this.renderer);
      this.composer.setPixelRatio(Math.min(window.devicePixelRatio, this.pixelCap));
      this.composer.setSize(w, h);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.42, 0.5, 0.82);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new ShaderPass(VignetteGrade));
      this.composer.addPass(new OutputPass());

      this.gl = true;
    } catch (e) {
      console.warn('[SpinClash] WebGL2 unavailable — running without 3D visuals.', e);
      this._showGlBanner();
    }

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize(); // apply portrait/landscape framing immediately
  }

  // Keep horizontal field-of-view roughly constant so the wide arena still fits
  // in a tall portrait phone instead of being cropped on the sides.
  _applyAspect(w, h) {
    const aspect = w / h;
    this.camera.aspect = aspect;
    const baseFov = 50;
    const baseAspect = 1.6;
    if (aspect < baseAspect) {
      const hFov = 2 * Math.atan(Math.tan((baseFov * Math.PI) / 360) * baseAspect);
      this.camera.fov = Math.min(98, (2 * Math.atan(Math.tan(hFov / 2) / aspect) * 180) / Math.PI);
    } else {
      this.camera.fov = baseFov;
    }
    this.camera.updateProjectionMatrix();
  }

  _showGlBanner() {
    const b = document.createElement('div');
    b.className = 'gl-banner';
    b.innerHTML =
      '⚠ 此環境不支援 WebGL2，3D 畫面已停用（遊戲邏輯與戰鬥 LOG 仍可運作）。請用桌面版 Chrome / Edge / Firefox 取得完整 3D 體驗。';
    document.body.appendChild(b);
    this._glBanner = b;
  }

  setOnFrame(fn) {
    this.onFrame = fn;
  }

  clearContent() {
    for (let i = this.root.children.length - 1; i >= 0; i--) {
      const child = this.root.children[i];
      this.root.remove(child);
      child.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
    }
    this.root.rotation.set(0, 0, 0);
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._loop();
  }

  stop() {
    this._running = false;
  }

  _loop() {
    if (!this._running) return;
    requestAnimationFrame(this._loop);
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.elapsed = this.timer.getElapsed();
    if (this.gl && this.environment) this.environment.update(dt, this.elapsed);
    // onFrame still runs without GL so the sim advances and the HUD/log update.
    if (this.onFrame) this.onFrame(dt, this.elapsed);
    if (this.gl && this.composer) this.composer.render();
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this._applyAspect(w, h);
    if (!this.gl) return;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }
}
