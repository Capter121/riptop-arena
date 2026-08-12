import { describe, expect, it, vi } from 'vitest';
import type { SurvivalReward, SurvivalRun, SurvivalSettlement } from '../../src/survival/survivalClient';
import { createSurvivalHudPresentation } from '../../src/ui/hud';
import { describeSurvivalReward } from '../../src/ui/survivalRewardPanel';
import { createSurvivalResultPresentation } from '../../src/ui/survivalResults';
import { SurvivalController } from '../../src/survival/survivalController';
import { CAMPAIGN_OPPONENTS } from '../../src/data/campaign/opponents';

const playerId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const identity = { version: 1 as const, playerId, displayName: 'Nova', deviceToken: 'A'.repeat(43) };
const loadout = { schemaVersion: 2 as const, interfaceId: 'NSS-V1' as const, ...CAMPAIGN_OPPONENTS[0].loadouts[0] };

function run(status: SurvivalRun['status'] = 'wave_ready'): SurvivalRun {
  return {
    runId, configVersion: 'survival-v1', simulationVersion: 1, battleRulesVersion: 2,
    seed: 'ffeeddccbbaa99887766554433221100', status,
    player: { playerId, displayName: 'Nova', loadout, upgrades: { attack: 0, defense: 0, stamina: 0 }, maximumIntegrity: 2000 },
    wave: { configVersion: 'survival-v1', simulationVersion: 1, seed: '00112233445566778899aabbccddeeff', wave: 5, chapter: 1, type: 'boss', sourceOpponentId: CAMPAIGN_OPPONENTS[0].id, sourceLoadoutIndex: 0, enemy: loadout, arena: 'classic_grid', aiProfileId: 'assault', riskLevel: 2, strengthMultiplier: 1.44 },
    checkpoint: { currentWave: 5, integrity: 1234, burstRisk: 18, persistentDebuffs: ['scuffed'], growthLevels: { 'attack-calibration': 2, coordination: 1, 'affinity-tuning': 3, 'pickup-tuning': 0 }, nextWaveEffect: 'temporary-bulwark', riskLevel: 2, score: 2200, flawlessStreak: 1, bossesDefeated: 1 },
    finalSummary: null, createdAt: '2026-08-12T09:00:00.000Z', updatedAt: '2026-08-12T10:00:00.000Z', completedAt: null,
  };
}

const rewards: SurvivalReward[] = [
  { kind: 'growth', id: 'attack-calibration', level: 3 },
  { kind: 'instant', id: 'emergency-repair' },
  { kind: 'risk', id: 'risk-contract', level: 3 },
];

describe('survival presentation', () => {
  it('formats the authoritative HUD without deriving new score or strength', () => {
    expect(createSurvivalHudPresentation({
      wave: 5, waveType: 'boss', score: 2200, riskLevel: 2, strengthMultiplier: 1.44,
      integrity: 1234, maximumIntegrity: 2000, burstRisk: 18, persistentDebuffs: ['scuffed'],
      growthLevels: run().checkpoint.growthLevels, nextWaveEffect: 'temporary-bulwark', networkStatus: 'synced',
    })).toEqual({
      eyebrow: 'BOSS · 第 5 波', score: '2,200', risk: '风险 2', strength: '敌方 144%',
      inherited: '完整度 1,234/2,000 · 爆裂 18% · 持续状态 1',
      growth: '攻击校准 Lv.2 · 协同 Lv.1 · 属性调谐 Lv.3', temporary: '临时壁垒', network: '检查点已同步',
    });
  });

  it('describes every frozen reward family with a stable accessible label', () => {
    expect(describeSurvivalReward(rewards[0])).toMatchObject({ title: '攻击校准 Lv.3', tone: 'growth' });
    expect(describeSurvivalReward(rewards[1])).toMatchObject({ title: '紧急维修', tone: 'repair' });
    expect(describeSurvivalReward(rewards[2])).toMatchObject({ title: '风险契约 Lv.3', tone: 'risk' });
    expect(describeSurvivalReward({ kind: 'instant', id: 'temporary-endurance' }).detail).toContain('下一波');
  });

  it('renders confirmed scoring, milestone, and final summary only from settlement data', () => {
    const completed = { ...run('completed'), finalSummary: { score: 4200, highestCompletedWave: 4, bossesDefeated: 1, finalIntegrity: 0, riskLevel: 2, achievedAt: '2026-08-12T10:00:00.000Z', abandoned: false }, completedAt: '2026-08-12T10:00:00.000Z' };
    const view = createSurvivalResultPresentation({
      run: completed,
      score: { base: 100, waveTypeBonus: 200, finishBonus: 50, flawlessBonus: 0, flawlessStreakBonus: 0, subtotal: 350, riskMultiplier: 1.55, score: 543 },
      rewardOptions: [], milestone: { wave: 5, coins: 100, eventId: '33333333-3333-4333-8333-333333333333' }, progression: {} as never,
    });
    expect(view).toMatchObject({ title: '生存运行结束', totalScore: '4,200', highestWave: '4', bosses: '1', finalIntegrity: '0', risk: '2', milestone: '第 5 波里程碑 · +100 金币' });
    expect(view.scoreLines).toContain('本波得分 +543');
    expect(view.loadout).toContain(completed.player.loadout.combination.core);
    expect(view.growthRoute).toBe('攻击校准 Lv.2 · 协同 Lv.1 · 属性调谐 Lv.3');
  });

  it('submits one frozen reward once and returns the authoritative next wave', async () => {
    const next = { ...run(), wave: { ...run().wave, wave: 6 }, checkpoint: { ...run().checkpoint, currentWave: 6 } };
    const selectReward = vi.fn().mockResolvedValue({ run: next });
    const controller = new SurvivalController(run(), identity, { selectReward } as never);
    const first = controller.selectReward(rewards, rewards[0], { randomUUID: () => '44444444-4444-4444-8444-444444444444' });
    const second = controller.selectReward(rewards, rewards[0]);
    expect(second).toBe(first);
    await expect(first).resolves.toEqual({ status: 'selected', run: next });
    expect(selectReward).toHaveBeenCalledTimes(1);
    expect(selectReward.mock.calls[0][2]).toEqual({ requestId: '44444444-4444-4444-8444-444444444444', reward: rewards[0] });
  });

  it('rejects non-frozen rewards locally and allows retry after a network failure', async () => {
    const selectReward = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce({ run: run() });
    const controller = new SurvivalController(run(), identity, { selectReward } as never);
    await expect(controller.selectReward(rewards, { kind: 'instant', id: 'burst-vent' })).resolves.toEqual({ status: 'invalid' });
    await expect(controller.selectReward(rewards, rewards[0])).resolves.toEqual({ status: 'pending' });
    await expect(controller.selectReward(rewards, rewards[0])).resolves.toMatchObject({ status: 'selected' });
    expect(selectReward).toHaveBeenCalledTimes(2);
    expect(selectReward.mock.calls[0][2].requestId).toBe(selectReward.mock.calls[1][2].requestId);
  });
});
