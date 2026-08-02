import * as THREE from 'three';
import {
  ELEMENT_ATTACKS,
  type SkillId,
  type SkillVisualSchool,
  type TimedStatusEffect,
} from '../types/battle';
import type { TopEntity } from './top';
import { SpiritSystem } from './spirit';

type SkillCastResult =
  | { ok: true; skillId: SkillId }
  | { ok: false; skillId: SkillId; reason: 'insufficient_spirit' | 'invalid_target' };

export const SKILL_COST: Record<SkillId, number> = {
  wind_blade: ELEMENT_ATTACKS.wind_blade.spiritCost,
  aqua_surge: ELEMENT_ATTACKS.aqua_surge.spiritCost,
  frost_bite: 50,
  lightning_bolt: ELEMENT_ATTACKS.lightning_bolt.spiritCost,
  blazing_meteor: ELEMENT_ATTACKS.blazing_meteor.spiritCost,
  phantom_clone: ELEMENT_ATTACKS.phantom_clone.spiritCost,
};

const SKILL_DURATION: Partial<Record<SkillId, number>> = {
  wind_blade: 5.0,
  aqua_surge: 4.0,
  frost_bite: 1.5,
  lightning_bolt: 2.0,
  blazing_meteor: 2.0,
  phantom_clone: 2.5,
};

function createEffect(skillId: SkillId): TimedStatusEffect | null {
  const duration = SKILL_DURATION[skillId];
  if (!duration || duration <= 0) return null;
  return {
    id: skillId,
    sourceSkill: skillId,
    duration,
    remaining: duration,
  };
}

function upsertEffect(top: TopEntity, effect: TimedStatusEffect | null) {
  if (!effect) return;
  const existing = top.statusEffects.find((entry) => entry.id === effect.id);
  if (existing) {
    existing.duration = effect.duration;
    existing.remaining = effect.duration;
    return;
  }
  top.statusEffects.push(effect);
}

export function getSkillLabel(skillId: SkillId) {
  switch (skillId) {
    case 'wind_blade': return '风刃';
    case 'aqua_surge': return '水波';
    case 'frost_bite': return '冰霜';
    case 'lightning_bolt': return '电击';
    case 'blazing_meteor': return '烈焰陨星';
    case 'phantom_clone': return '幻影分身';
  }
}

export function getSkillVisualSchool(skillId: SkillId): SkillVisualSchool {
  return skillId === 'frost_bite' ? 'frost' : ELEMENT_ATTACKS[skillId].visualSchool;
}

export class SkillManager {
  private readonly spirit: SpiritSystem;

  constructor(spirit: SpiritSystem) {
    this.spirit = spirit;
  }

  castElementSkill(caster: TopEntity, target: TopEntity | null, skillId: SkillId): SkillCastResult {
    if (!target) {
      return { ok: false, skillId, reason: 'invalid_target' };
    }

    const cost = SKILL_COST[skillId];
    if (!this.spirit.spend(caster, cost)) {
      return { ok: false, skillId, reason: 'insufficient_spirit' };
    }

    this.applyElementSkillVisual(caster, target, skillId, getSkillVisualSchool(skillId));

    return { ok: true, skillId };
  }

  applyElementSkillVisual(caster: TopEntity, target: TopEntity, skillId: SkillId, visualSchool: SkillVisualSchool) {
    upsertEffect(caster, createEffect(skillId));

    switch (visualSchool) {
      case 'wind':
        this.initWindBlade(caster);
        break;
      case 'water':
        this.initAquaSurge(caster);
        break;
      case 'frost':
        caster.flags.armedFrostBite = true;
        break;
      case 'lightning':
        caster.flags.armedLightningBolt = true;
        break;
      case 'fire':
        this.initBlazingMeteor(caster, target);
        break;
      case 'phantom':
        this.initPhantomClone(caster);
        break;
    }
  }

