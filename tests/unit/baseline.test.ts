import { describe, expect, it } from 'vitest';
import battleParts from '../../battle-top-designer/shared/nss/battle-parts.json';

describe('root test harness', () => {
  it('loads the shared NSS battle catalog in a Node test environment', () => {
    expect(typeof document).toBe('undefined');
    expect(battleParts.schemaVersion).toBe(1);
    expect(battleParts.parts).toHaveLength(16);
  });
});
