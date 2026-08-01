import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const arenaRoot = resolve(process.cwd(), '..', '..');

describe('arena UI and VFX assets', () => {
  it.each([
    'public/images/skills/attack.jpg',
    'public/images/skills/charge.jpg',
    'public/images/skills/defense.jpg',
    'public/images/skills/evade.jpg',
    'public/images/skills/reflect.jpg',
    'public/textures/vfx/circle_03.png',
    'public/textures/vfx/smoke_01.png',
    'public/textures/vfx/spark_01.png',
  ])('includes %s', (path) => {
    expect(existsSync(resolve(arenaRoot, path))).toBe(true);
  });
});
