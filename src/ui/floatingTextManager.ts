import * as THREE from 'three';

type FloatingText = {
  element: HTMLDivElement;
  position: THREE.Vector3;
  life: number;
  maxLife: number;
  velocity: THREE.Vector2; // Screen space velocity
  scale: number;
  collisionSide?: 'player' | 'enemy';
  damageTotal?: number;
  mergeRemaining: number;
};

export class FloatingTextManager {
  private container: HTMLDivElement;
  private texts: FloatingText[] = [];
  private collisionTexts = new Map<'player' | 'enemy', FloatingText>();
  private camera: THREE.Camera;

  constructor(camera: THREE.Camera) {
    this.camera = camera;
    this.container = document.createElement('div');
    this.container.className = 'floating-text-layer';
    this.container.style.position = 'absolute';
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.pointerEvents = 'none';
    this.container.style.zIndex = '100'; // Above 3D, below some UI maybe
  }

  attach(parent: HTMLElement) {
    parent.appendChild(this.container);
  }

  detach() {
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }

  clear() {
    for (const text of this.texts) text.element.remove();
    this.texts = [];
    this.collisionTexts.clear();
  }

  spawnCollisionDamage(
    side: 'player' | 'enemy',
    amount: number,
    x: number,
    y: number,
    z: number,
    intensity: number,
  ) {
    if (amount <= 0) return;

    const active = this.collisionTexts.get(side);
    if (active && active.mergeRemaining > 0) {
      active.damageTotal = (active.damageTotal ?? 0) + amount;
      active.position.set(x, y, z);
      active.life = 0;
      active.mergeRemaining = 0.12;
      active.scale = Math.max(active.scale, 1 + Math.min(0.35, intensity * 0.16));
      active.element.textContent = `-${Math.max(1, Math.round(active.damageTotal))}`;
      active.element.style.fontSize = `${22 + Math.min(9, intensity * 5)}px`;
      return;
    }

    const element = document.createElement('div');
    element.className = 'floating-text floating-text--collision';
    element.dataset.side = side;
    element.textContent = `-${Math.max(1, Math.round(amount))}`;
    element.style.position = 'absolute';
    element.style.color = side === 'player' ? '#ff6b5f' : '#ffd166';
    element.style.fontWeight = '900';
    element.style.fontSize = `${22 + Math.min(9, intensity * 5)}px`;
    element.style.textShadow = '-1px -1px 0 #20090a, 1px -1px 0 #20090a, -1px 1px 0 #20090a, 1px 1px 0 #20090a, 0 3px 5px rgba(0, 0, 0, 0.85)';
    element.style.transform = 'translate(-50%, -50%)';
    element.style.whiteSpace = 'nowrap';
    this.container.appendChild(element);

    const text: FloatingText = {
      element,
      position: new THREE.Vector3(x, y, z),
      life: 0,
      maxLife: 1,
      velocity: new THREE.Vector2(side === 'player' ? -12 : 12, -62),
      scale: 1 + Math.min(0.35, intensity * 0.16),
      collisionSide: side,
      damageTotal: amount,
      mergeRemaining: 0.12,
    };
    this.texts.push(text);
    this.collisionTexts.set(side, text);
  }

  spawn(text: string, x: number, y: number, z: number, color: string = '#ffffff', isCrit: boolean = false) {
    const el = document.createElement('div');
    el.className = 'floating-text';
    el.innerText = text;
    el.style.position = 'absolute';
    el.style.color = color;
    el.style.fontWeight = 'bold';
    el.style.textShadow = '0 0 5px rgba(0,0,0,0.8), 0 0 10px ' + color;
    el.style.transform = 'translate(-50%, -50%)';
    el.style.whiteSpace = 'nowrap';
    
    if (isCrit) {
      el.style.fontSize = '36px';
      el.style.fontStyle = 'italic';
      el.style.animation = 'critShake 0.3s ease-in-out';
    } else {
      el.style.fontSize = '24px';
    }

    this.container.appendChild(el);

    this.texts.push({
      element: el,
      position: new THREE.Vector3(x, y, z),
      life: 0,
      maxLife: isCrit ? 1.5 : 1.0,
      velocity: new THREE.Vector2((Math.random() - 0.5) * 50, -50 - Math.random() * 50),
      scale: isCrit ? 1.5 : 1.0,
      mergeRemaining: 0,
    });
  }

  update(dt: number) {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width <= 0 || height <= 0) return;

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const ft = this.texts[i];
      ft.life += dt;
      ft.mergeRemaining = Math.max(0, ft.mergeRemaining - dt);
      
      if (ft.life >= ft.maxLife) {
        ft.element.remove();
        if (ft.collisionSide && this.collisionTexts.get(ft.collisionSide) === ft) {
          this.collisionTexts.delete(ft.collisionSide);
        }
        this.texts.splice(i, 1);
        continue;
      }

      // Project 3D to 2D
      const screenPos = ft.position.clone().project(this.camera);
      const visible = screenPos.z >= -1 && screenPos.z <= 1 && Math.abs(screenPos.x) <= 0.96 && Math.abs(screenPos.y) <= 0.96;
      ft.element.style.display = visible ? 'block' : 'none';
      if (!visible) continue;
      const px = (screenPos.x * 0.5 + 0.5) * width;
      const py = (-(screenPos.y * 0.5) + 0.5) * height;

      // Add screen space velocity
      const progress = ft.life / ft.maxLife;
      ft.velocity.y += 100 * dt; // Gravity in screen space
      const cx = px + ft.velocity.x * ft.life;
      const cy = py + ft.velocity.y * ft.life;

      // Scale and opacity
      const scale = ft.scale * (1.0 - progress * 0.3);
      const opacity = 1.0 - Math.pow(progress, 3);

      ft.element.style.left = cx + 'px';
      ft.element.style.top = cy + 'px';
      ft.element.style.transform = `translate(-50%, -50%) scale(${scale})`;
      ft.element.style.opacity = opacity.toString();
    }
  }
}
