import type { Part } from '../data/parts';
import type { BattleResult } from '../gameplay/rules';

const RARITY_NAMES: Record<Part['rarity'], string> = {
  starter: '初始',
  rare: '稀有',
  epic: '史诗',
};

const SLOT_NAMES: Record<string, string> = {
  attackRing: '攻击环',
  core: '核心轴',
  driver: '驱动底盘',
};

export interface ResultRenderMeta {
  modeLabel?: string;
  enemyName?: string;
  growthTitle?: string;
  growthLines?: string[];
}

export class ResultPanel {
  readonly root = document.createElement('section');
  readonly kicker = document.createElement('div');
  readonly title = document.createElement('h2');
  readonly badge = document.createElement('div');
  readonly body = document.createElement('p');
  readonly coins = document.createElement('div');
  readonly summary = document.createElement('div');
  readonly growth = document.createElement('div');
  readonly reward = document.createElement('p');
  readonly champion = document.createElement('div');
  readonly unlockCard = document.createElement('div');
  readonly retry = document.createElement('button');
  readonly garage = document.createElement('button');

  constructor() {
    this.root.className = 'card results';
    this.kicker.className = 'results__kicker';
    this.badge.className = 'results__badge';
    this.coins.className = 'coin-reward';
    this.summary.className = 'results__summary';
    this.growth.className = 'results__growth';
    this.reward.className = 'results__reward';
    this.champion.className = 'champion-panel';
    this.unlockCard.className = 'unlock-card';
    this.retry.className = 'button button--primary';
    this.retry.textContent = '继续';
    this.garage.className = 'button';
    this.garage.textContent = '返回改装库';
    this.root.append(
      this.kicker,
      this.title,
      this.badge,
      this.body,
      this.coins,
      this.summary,
      this.growth,
      this.reward,
      this.champion,
      this.unlockCard,
      this.retry,
      this.garage,
    );
  }

  render(
    result: BattleResult,
    rewardText = '',
    retryLabel = '再战',
    unlockedPart: Part | null = null,
    championData: { title: string; body: string } | null = null,
    coinReward = 0,
    coinBalance = 0,
    meta: ResultRenderMeta = {},
  ) {
    const won = result.winner === 'player';
    const modeLabel = meta.modeLabel ?? '快速战斗';
    const enemyName = meta.enemyName ?? '对手';
    const growthTitle = meta.growthTitle ?? '本局成长变化';
    const growthLines = meta.growthLines ?? [];

    this.root.dataset.outcome = won ? 'win' : 'lose';
    this.kicker.textContent = won ? '胜利结算' : '战斗报告';
    this.title.textContent = won ? '胜利' : '战败';
    this.badge.textContent = result.label;
    this.body.textContent = won
      ? `你在这场 ${modeLabel} 中压制了 ${enemyName}，本局收益已经结算，可以继续推进养成。`
      : `${enemyName} 在这场 ${modeLabel} 中打乱了你的节奏。调整部件配置和起手路线后，再来一轮。`;

    this.coins.style.display = coinReward > 0 ? 'grid' : 'none';
    this.coins.innerHTML = coinReward > 0
      ? `
        <div class="coin-reward__label">本局赏金</div>
        <div class="coin-reward__amount">+${coinReward} 金币</div>
        <div class="coin-reward__balance">当前余额：${coinBalance} 金币</div>
      `
      : '';

    const settlementItems = [
      { label: '战斗模式', value: modeLabel },
      { label: '终结方式', value: result.label },
      { label: '结算状态', value: won ? '奖励已入账' : '继续调整后再战' },
    ];
    this.summary.innerHTML = settlementItems
      .map(
        (item) => `
          <div class="results__summary-item">
            <span>${item.label}</span>
            <strong>${item.value}</strong>
          </div>
        `,
      )
      .join('');

    this.growth.style.display = growthLines.length > 0 ? 'grid' : 'none';
    this.growth.innerHTML = growthLines.length > 0
      ? `
        <div class="results__growth-title">${growthTitle}</div>
        <div class="results__growth-list">
          ${growthLines.map((line) => `<div class="results__growth-item">${line}</div>`).join('')}
        </div>
      `
      : '';

    this.reward.textContent = rewardText;
    this.retry.textContent = retryLabel;
    this.reward.style.display = rewardText ? 'block' : 'none';
    this.champion.style.display = championData ? 'grid' : 'none';
    this.champion.innerHTML = championData
      ? `
        <div class="champion-panel__kicker">新冠军诞生</div>
        <div class="champion-panel__title">${championData.title}</div>
        <div class="champion-panel__body">${championData.body}</div>
      `
      : '';
    this.unlockCard.style.display = unlockedPart ? 'grid' : 'none';

    if (unlockedPart) {
      this.unlockCard.className = `unlock-card unlock-card--${unlockedPart.rarity}`;
      this.unlockCard.innerHTML = `
        <div class="unlock-card__kicker">新部件解锁</div>
        <div class="unlock-card__name">${unlockedPart.name}</div>
        <div class="unlock-card__meta">${SLOT_NAMES[unlockedPart.slot] || unlockedPart.slot} · ${RARITY_NAMES[unlockedPart.rarity]}</div>
        <div class="unlock-card__desc">${unlockedPart.description}</div>
      `;
    } else {
      this.unlockCard.className = 'unlock-card';
      this.unlockCard.innerHTML = '';
    }
  }
}
