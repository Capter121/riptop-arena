import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const OUTCOME_MODULES = [
  'src/gameplay/damage.ts',
  'src/gameplay/battlePhysics.ts',
  'src/gameplay/ai.ts',
  'src/gameplay/clashAI.ts',
  'src/gameplay/pickups.ts',
];

describe('outcome random guard', () => {
  it.each(OUTCOME_MODULES)('%s has no global random fallback', (path) => {
    expect(readFileSync(path, 'utf8')).not.toContain('Math.random');
  });
});
