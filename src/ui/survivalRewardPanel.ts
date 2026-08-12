import type { SurvivalReward, SurvivalSettlement } from '../survival/survivalClient';

const REWARDS = {
  'attack-calibration': ['攻击校准', '提高所有输出，每级 +6%。', 'growth'],
  coordination: ['协同调校', '提高稳定性与转速效率。', 'growth'],
  'affinity-tuning': ['属性调谐', '放大现有属性共鸣与克制效果。', 'growth'],
  'pickup-tuning': ['补给调谐', '提高生存补给恢复量。', 'growth'],
  'emergency-repair': ['紧急维修', '立即恢复最大完整度的 18%。', 'repair'],
  'burst-vent': ['爆裂泄压', '爆裂风险降低 15，并清除一个持续状态。', 'repair'],
  'temporary-overdrive': ['临时超频', '下一波输出与机动提高 10%。', 'temporary'],
  'temporary-bulwark': ['临时壁垒', '下一波防御与稳定性提高 10%。', 'temporary'],
  'temporary-endurance': ['临时耐久', '下一波转速效率与补给效果提高 10%。', 'temporary'],
  'risk-contract': ['风险契约', '提高后续敌人强度，同时提高得分倍率。', 'risk'],
} as const;

export function describeSurvivalReward(reward: SurvivalReward) {
  const [name, detail, tone] = REWARDS[reward.id];
  return {
    title: reward.kind === 'growth' || reward.kind === 'risk' ? `${name} Lv.${reward.level}` : name,
    detail,
    tone,
  };
}

export class SurvivalRewardPanel {
  readonly root = document.createElement('section');
  private readonly status = document.createElement('p');
  private readonly choices = document.createElement('div');
  private readonly next = document.createElement('button');
  private choose: ((reward: SurvivalReward) => void) | null = null;

  constructor() {
    this.root.className = 'survival-reward';
    this.root.style.display = 'none';
    this.status.className = 'survival-reward__status';
    this.choices.className = 'survival-reward__choices';
    this.next.className = 'button button--primary survival-reward__next';
    this.next.textContent = '进入下一波';
    this.next.style.display = 'none';
    const eyebrow = document.createElement('div'); eyebrow.className = 'survival-reward__eyebrow'; eyebrow.textContent = 'CHECKPOINT REWARD';
    const title = document.createElement('h2'); title.textContent = '选择一项生存强化';
    const hint = document.createElement('p'); hint.textContent = '奖励已由服务器冻结。确认后才会生成下一波。';
    this.root.append(eyebrow, title, hint, this.status, this.choices, this.next);
  }

  bind(onChoose: (reward: SurvivalReward) => void, onNext: () => void) {
    this.choose = onChoose;
    this.next.addEventListener('click', onNext);
  }

  show(settlement: SurvivalSettlement) {
    this.root.style.display = 'grid';
    const milestone = settlement.milestone ? ` · 里程碑 +${settlement.milestone.coins} 金币` : '';
    this.status.textContent = `第 ${settlement.run.wave.wave} 波已确认 · 本波 +${settlement.score.score} · 累计 ${settlement.run.checkpoint.score}${milestone}`;
    this.choices.replaceChildren();
    for (const reward of settlement.rewardOptions) {
      const view = describeSurvivalReward(reward);
      const button = document.createElement('button');
      button.className = 'survival-reward__choice';
      button.dataset.tone = view.tone;
      button.setAttribute('aria-label', `选择奖励：${view.title}`);
      const title = document.createElement('strong'); title.textContent = view.title;
      const detail = document.createElement('span'); detail.textContent = view.detail;
      button.append(title, detail);
      button.addEventListener('click', () => this.choose?.(reward));
      this.choices.append(button);
    }
    this.setBusy(false);
    this.next.style.display = 'none';
  }

  setBusy(busy: boolean, message = busy ? '正在确认奖励…' : '') {
    for (const button of this.choices.querySelectorAll('button')) button.disabled = busy;
    if (message) this.status.textContent = message;
  }

  setError(message: string) {
    this.setBusy(false, message);
  }

  setSelected(title: string) {
    this.setBusy(true, `${title} 已确认，下一波检查点已生成。`);
    this.next.style.display = '';
    this.next.focus();
  }

  hide() {
    this.root.style.display = 'none';
  }
}
