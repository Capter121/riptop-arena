import * as THREE from 'three';

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];

export const vec2 = (x = 0, y = 0) => new THREE.Vector2(x, y);
