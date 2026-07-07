import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────
//  Phase 2 — Next-gen PBR material factory.
//
//  Key upgrades over Phase 1:
//   • Radial brushed-metal normal map (anisotropy illusion)
//   • UV-animated neon energy flow channel
//   • Weight disc + rivet materials
//   • All Canvas textures procedurally generated
// ─────────────────────────────────────────────────────────────

export interface TopMaterialSet {
  ring: THREE.Material | THREE.Material[];
  weightDisc: THREE.MeshStandardMaterial;
  core: THREE.MeshStandardMaterial;
  driver: THREE.MeshStandardMaterial;
  rivet: THREE.MeshStandardMaterial;
  /** Additive-blend energy flow for blade groove meshes. */
  energyFlow: THREE.MeshBasicMaterial;
  /** Must be called every frame to drive UV scroll animation. */
  updateFlow(dt: number): void;
}

// ── Radial Brushed-Metal Normal Map ─────────────────────────
// Simulates anisotropic vinyl-record-like highlight streaks.
//
// Algorithm for each pixel (px, py):
//   1. Compute angle θ = atan2(py - centre, px - centre)
//   2. Tangent direction = perpendicular to radial = (-sinθ, cosθ)
//   3. High-frequency sinusoidal noise along θ creates visible brushing lines
//   4. Encode tangent perturbation as RGB normal map:
//        R = tangentX * perturbation * 0.5 + 0.5
//        G = tangentY * perturbation * 0.5 + 0.5
//        B ≈ 0.78 (Z component — mostly pointing up)

function createRadialNormalMap(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;
  const cx = size / 2;
  const cy = size / 2;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const dx = px - cx;
      const dy = py - cy;
      const angle = Math.atan2(dy, dx);

      // Tangent = perpendicular to radial direction.
      const tangentX = -Math.sin(angle);
      const tangentY = Math.cos(angle);

      // High-frequency concentric brushing lines.
      // sin(angle * N) creates N line-pairs around the disc.
      // Multiple octaves for rich micro-detail.
      const noise =
        Math.sin(angle * 120) * 0.3 +
        Math.sin(angle * 67 + 1.3) * 0.15 +
        Math.sin(angle * 211 + 0.7) * 0.08;

      const idx = (py * size + px) * 4;
      // Encode perturbed normal in tangent-space → RGB.
      data[idx] = Math.round((tangentX * noise * 0.5 + 0.5) * 255);     // R
      data[idx + 1] = Math.round((tangentY * noise * 0.5 + 0.5) * 255); // G
      data[idx + 2] = 200;                                               // B (Z up)
      data[idx + 3] = 255;                                               // A
    }
  }

  ctx.putImageData(imageData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// ── Micro-Scratch Roughness Map (carried from Phase 1) ──────
// Circular polishing pattern scratches for specular variance.

function createScratchRoughnessMap(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = '#888';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 120; i++) {
    const x0 = Math.random() * size;
    const y0 = Math.random() * size;
    const angle = Math.atan2(y0 - size / 2, x0 - size / 2) + Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    const len = 8 + Math.random() * 28;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + Math.cos(angle) * len, y0 + Math.sin(angle) * len);
    ctx.stroke();
  }

  ctx.strokeStyle = '#aaa';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 15; i++) {
    const x0 = Math.random() * size;
    const y0 = Math.random() * size;
    const angle = Math.random() * Math.PI * 2;
    const len = 14 + Math.random() * 40;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + Math.cos(angle) * len, y0 + Math.sin(angle) * len);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
}

function createDragonEmblemTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  // Background dark core
  ctx.fillStyle = '#050d14';
  ctx.fillRect(0, 0, size, size);

  // Outer Tech Ring
  ctx.strokeStyle = '#00ffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.45, 0, Math.PI * 2);
  ctx.stroke();

  // "AZURE DRAGON" Text curving around
  ctx.fillStyle = '#00ffff';
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const text = 'AZURE DRAGON ';
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < text.length; i++) {
    ctx.save();
    ctx.rotate((i / text.length) * Math.PI * 2 - Math.PI / 2);
    ctx.translate(0, -size * 0.38);
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
  }
  ctx.restore();

  // Abstract Dragon Head Motif
  ctx.save();
  ctx.translate(cx, cy);
  
  // Base glow
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.3);
  glow.addColorStop(0, 'rgba(0, 255, 255, 0.4)');
  glow.addColorStop(1, 'rgba(0, 255, 255, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Dragon Horns and Snout (Polygons)
  ctx.fillStyle = '#00ccff';
  ctx.shadowColor = '#00ffff';
  ctx.shadowBlur = 15;

  // Left Horn
  ctx.beginPath();
  ctx.moveTo(-40, -40);
  ctx.lineTo(-80, -120);
  ctx.lineTo(-20, -70);
  ctx.fill();

  // Right Horn
  ctx.beginPath();
  ctx.moveTo(40, -40);
  ctx.lineTo(80, -120);
  ctx.lineTo(20, -70);
  ctx.fill();

  // Center Snout
  ctx.beginPath();
  ctx.moveTo(-30, 20);
  ctx.lineTo(0, 100);
  ctx.lineTo(30, 20);
  ctx.lineTo(0, -30);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#ff3300';
  ctx.shadowColor = '#ffaa00';
  ctx.beginPath();
  ctx.moveTo(-20, -10);
  ctx.lineTo(-40, -20);
  ctx.lineTo(-15, -25);
  ctx.fill();
  
  ctx.beginPath();
  ctx.moveTo(20, -10);
  ctx.lineTo(40, -20);
  ctx.lineTo(15, -25);
  ctx.fill();

  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

// ── UV Energy Flow Stripe ───────────────────────────────────
// A narrow 32×4 gradient strip that scrolls via texture.offset.x
// each frame.  When applied to groove meshes in the blade, it
// creates a racing neon energy effect.

function createEnergyFlowTexture(color: string): THREE.CanvasTexture {
  const w = 64;
  const h = 4;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Neon gradient: transparent → color → bright → color → transparent.
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(0.2, color);
  grad.addColorStop(0.45, '#ffffff');
  grad.addColorStop(0.55, '#ffffff');
  grad.addColorStop(0.8, color);
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(2, 1);
  return texture;
}

// ── Public factory ──────────────────────────────────────────

export function createTopMaterials(
  _ringColor: string,
  _coreColor: string,
  _driverColor: string,
): TopMaterialSet {
  const scratchMap = createScratchRoughnessMap();
  const normalMap = createRadialNormalMap();

  // Face of the dragon ring
  const ringMaterial = new THREE.MeshStandardMaterial({
    color: '#0d3d3d', // Dragon Scale Teal
    metalness: 0.8,
    roughness: 0.4,
    roughnessMap: scratchMap,
    normalMap,
    normalScale: new THREE.Vector2(0.8, 0.8),
  });

  // Sharp Chrome Silver Bevels
  const ringBevelMaterial = new THREE.MeshStandardMaterial({
    color: '#e0e0e0', // Chrome Silver
    metalness: 0.98,
    roughness: 0.05,
  });

  const ring = [ringMaterial, ringBevelMaterial];

  const weightDisc = new THREE.MeshStandardMaterial({
    color: '#2a2e33',
    metalness: 0.85,
    roughness: 0.3,
  });

  const emblemMap = createDragonEmblemTexture();
  const core = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    metalness: 0.9,
    roughness: 0.2,
    map: emblemMap,
    emissiveMap: emblemMap,
    emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 1.5,
  });

  const driver = new THREE.MeshStandardMaterial({
    color: '#0a1a1f', // Dark bluish grey
    metalness: 0.7,
    roughness: 0.5,
  });

  const rivet = new THREE.MeshStandardMaterial({
    color: '#d4af37', // Gold Accents for rivets
    metalness: 1.0,
    roughness: 0.15,
    emissive: new THREE.Color('#d4af37'),
    emissiveIntensity: 0.5,
  });

  // Energy flow — scrolling neon stripe (Gold for Dragon)
  const flowTexture = createEnergyFlowTexture('#d4af37');
  const energyFlow = new THREE.MeshBasicMaterial({
    map: flowTexture,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  /** Advance UV scroll offset each frame. */
  const updateFlow = (dt: number) => {
    flowTexture.offset.x += dt * 2.8;
  };

  return { ring, weightDisc, core, driver, rivet, energyFlow, updateFlow };
}

import { type ElementAttribute, type MaterialTier, ELEMENT_COLORS } from '../types/shopItems';

export function getDynamicComponentMaterial(attribute: ElementAttribute, tier: MaterialTier, type: 'core' | 'ring' | 'driver' | 'weightDisc' = 'ring'): THREE.Material {
  const scratchMap = createScratchRoughnessMap();
  const normalMap = createRadialNormalMap();

  const color = new THREE.Color(ELEMENT_COLORS[attribute] || '#ffffff');
  
  const material = new THREE.MeshStandardMaterial({
    color: '#333333',
    roughnessMap: scratchMap,
    normalMap,
    normalScale: new THREE.Vector2(0.8, 0.8),
  });

  // Adjust base on Tier
  if (tier === 'COMMON') {
    material.metalness = 0.1;
    material.roughness = 0.8;
  } else if (tier === 'REFINED') {
    material.metalness = 0.6;
    material.roughness = 0.4;
  } else if (tier === 'RARE') {
    material.metalness = 0.95;
    material.roughness = 0.1;
  } else if (tier === 'LEGENDARY') {
    material.metalness = 0.95;
    material.roughness = 0.1;
  } else if (tier === 'MYTHIC') {
    material.metalness = 0.95;
    material.roughness = 0.05;
    material.emissive.copy(color);
    material.emissiveIntensity = 3.5;
  }

  // Ring types get extra coloring
  if (type === 'ring') {
    if (tier !== 'MYTHIC') material.color.copy(color).multiplyScalar(0.2); // slight tint
  } else if (type === 'core') {
    material.color.copy(color);
  }

  return material;
}
