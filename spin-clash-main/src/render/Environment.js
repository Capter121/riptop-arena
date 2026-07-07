// Persistent arena hall behind every screen: red-black gradient sky, stepped
// tribunes packed with an animated crowd (bodies + heads + glow-sticks),
// volumetric sweeping spotlight beams, ceiling downlights, reflective floor and
// floating embers. Lives in the scene (not the swappable root) so it persists.

import * as THREE from 'three';

// Warm, red-biased glow-stick palette with a few cool accents for variety.
const STICK_TINTS = [0xff4d2e, 0xff7a3d, 0xffd166, 0xff2c4d, 0xff9b6b, 0x4f9dd9, 0xb15cff];

// A cheering-person silhouette (white on transparent) used as the crowd sprite,
// so spectators read clearly as people instead of abstract shapes.
function makeCrowdTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 128;
  const x = cv.getContext('2d');
  x.fillStyle = '#fff';
  x.strokeStyle = '#fff';
  x.lineCap = 'round';
  x.lineJoin = 'round';
  // head
  x.beginPath();
  x.arc(64, 30, 15, 0, Math.PI * 2);
  x.fill();
  // torso (shoulders wider than hips -> clearly a person)
  x.beginPath();
  x.moveTo(40, 58);
  x.lineTo(88, 58);
  x.lineTo(80, 120);
  x.lineTo(48, 120);
  x.closePath();
  x.fill();
  // raised arms in a cheering V
  x.lineWidth = 13;
  x.beginPath();
  x.moveTo(44, 60);
  x.lineTo(22, 20);
  x.moveTo(84, 60);
  x.lineTo(106, 20);
  x.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false; // sample directly via gl_PointCoord (head stays on top)
  return tex;
}