  update(top: TopEntity, dt: number, target: TopEntity) {
    if (top.lightningLines.length > 0) {
      top.lightningTimer -= dt;
      if (top.lightningTimer <= 0) {
        top.lightningLines.forEach(line => {
          if (line.parent) line.parent.remove(line);
        });
        top.lightningLines = [];
      } else {
        // dynamic tracking update
        top.lightningLines.forEach(mesh => {
          if (mesh instanceof THREE.Mesh && mesh.material instanceof THREE.ShaderMaterial) {
            mesh.material.uniforms.uTime.value += dt;
            mesh.material.uniforms.uStartPos.value.set(top.position.x, 0.4, top.position.y);
            mesh.material.uniforms.uEndPos.value.set(target.position.x, 0.4, target.position.y);
          }
        });
      }
    }

    if (top.statusEffects.length === 0) return;

    for (const effect of top.statusEffects) {
      effect.remaining = Math.max(0, effect.remaining - dt);
      this.updateEffect(top, effect, dt, target);
    }

    const expired = top.statusEffects.filter((effect) => effect.remaining <= 0);
    if (expired.length > 0) {
      for (const effect of expired) {
        this.expireEffect(top, effect);
      }
      top.statusEffects = top.statusEffects.filter((effect) => effect.remaining > 0);
    }
  }

