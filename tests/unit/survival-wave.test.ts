import { describe, expect, it } from 'vitest';
import { AFFINITIES } from '../../battle-top-designer/shared/nss/affinity';
import { CAMPAIGN_OPPONENTS } from '../../src/data/campaign/opponents';
import {
  SURVIVAL_AI_PROFILE_IDS,
  SURVIVAL_ARENAS,
  generateSurvivalWave,
} from '../../src/data/survival/survivalConfig';
import { nssPartById } from '../../src/nss/catalog';

const SEED = '00112233445566778899aabbccddeeff';

describe('deterministic survival waves', () => {
  it('locks the first twenty waves for a fixed run seed', () => {
    const snapshots = Array.from({ length: 20 }, (_, index) => {
      const wave = generateSurvivalWave(SEED, index + 1, 0);
      return [wave.wave, wave.chapter, wave.type, wave.sourceOpponentId, wave.sourceLoadoutIndex,
        wave.arena, wave.aiProfileId, wave.strengthMultiplier, wave.seed];
    });
    expect(snapshots.map(row => row.join('|'))).toEqual([
      '1|1|normal|abyss-tide|1|classic_grid|fortress|1|a8c2e43efdd10476e2b052faf5a55fe3',
      '2|1|normal|abyss-tide|1|absolute_zero|skirmisher|1|58a77352d69a3c0ba6a572aeb0f4673e',
      '3|1|elite|abyss-tide|0|absolute_zero|mixup|1.12|cc02f275bd0b0978c0097fcbe88fd520',
      '4|1|elite|rift-drift|0|classic_grid|sustain|1.12|1b5d9c3416b725f13ee26139abdc8efc',
      '5|1|boss|night-eclipse|1|neon_magma|ringout|1.28|aaed80ccbe65f671f1805f53fc3eeeee',
      '6|2|normal|sky-gale|0|classic_grid|assault|1.08|3515b17472fa641068d4e7517e3d62ce',
      '7|2|normal|night-eclipse|0|absolute_zero|counter|1.08|1ae284663e1e8a16259e871b67d0fdd4',
      '8|2|elite|dawn-verdict|0|neon_magma|sustain|1.2096|f8f47794aa2ba04d3bb823d127bcd2ae',
      '9|2|elite|dawn-verdict|1|absolute_zero|skirmisher|1.2096|a7e5893518f1cb2ccd629ae425022f23',
      '10|2|boss|atlas-guardian|2|neon_magma|skirmisher|1.3824|2957cdc93691e3a14a6b09dd1823cbbd',
      '11|3|normal|forest-crown|0|classic_grid|counter|1.16|e1f27135a68271a6112114baadcdd9d8',
      '12|3|normal|abyss-tide|1|neon_magma|counter|1.16|53d291a10fb5611aea9f621bd8034169',
      '13|3|elite|atlas-guardian|0|neon_magma|sustain|1.2992|893207f62abf370794c5adefab2f899e',
      '14|3|elite|rift-drift|1|neon_magma|counter|1.2992|b3cdebb764fe57cc71b6b53fc92fb519',
      '15|3|boss|sky-gale|0|neon_magma|ringout|1.4848|f1771e3c54c8627bc4e89b6807b7ae26',
      '16|4|normal|atlas-guardian|2|absolute_zero|skirmisher|1.24|3e587305c4a945d6cc04bc7c9c222ff4',
      '17|4|normal|rift-drift|1|neon_magma|ringout|1.24|1f5b08fa6352acd64606c6283f16bf44',
      '18|4|elite|forest-crown|1|neon_magma|mixup|1.3888|cd130abc372287e47ae0d00db5313ab4',
      '19|4|elite|atlas-guardian|1|neon_magma|ringout|1.3888|4984b6702856cc52a2817a695f2ff670',
      '20|4|boss|night-eclipse|0|classic_grid|counter|1.5872|633333f4f5e088fbfc99d061ab7b7006',
    ]);
  });

  it('applies the five-wave pattern, chapter growth, risk strength, and hard cap', () => {
    expect([1, 2, 3, 4, 5].map(wave => generateSurvivalWave(SEED, wave, 0).type))
      .toEqual(['normal', 'normal', 'elite', 'elite', 'boss']);
    expect(generateSurvivalWave(SEED, 1, 0).strengthMultiplier).toBe(1);
    expect(generateSurvivalWave(SEED, 6, 0).strengthMultiplier).toBe(1.08);
    expect(generateSurvivalWave(SEED, 1, 3).strengthMultiplier).toBe(1.24);
    expect(generateSurvivalWave(SEED, 100, 3).strengthMultiplier).toBe(2);
  });

  it('is stable per seed and wave while rotating content predictably', () => {
    expect(generateSurvivalWave(SEED, 12, 2)).toEqual(generateSurvivalWave(SEED, 12, 2));
    expect(generateSurvivalWave(SEED, 12, 2)).not.toEqual(generateSurvivalWave('ffeeddccbbaa99887766554433221100', 12, 2));
    expect(generateSurvivalWave(SEED, 12, 2)).not.toEqual(generateSurvivalWave(SEED, 13, 2));
  });

  it('returns the same envelope through the server entrypoint', async () => {
    const server = await import('../../server/survival/survival-config.mjs');
    expect(server.generateSurvivalWave(SEED, 12, 2)).toEqual(generateSurvivalWave(SEED, 12, 2));
  });

  it('produces one legal enemy for the first hundred waves', () => {
    for (let waveNumber = 1; waveNumber <= 100; waveNumber += 1) {
      const wave = generateSurvivalWave(SEED, waveNumber, waveNumber % 4);
      const source = CAMPAIGN_OPPONENTS.find(opponent => opponent.id === wave.sourceOpponentId);
      const loadout = source?.loadouts[wave.sourceLoadoutIndex];
      expect(loadout).toEqual(wave.enemy);
      expect(SURVIVAL_ARENAS).toContain(wave.arena);
      expect(SURVIVAL_AI_PROFILE_IDS).toContain(wave.aiProfileId);
      expect(wave.strengthMultiplier).toBeGreaterThanOrEqual(1);
      expect(wave.strengthMultiplier).toBeLessThanOrEqual(2);
      expect(wave.seed).toMatch(/^[0-9a-f]{32}$/);
      for (const [family, partId] of Object.entries(wave.enemy.combination)) {
        expect(nssPartById.get(partId)?.family).toBe(family);
      }
      for (const affinity of Object.values(wave.enemy.affinities)) expect(AFFINITIES).toContain(affinity);
    }
  });

  it('rejects invalid deterministic boundaries', () => {
    expect(() => generateSurvivalWave('bad', 1, 0)).toThrow();
    expect(() => generateSurvivalWave(SEED, 0, 0)).toThrow();
    expect(() => generateSurvivalWave(SEED, 1, 4)).toThrow();
  });
});
