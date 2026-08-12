import type { SurvivalSettlement } from '../survival/survivalClient';

export function createSurvivalResultPresentation(settlement: SurvivalSettlement) {
  const summary = settlement.run.finalSummary;
  const loadout = settlement.run.player.loadout.combination;
  const growth = settlement.run.checkpoint.growthLevels;
  const growthNames = { 'attack-calibration': '攻击校准', coordination: '协同', 'affinity-tuning': '属性调谐', 'pickup-tuning': '补给调谐' } as const;
  return {
    title: summary?.abandoned ? '生存运行已放弃' : '生存运行结束',
    totalScore: (summary?.score ?? settlement.run.checkpoint.score).toLocaleString('zh-CN'),
    highestWave: String(summary?.highestCompletedWave ?? Math.max(0, settlement.run.wave.wave - 1)),
    bosses: String(summary?.bossesDefeated ?? settlement.run.checkpoint.bossesDefeated),
    finalIntegrity: String(Math.round(summary?.finalIntegrity ?? settlement.run.checkpoint.integrity)),
    risk: String(summary?.riskLevel ?? settlement.run.checkpoint.riskLevel),
    scoreLines: [
      `本波得分 +${settlement.score.score}`,
      `基础 ${settlement.score.base} · 波次 ${settlement.score.waveTypeBonus} · 终结 ${settlement.score.finishBonus}`,
      `无伤 ${settlement.score.flawlessBonus} · 连续无伤 ${settlement.score.flawlessStreakBonus} · 风险 ×${settlement.score.riskMultiplier}`,
    ],
    milestone: settlement.milestone ? `第 ${settlement.milestone.wave} 波里程碑 · +${settlement.milestone.coins} 金币` : '',
    loadout: `核心 ${loadout.core} · 刃环 ${loadout.blade} · 辅件 ${loadout.assist} · 齿轮 ${loadout.gear} · 轴尖 ${loadout.tip}`,
    growthRoute: (Object.keys(growth) as Array<keyof typeof growth>)
      .filter(id => growth[id] > 0)
      .map(id => `${growthNames[id]} Lv.${growth[id]}`)
      .join(' · ') || '本次运行未获得局内强化',
  };
}

export class SurvivalResults {
  readonly root = document.createElement('section');

  constructor() {
    this.root.className = 'survival-summary';
    this.root.style.display = 'none';
  }

  show(settlement: SurvivalSettlement, onReturn: () => void) {
    const view = createSurvivalResultPresentation(settlement);
    this.root.replaceChildren();
    const eyebrow = document.createElement('div'); eyebrow.className = 'survival-summary__eyebrow'; eyebrow.textContent = 'RUN SUMMARY';
    const title = document.createElement('h2'); title.textContent = view.title;
    const score = document.createElement('strong'); score.className = 'survival-summary__score'; score.textContent = view.totalScore;
    const scoreLabel = document.createElement('span'); scoreLabel.className = 'survival-summary__score-label'; scoreLabel.textContent = '最终得分';
    const metrics = document.createElement('div'); metrics.className = 'survival-summary__metrics';
    for (const [label, value] of [['完成波次', view.highestWave], ['击败 BOSS', view.bosses], ['最终完整度', view.finalIntegrity], ['风险等级', view.risk]]) {
      const item = document.createElement('div');
      const name = document.createElement('span'); name.textContent = label;
      const amount = document.createElement('strong'); amount.textContent = value;
      item.append(name, amount); metrics.append(item);
    }
    const breakdown = document.createElement('div'); breakdown.className = 'survival-summary__breakdown';
    for (const line of view.scoreLines) { const row = document.createElement('div'); row.textContent = line; breakdown.append(row); }
    const milestone = document.createElement('p'); milestone.className = 'survival-summary__milestone'; milestone.textContent = view.milestone;
    milestone.style.display = view.milestone ? '' : 'none';
    const loadout = document.createElement('p'); loadout.className = 'survival-summary__loadout'; loadout.textContent = `冻结装配 · ${view.loadout}`;
    const growth = document.createElement('p'); growth.className = 'survival-summary__growth'; growth.textContent = `强化路线 · ${view.growthRoute}`;
    const back = document.createElement('button'); back.className = 'button button--primary'; back.textContent = '返回生存中心'; back.addEventListener('click', onReturn);
    this.root.append(eyebrow, title, scoreLabel, score, metrics, breakdown, milestone, loadout, growth, back);
    this.root.style.display = 'grid';
  }

  hide() { this.root.style.display = 'none'; }
}