export function buildEnvironment(scene) {
  const group = new THREE.Group();
  group.name = 'environment';

  // --- Gradient skydome (red-black) ----------------------------------------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(170, 40, 22),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x140a10) },
        mid: { value: new THREE.Color(0x230b10) },
        bot: { value: new THREE.Color(0x050308) },
        glow: { value: new THREE.Color(0x7a1320) },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
      fragmentShader: `
        varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 glow;
        void main(){
          float h = normalize(vP).y;
          vec3 c = mix(bot, mid, smoothstep(-0.5, 0.1, h));
          c = mix(c, top, smoothstep(0.1, 0.9, h));
          c += glow * smoothstep(0.18, -0.05, abs(h)) * 0.55; // red horizon band
          gl_FragColor = vec4(c, 1.0);
        }`,
    })
  );
  sky.frustumCulled = false;
  group.add(sky);

  // --- Polished hall floor --------------------------------------------------
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(72, 80),
    new THREE.MeshStandardMaterial({ color: 0x0a0608, metalness: 0.86, roughness: 0.34 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -4.2;
  floor.receiveShadow = true;
  group.add(floor);

  for (let i = 1; i <= 4; i++) {
    const r = 16 + i * 7;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r - 0.09, r + 0.09, 110),
      new THREE.MeshBasicMaterial({ color: 0x8a1a22, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -4.18;
    group.add(ring);
  }

  // --- Tribunes (stepped stands) + curved back wall + ceiling ring ----------
  const tiers = [
    { r: 15.5, y: 1.4 },
    { r: 19.5, y: 4.0 },
    { r: 23.5, y: 6.6 },
    { r: 27.5, y: 9.2 },
    { r: 31.5, y: 11.8 },
  ];
  const profile = [new THREE.Vector2(15, 0)];
  for (const t of tiers) {
    profile.push(new THREE.Vector2(t.r, t.y - 0.18));
    profile.push(new THREE.Vector2(t.r + 3.4, t.y)); // tread
  }
  profile.push(new THREE.Vector2(35.5, 14.5)); // back wall
  profile.push(new THREE.Vector2(36.5, 20)); // up to ceiling
  const stands = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 120),
    new THREE.MeshStandardMaterial({ color: 0x0d0709, metalness: 0.45, roughness: 0.7, emissive: 0x1a0608, emissiveIntensity: 0.35, side: THREE.DoubleSide })
  );
  stands.position.y = -2;
  group.add(stands);

  // dark ceiling cap to close the dome
  const ceiling = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 36, 6, 64, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x0a0608, metalness: 0.3, roughness: 0.9, side: THREE.BackSide })
  );
  ceiling.position.y = 21;
  group.add(ceiling);

  // glowing LED strip along each tier edge (red)
  for (const t of tiers) {
    const strip = new THREE.Mesh(
      new THREE.TorusGeometry(t.r + 3.4, 0.06, 8, 130),
      new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    strip.rotation.x = Math.PI / 2;
    strip.position.y = t.y - 2 + 0.04;
    group.add(strip);
  }

  // --- Crowd: bodies + heads (instanced) ------------------------------------
  const seats = [];
  for (let ti = 0; ti < tiers.length; ti++) {
    const t = tiers[ti];
    const seatR = t.r + 2.0;
    const perRow = Math.floor((2 * Math.PI * seatR) / 1.45);
    for (let k = 0; k < perRow; k++) {
      const a = (k / perRow) * Math.PI * 2 + ti * 0.1;
      const jr = (Math.random() - 0.5) * 1.0;
      seats.push({
        x: Math.cos(a) * (seatR + jr),
        z: Math.sin(a) * (seatR + jr),
        y: t.y - 2 + 0.7,
        phase: Math.random() * Math.PI * 2,
        amp: 0.1 + Math.random() * 0.22,
        sc: 0.85 + Math.random() * 0.45,
        a,
      });
    }
  }
  const COUNT = seats.length;

  // Crowd = textured billboard points (human silhouettes). One draw call;
  // screen-aligned so they always face the camera; bob with the cheer animation.
  const crowdPos = new Float32Array(COUNT * 3);
  const crowdCol = new Float32Array(COUNT * 3);
  const crowdBase = new Float32Array(COUNT);
  const tint = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    const s = seats[i];
    crowdPos[i * 3] = s.x;
    crowdPos[i * 3 + 1] = s.y + 0.55;
    crowdPos[i * 3 + 2] = s.z;
    crowdBase[i] = s.y + 0.55;
    const v = 0.1 + Math.random() * 0.16; // dark warm silhouette variance
    tint.setRGB(v * 1.25, v * 0.8, v * 0.85);
    crowdCol[i * 3] = tint.r;
    crowdCol[i * 3 + 1] = tint.g;
    crowdCol[i * 3 + 2] = tint.b;
  }
  const crowdGeo = new THREE.BufferGeometry();
  crowdGeo.setAttribute('position', new THREE.BufferAttribute(crowdPos, 3));
  crowdGeo.setAttribute('aColor', new THREE.BufferAttribute(crowdCol, 3));
  const crowd = new THREE.Points(
    crowdGeo,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTex: { value: makeCrowdTexture() }, uScale: { value: 360 } },
      vertexShader: `attribute vec3 aColor; varying vec3 vC; uniform float uScale; void main(){ vC=aColor; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=uScale/ -mv.z; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D uTex; varying vec3 vC; void main(){ vec4 t=texture2D(uTex, gl_PointCoord); if(t.a<0.35) discard; gl_FragColor=vec4(vC*t.rgb, t.a); }`,
    })
  );
  crowd.frustumCulled = false;
  group.add(crowd);

  // --- Glow-sticks (bright points above the crowd) --------------------------
  const glowPos = new Float32Array(COUNT * 3);
  const glowCol = new Float32Array(COUNT * 3);
  const glowBase = new Float32Array(COUNT);
  const c = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    const s = seats[i];
    glowPos[i * 3] = s.x;
    glowPos[i * 3 + 1] = s.y + 1.05;
    glowPos[i * 3 + 2] = s.z;
    glowBase[i] = s.y + 1.05;
    c.set(STICK_TINTS[(Math.random() * STICK_TINTS.length) | 0]);
    glowCol[i * 3] = c.r;
    glowCol[i * 3 + 1] = c.g;
    glowCol[i * 3 + 2] = c.b;
  }
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
  glowGeo.setAttribute('aColor', new THREE.BufferAttribute(glowCol, 3));
  const glow = new THREE.Points(
    glowGeo,
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 240 } },
      vertexShader: `attribute vec3 aColor; varying vec3 vC; uniform float uScale; void main(){ vC=aColor; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=uScale/ -mv.z; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5)discard; float g=smoothstep(0.5,0.0,d); gl_FragColor=vec4(vC*(1.7+g), g); }`,
    })
  );
  glow.frustumCulled = false;
  group.add(glow);

  // --- Volumetric sweeping spotlight beams + ceiling lights -----------------
  const beams = new THREE.Group();
  const H = 26;
  const beamShader = () =>
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { uColor: { value: new THREE.Color(0xffb4a0) }, uH: { value: H } },
      vertexShader: `varying vec3 vP; varying vec2 vUv; void main(){ vP=position; vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `
        varying vec3 vP; uniform vec3 uColor; uniform float uH;
        void main(){
          float t = clamp((vP.y + uH*0.5)/uH, 0.0, 1.0);   // 1 at apex (light), 0 at floor
          float a = pow(t, 1.5) * 0.16;
          gl_FragColor = vec4(uColor, a);
        }`,
    });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const beam = new THREE.Mesh(new THREE.ConeGeometry(3.0, H, 30, 1, true), beamShader());
    beam.position.set(Math.cos(a) * 9, 16 - H / 2, Math.sin(a) * 9);
    beam.rotation.z = Math.cos(a) * 0.16;
    beam.rotation.x = Math.sin(a) * 0.16;
    beams.add(beam);
    // ceiling light source (blooms)
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffdccf })
    );
    lamp.position.set(Math.cos(a) * 9, 16, Math.sin(a) * 9);
    beams.add(lamp);
  }
  group.add(beams);

  // --- Floating embers ------------------------------------------------------
  const DUST = 260;
  const dpos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 5 + Math.random() * 30;
    dpos[i * 3] = Math.cos(a) * r;
    dpos[i * 3 + 1] = Math.random() * 16;
    dpos[i * 3 + 2] = Math.sin(a) * r;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: 0xff9b6b, size: 0.08, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  dust.frustumCulled = false;
  group.add(dust);

  scene.add(group);

  // --- Animation ------------------------------------------------------------
  function update(dt, elapsed) {
    for (let i = 0; i < COUNT; i++) {
      const s = seats[i];
      const bob = Math.sin(elapsed * 3.0 + s.phase) * s.amp;
      crowdPos[i * 3 + 1] = crowdBase[i] + bob;
      glowPos[i * 3 + 1] = glowBase[i] + bob + Math.sin(elapsed * 4.0 + s.phase) * 0.16;
    }
    crowdGeo.attributes.position.needsUpdate = true;
    glowGeo.attributes.position.needsUpdate = true;

    beams.rotation.y += dt * 0.15;
    dust.rotation.y += dt * 0.012;
  }

  function dispose() {
    scene.remove(group);
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((mm) => mm.dispose());
        else o.material.dispose();
      }
    });
  }

  return { group, update, dispose };
}