  private updateEffect(top: TopEntity, effect: TimedStatusEffect, dt: number, target: TopEntity) {
    if (effect.id === 'wind_blade') {
      top.windMeshes.forEach(mesh => {
        if (mesh.material instanceof THREE.ShaderMaterial) {
          mesh.material.uniforms.uTime.value += dt;
        }
      });
      // Weak suction to enemy
      const dist = top.position.distanceTo(target.position);
      if (dist < 3.0) {
        const pull = new THREE.Vector2().subVectors(top.position, target.position).normalize().multiplyScalar(dt * 0.8);
        target.velocity.add(pull);
      }
    }
    if (effect.id === 'aqua_surge' && top.waterRippleMesh) {
      if (top.waterRippleMesh.material instanceof THREE.ShaderMaterial) {
        top.waterRippleMesh.material.uniforms.uTime.value += dt;
        
        // Progress from 0 to 1 based on duration
        const progress = 1.0 - (effect.remaining / effect.duration);
        
        // Scale from 1.0 to 3.5
        const scale = 1.0 + progress * 2.5;
        top.waterRippleMesh.scale.set(scale, scale, scale);
        
        // Opacity fades out
        const opacity = 1.0 - progress;
        top.waterRippleMesh.material.uniforms.uOpacity.value = Math.max(0, opacity);
      }
    }
    if (effect.id === 'phantom_clone' && top.clones.length > 0) {
      // Clones hover around caster
      const offsetX = 1.0;
      top.clones[0].position.set(top.position.x - offsetX, 0, top.position.y);
      top.clones[1].position.set(top.position.x + offsetX, 0, top.position.y);
      
      const elapsed = effect.duration - effect.remaining;
      const isGlitching = Math.sin(elapsed * 5.0) > 0.7;
      const glitchIntensity = isGlitching ? 0.9 : 0.15;

      top.clones.forEach(clone => {
        clone.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
            child.material.uniforms.uTime.value += dt;
            child.material.uniforms.uGlitchIntensity.value = glitchIntensity;
          }
        });
      });
    }
    if (effect.id === 'frost_bite') {
      top.isFrozen = true;
      top.spin = Math.max(0, top.spin - top.stats.maxSpin * 0.05 * dt);
      
      if (!top.frostGroup) {
        this.initFrostBite(top);
      }

      if (top.frostGroup) {
        const progress = 1.0 - (effect.remaining / effect.duration);
        
        // Spread quickly in first 0.3s
        let freezeProgress = 1.0;
        if (progress < 0.2) { // 0.3s / 1.5s = 0.2
            freezeProgress = progress / 0.2;
        }

        // Melt away in last 0.2s
        let glow = 2.0;
        if (effect.remaining < 0.2) {
            const meltProgress = effect.remaining / 0.2;
            freezeProgress = meltProgress;
            glow = meltProgress * 2.0;
        }

        top.frostGroup.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
                child.material.uniforms.uTime.value += dt;
                child.material.uniforms.uFreezeProgress.value = freezeProgress;
                child.material.uniforms.uGlow.value = glow;
            }
        });
      }
    }
    if (effect.id === 'blazing_meteor' && top.fireMeshes.length > 0) {
      const progress = 1.0 - (effect.remaining / effect.duration);
      
      // Calculate alpha based on remaining time (fade out in last 0.3s)
      const alpha = effect.remaining <= 0.3 ? Math.max(0, effect.remaining / 0.3) : 1.0;
      
      top.fireMeshes.forEach(mesh => {
        if (mesh.material instanceof THREE.ShaderMaterial) {
          // uTime is shared or we can just use total elapsed based on progress * duration
          mesh.material.uniforms.uTime.value += dt;
          mesh.material.uniforms.uAlpha.value = alpha;
        }
        
        // Jitter vertical scale
        const currentGlobalTime = (progress * effect.duration) + Math.random(); // pseudo time
        mesh.scale.y = 1.0 + Math.sin(currentGlobalTime * 25.0) * 0.1;
      });
    }
  }

  private expireEffect(top: TopEntity, effect: TimedStatusEffect) {
    if (effect.id === 'wind_blade') {
      top.windMeshes.forEach(mesh => {
        if (mesh.parent) mesh.parent.remove(mesh);
      });
      top.windMeshes = [];
    }
    if (effect.id === 'aqua_surge') {
      if (top.waterRippleMesh && top.waterRippleMesh.parent) {
        top.waterRippleMesh.parent.remove(top.waterRippleMesh);
        if (top.waterRippleMesh.geometry) top.waterRippleMesh.geometry.dispose();
        if (top.waterRippleMesh.material) (top.waterRippleMesh.material as THREE.Material).dispose();
      }
      top.waterRippleMesh = null;
    }
    if (effect.id === 'blazing_meteor') {
      // restore emissive
      top.mesh.traverse(child => {
        if (child instanceof THREE.Mesh && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(mat => {
            if ('emissive' in mat && 'emissiveIntensity' in mat) {
              (mat as any).emissive.setHex(0x000000);
              (mat as any).emissiveIntensity = 0.0;
            }
          });
        }
      });
      
      // cleanup fire meshes
      top.fireMeshes.forEach(mesh => {
        if (mesh.parent) mesh.parent.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) (mesh.material as THREE.Material).dispose();
      });
      top.fireMeshes = [];
    }
    if (effect.id === 'phantom_clone') {
      if (top.clones.length > 0) {
        // Randomly snap real top to one of the clones
        const snapClone = top.clones[Math.floor(Math.random() * top.clones.length)];
        top.position.set(snapClone.position.x, snapClone.position.z);
        
        let glitchMaterial: THREE.Material | null = null;
        top.clones.forEach(clone => {
          clone.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
              glitchMaterial = child.material;
            }
          });
          if (clone.parent) clone.parent.remove(clone);
        });
        
        if (glitchMaterial) {
          (glitchMaterial as THREE.Material).dispose();
        }
        
        top.clones = [];
      }
    }
    if (effect.id === 'frost_bite') {
      top.isFrozen = false;
      if (top.frostGroup) {
        if (top.frostGroup.parent) top.frostGroup.parent.remove(top.frostGroup);
        top.frostGroup.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) (child.material as THREE.Material).dispose();
          }
        });
        top.frostGroup = null;
      }
    }
  }

  // --- Visual Initializations ---

  private createStormShaderMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color('#7ef0ff') },
        uSpeed: { value: 5.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uSpeed;

        mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
        
        float hash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        
        float fbm(vec2 p) {
          float f = 0.0;
          float w = 0.5;
          for(int i = 0; i < 5; i++) {
            f += w * noise(p);
            p *= 2.0;
            p *= rot(0.4);
            w *= 0.5;
          }
          return f;
        }

        void main() {
          vec2 uv = vUv - 0.5;
          float r = length(uv);
          if (r > 0.45) {
            discard; // optimization, matches user requirement for smooth decay out to 0.45
          }
          
          float a = atan(uv.y, uv.x);
          
          // Polar Coordinates twist
          a += uTime * uSpeed + (1.0 / (r + 0.01));
          
          vec2 p = vec2(cos(a), sin(a)) * r;
          
          // Sample noise
          float n = fbm(p * 5.0 - uTime * 2.0);
          float streaks = fbm(vec2(r * 10.0, a * 4.0 - uTime * uSpeed * 2.0));
          
          float intensity = n * streaks;
          
          // Alpha mapping
          float alpha = smoothstep(0.45, 0.1, r) * intensity * 3.0;
          
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  static createLightningShaderMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uStartPos: { value: new THREE.Vector3() },
        uEndPos: { value: new THREE.Vector3() },
        uGlowColor: { value: new THREE.Color('#00ffff') },
      },
      vertexShader: `
        uniform vec3 uStartPos;
        uniform vec3 uEndPos;
        varying vec2 vUv;

        void main() {
            vUv = uv;
            vec3 dir = uEndPos - uStartPos;
            float dist = length(dir);
            vec3 normDir = normalize(dir);
            
            vec3 localPos = position;
            if(localPos.x > 0.0) {
                localPos.x = dist; 
            }
            
            vec3 worldPos = uStartPos + normDir * localPos.x + vec3(0.0, localPos.y, 0.0);
            gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform vec3 uGlowColor;

        float hash(float n) { return fract(sin(n) * 1e4); }
        float hash(vec2 p) { return fract(1e4 * sin(17.0 * p.x + p.y * 0.1) * (0.1 + abs(sin(p.y * 13.0 + p.x)))); }

        float noise(float x) {
            float i = floor(x);
            float f = fract(x);
            float u = f * f * (3.0 - 2.0 * f);
            return mix(hash(i), hash(i + 1.0), u);
        }

        void main() {
            // Glitch effect: flash in and out rapidly
            float glitch = step(0.1, sin(uTime * 120.0));
            if (glitch < 0.5) discard;

            float x = vUv.x;
            
            // Multiple layers of noise to simulate lightning branching/jaggedness
            float noiseOffset = 0.0;
            noiseOffset += (noise(x * 10.0 + uTime * 20.0) - 0.5) * 0.2;
            noiseOffset += (noise(x * 20.0 - uTime * 15.0) - 0.5) * 0.1;
            noiseOffset += (noise(x * 40.0 + uTime * 30.0) - 0.5) * 0.05;
            
            // Pin the ends to the centers (0 offset at x=0 and x=1)
            float envelope = sin(x * 3.14159);
            noiseOffset *= envelope;

            // Absolute distance to the displaced center arc
            float d = abs(vUv.y - 0.5 + noiseOffset);

            // Inverse square/power falloff for intense core and soft glow
            float intensity = pow(0.02 / (d + 0.001), 1.5);
            
            // Fade out at ends to blend nicely
            intensity *= envelope;
            
            gl_FragColor = vec4(uGlowColor * intensity, intensity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
  }

  private initWindBlade(caster: TopEntity) {
    const geo = new THREE.PlaneGeometry(3.0, 3.0);
    const mat = this.createStormShaderMaterial();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.3; // TOP_HEIGHT * 0.3 approx
    caster.mesh.add(mesh);
    caster.windMeshes.push(mesh);
  }

  private createWaterCausticMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color('#0088ff') },
        uOpacity: { value: 1.0 },
        uIntensity: { value: 0.005 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uIntensity;

        void main() {
            vec2 p = mod(vUv * 6.28318530718, 6.28318530718) - 25.0;
            vec2 i = vec2(p);
            float c = 1.0;

            for (int n = 0; n < 5; n++) {
                float t = uTime * (1.0 - (3.5 / float(n + 1)));
                i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
                c += 1.0 / length(vec2(p.x / (sin(i.x + t) / uIntensity), p.y / (cos(i.y + t) / uIntensity)));
            }
            c /= float(5);
            c = 1.17 - pow(c, 1.4);
            float val = clamp(pow(abs(c), 8.0), 0.0, 1.0);

            float r = length(vUv - 0.5);
            float mask = smoothstep(0.48, 0.0, r);

            // Clamp the final alpha to prevent additive blending blowout
            float alpha = clamp(val * uOpacity * mask, 0.0, 1.0);
            vec3 finalColor = uColor * val + vec3(val * 0.5);
            
            gl_FragColor = vec4(finalColor * alpha, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
  }

  private createFrostCrystalMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFreezeProgress: { value: 0.0 },
        uIceColor: { value: new THREE.Color('#7be0ff') },
        uGlow: { value: 2.0 }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        uniform float uFreezeProgress;

        void main() {
            vUv = uv;
            vNormal = normalize(normalMatrix * normal);
            // Extrude outward slightly based on progress to avoid z-fighting
            vec3 extrudedPos = position + normal * (uFreezeProgress * 0.04);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(extrudedPos, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        uniform float uTime;
        uniform float uFreezeProgress;
        uniform vec3 uIceColor;
        uniform float uGlow;

        // Hash function for Voronoi
        vec2 hash2( vec2 p ) {
            p = vec2( dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)) );
            return fract(sin(p)*43758.5453);
        }

        // Voronoi noise
        vec3 voronoi( in vec2 x ) {
            vec2 n = floor(x);
            vec2 f = fract(x);

            vec2 m = vec2(8.0);
            float m2 = 8.0;

            for( int j=-1; j<=1; j++ )
            for( int i=-1; i<=1; i++ ) {
                vec2 g = vec2(float(i),float(j));
                vec2 o = hash2( n + g );
                
                // Animate the cells
                o = 0.5 + 0.5*sin( uTime*0.5 + 6.2831*o );
                
                vec2 r = g - f + o;
                float d = dot(r,r);

                if( d<m2 ) {
                    m2 = d;
                    m = r;
                }
            }
            return vec3( sqrt(m2), m.x, m.y );
        }

        void main() {
            // Generate Voronoi cells for ice crystal structure
            vec3 v = voronoi(vUv * 10.0);
            
            // Extract the cell edges
            float edge = 1.0 - smoothstep(0.0, 0.1, v.x);
            
            // Fresnel / Specular
            vec3 viewDir = vec3(0.0, 0.0, 1.0); // Simple view dir assuming billboard or screen facing
            float fresnel = dot(vNormal, viewDir);
            fresnel = clamp(1.0 - fresnel, 0.0, 1.0);
            
            // The voronoi noise controls the actual ice structure
            float iceStructure = v.x + edge * 0.5;
            
            // Growth mask driven by uFreezeProgress
            // We use the underlying noise (vUv y-coordinate combined with noise) to create a spreading effect
            float growthMask = smoothstep(iceStructure, iceStructure + 0.1, uFreezeProgress * 1.5 - 0.25);
            
            // Discard pixels that haven't frozen yet
            if (growthMask < 0.01) discard;

            // Specular reflections mapped to cell edges
            float spec = pow(fresnel * edge, 2.0) * uGlow;
            
            // Final color
            vec3 color = mix(uIceColor, vec3(1.0), spec);
            
            float alpha = growthMask * (0.6 + spec);
            
            gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
  }

  private initFrostBite(target: TopEntity) {
    const frostGroup = new THREE.Group();
    const frostMat = this.createFrostCrystalMaterial();

    // Traverse the target's mesh and clone the visual geometries to create the frost shell
    target.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        // We don't want to clone the visual effects that are children of the top
        if (child.material instanceof THREE.ShaderMaterial) return; 
        
        const iceMesh = new THREE.Mesh(child.geometry, frostMat);
        iceMesh.position.copy(child.position);
        iceMesh.rotation.copy(child.rotation);
        iceMesh.scale.copy(child.scale);
        frostGroup.add(iceMesh);
      }
    });

    target.mesh.add(frostGroup);
    target.frostGroup = frostGroup;
  }

  private initAquaSurge(caster: TopEntity) {
    const geo = new THREE.PlaneGeometry(1.0, 1.0);
    const mat = this.createWaterCausticMaterial();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.18; // -TOP_HEIGHT * 0.18 approx
    caster.mesh.add(mesh);
    caster.waterRippleMesh = mesh;
  }

  private createVolumetricFireMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFireColor: { value: new THREE.Color('#ff3300') },
        uBurnSpeed: { value: 1.5 },
        uAlpha: { value: 1.0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform vec3 uFireColor;
        uniform float uBurnSpeed;
        uniform float uAlpha;

        mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
        
        float hash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        
        float fbm(vec2 p) {
          float f = 0.0;
          float w = 0.5;
          for(int i = 0; i < 5; i++) {
            f += w * noise(p);
            p *= 2.0;
            p *= rot(0.4);
            w *= 0.5;
          }
          return f;
        }

        void main() {
            vec2 uv = vUv;
            uv.y -= uTime * uBurnSpeed;
            
            float n = fbm(uv * 4.0);
            float n2 = fbm(uv * 8.0 + vec2(uTime * 0.5, uTime));
            float f = n * n2 * 3.5;
            
            float bound = 1.0 - vUv.y;
            float mask = smoothstep(0.0, 0.3, bound); // fade at top
            mask *= smoothstep(0.0, 0.2, vUv.y); // fade at bottom
            mask *= smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x); // fade at sides
            
            f *= mask;
            float innerGlow = pow(f, 3.0);
            
            vec3 color = mix(vec3(0.3, 0.0, 0.0), uFireColor, smoothstep(0.0, 0.4, f));
            color = mix(color, vec3(1.0, 0.9, 0.6), smoothstep(0.3, 1.0, innerGlow));
            
            float alpha = smoothstep(0.1, 0.3, f) * uAlpha;
            gl_FragColor = vec4(color * alpha * 2.0, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
  }

  private initBlazingMeteor(caster: TopEntity, target: TopEntity) {
    const direction = new THREE.Vector2().subVectors(target.position, caster.position).normalize();
    if (direction.lengthSq() <= 0.0001) direction.set(1, 0);
    
    // Huge impulse
    caster.velocity.add(direction.multiplyScalar(15.0));
    
    // Visuals
    caster.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(mat => {
          if ('emissive' in mat && 'emissiveIntensity' in mat) {
            (mat as any).emissive.setHex(0xff3300);
            (mat as any).emissiveIntensity = 5.0;
          }
        });
      }
    });

    // Trail Group
    const geo = new THREE.PlaneGeometry(1.5, 2.5);
    const mat = this.createVolumetricFireMaterial();
    
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.y = (i * Math.PI) / 3;
      mesh.position.y = 1.25; // center is half of 2.5
      caster.mesh.add(mesh);
      caster.fireMeshes.push(mesh);
    }
  }

  private createGlitchPhantomMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uGlitchIntensity: { value: 0.0 },
        uBaseColor: { value: new THREE.Color('#00ffcc') },
        uAlpha: { value: 0.4 }
      },
      vertexShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform float uGlitchIntensity;

        // 极简的伪随机哈希函数
        float hash(float n) { return fract(sin(n) * 43758.5453123); }

        void main() {
            vUv = uv;
            vec3 pos = position;
            
            // 当 uGlitchIntensity 较高时，根据 Y 轴坐标随机对顶点进行横向撕裂抖动
            float glitchTime = floor(uTime * 25.0); // 阶梯化时间，防止抖动过于平滑
            float rowNoise = hash(floor(position.y * 10.0) + glitchTime);
            
            if (rowNoise < uGlitchIntensity * 0.3) {
                pos.x += sin(uTime * 100.0) * 0.15 * uGlitchIntensity; // 瞬间横向位移切片
            }
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform float uGlitchIntensity;
        uniform vec3 uBaseColor;
        uniform float uAlpha;

        float hash(float n) { return fract(sin(n) * 43758.5453123); }

        void main() {
            // 色差分离 (RGB Split / Chromatic Aberration)
            float shift = hash(floor(uTime * 40.0)) * 0.05 * uGlitchIntensity;
            
            // We use simple pseudo-sampling since we don't have a screen texture to sample from.
            // Instead, we will simulate the split by generating a scanline-based base color
            // and tinting the edges if they were a texture. 
            // Since this is a 3D mesh material, we just offset the UVs to generate a procedural pattern.
            
            // Generate a base pattern with scanlines
            float scanline = sin(vUv.y * 200.0 + uTime * 10.0) * 0.15 + 0.85;
            
            // Pseudo texture sampling (using a simple gradient or solid color)
            vec3 colR = uBaseColor * vec3(1.0, 0.2, 0.2); // Tint red
            vec3 colB = uBaseColor * vec3(0.2, 0.2, 1.0); // Tint blue
            vec3 colG = uBaseColor;                       // Base
            
            // Simulate RGB split visually by blending based on the shift
            float splitMask = step(0.5, fract(vUv.x * 50.0 + shift)); 
            vec3 color = mix(colR, colG, splitMask);
            color = mix(color, colB, step(0.5, fract(vUv.x * 50.0 - shift)));

            color *= scanline;

            // 突变黑屏（Flicker）
            float flicker = hash(uTime * 10.0);
            float currentAlpha = uAlpha;
            if (flicker < 0.05 * uGlitchIntensity) {
                currentAlpha = 0.0;
            } else if (flicker > 0.95 - 0.2 * uGlitchIntensity) {
                currentAlpha = 1.0;
            }

            gl_FragColor = vec4(color, currentAlpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
  }

  private initPhantomClone(caster: TopEntity) {
    const glitchMaterial = this.createGlitchPhantomMaterial();
    for (let i = 0; i < 2; i++) {
      const cloneGroup = caster.mesh.clone();
      cloneGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          // Replace all materials with glitch material
          child.material = glitchMaterial;
        }
      });
      // Add to scene (we assume it's attached to the same parent as caster.mesh, which is handled in game.ts)
      if (caster.mesh.parent) {
        caster.mesh.parent.add(cloneGroup);
      }
      caster.clones.push(cloneGroup as THREE.Group);
    }
  }
}
