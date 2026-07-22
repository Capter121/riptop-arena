import { describe, expect, it } from 'vitest';
import { visualIdentityRegistry } from '../../src/rendering/visualIdentityRegistry';

describe('visual identity registry', () => {
  it('defines the six approved identities with unique part bindings', () => {
    expect(visualIdentityRegistry.map(identity => identity.id)).toEqual(['solar_wolf', 'void_falcon', 'storm_fang', 'iron_bastion', 'orbit_halo', 'dual_comet']);
    expect(new Set(visualIdentityRegistry.map(identity => identity.partId)).size).toBe(6);
  });

  it('uses only local SVG sources and approved renderer types', () => {
    for (const identity of visualIdentityRegistry) {
      expect(identity.texturePath).toMatch(/^\.\.\/\.\.\/design\/visual-identity\/.+\.svg$/);
      expect(['core-badge', 'blade-sector', 'blade-ring']).toContain(identity.layerType);
      expect(identity.materialPolicy).toBe('transparent-overlay');
    }
  });

  it('keeps every identity within its approved attachment budget', () => {
    for (const identity of visualIdentityRegistry) {
      expect(identity.meshBudget).toBeGreaterThan(0);
      expect(identity.drawCallBudget).toBe(identity.meshBudget);
    }
    expect(Math.max(...visualIdentityRegistry.filter(identity => identity.layerType !== 'core-badge').map(identity => identity.drawCallBudget))).toBe(3);
  });
});
