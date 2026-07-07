import type { PartUpgradeLevels } from '../app/progression';
import { type NewBuildSelection } from '../data/parts';
import { RadarChart } from './radar';
import { type ComponentCategory, type InstanceComponent, ELEMENT_COLORS } from '../types/shopItems';
import { BASE_COMPONENTS } from '../data/recipes';
import { globalInventory } from '../data/inventoryManager';

const SLOT_NAMES: Record<ComponentCategory, string> = {
  CHIP: '核心晶片 (Chip)',
  LAYER: '战术上盖 (Layer)',
  DISC: '配重中盘 (Disc)',
  DRIVER: '驱动底轴 (Driver)',
  LAUNCHER: '发射器 (Launcher)',
};

export class GaragePanel {
  readonly root = document.createElement('section');
  readonly selects = new Map<ComponentCategory, HTMLSelectElement>();
  readonly stats = document.createElement('div');
  readonly radar = new RadarChart();
  readonly summary = document.createElement('div');
  readonly wallet = document.createElement('div');
  readonly progress = document.createElement('div');
  readonly collection = document.createElement('div');
  readonly battleButton = document.createElement('button');
  readonly shopButton = document.createElement('button');
  readonly backButton = document.createElement('button');

  constructor() {
    this.root.className = 'card garage';

    this.backButton.className = 'button garage-back';
    this.backButton.innerHTML = '&larr; 返回主菜单';

    const title = document.createElement('h2');
    title.textContent = '神装改装库';
    const intro = document.createElement('p');
    intro.textContent = '配置你的 5 大次世代部件！不同阶级与元素的附魔将彻底改变你的战斗流派。';

    const rulesInfo = document.createElement('div');
    rulesInfo.className = 'garage-rules';
    rulesInfo.innerHTML = `
      <h3>📖 战斗规则与胜负条件</h3>
      <ul>
        <li><strong>💥 爆裂终结 (Burst Finish)</strong>：对方完整度降至 0。直接击碎对手！</li>
        <li><strong>🌀 停转终结 (Spin Finish)</strong>：对方转速降至 0。耗尽对手的体力！</li>
        <li><strong>🏟️ 击出场外 (Ring Out)</strong>：将对方撞出危险区域。</li>
        <li><strong>⏱️ 生存终结 (Timeout)</strong>：时间耗尽时，转速与完整度评分高者获胜。</li>
      </ul>
    `;

    this.root.append(this.backButton, title, intro, rulesInfo);

    this.wallet.className = 'garage-wallet';
    this.root.append(this.wallet);

    (['CHIP', 'LAYER', 'DISC', 'DRIVER', 'LAUNCHER'] as ComponentCategory[]).forEach((slot) => {
      const wrap = document.createElement('label');
      wrap.className = 'field';
      const span = document.createElement('span');
      span.textContent = SLOT_NAMES[slot];
      const select = document.createElement('select');
      
      this.selects.set(slot, select);
      wrap.append(span, select);
      this.root.appendChild(wrap);
    });

    this.progress.className = 'garage-progress';
    this.stats.className = 'garage-stats';
    this.summary.className = 'garage-summary';
    this.summary.innerHTML = '<div class="garage-summary__empty">选择配置后，这里会显示总加成摘要。</div>';
    this.stats.append(this.radar.canvas, this.summary);
    this.collection.className = 'collection';
    this.shopButton.className = 'button';
    this.shopButton.textContent = '进入黑市商城';
    this.battleButton.className = 'button button--primary';
    this.battleButton.textContent = '进入竞技场';
    this.root.append(this.progress, this.stats, this.collection, this.shopButton, this.battleButton);
  }

  refreshOptions(currentBuild: NewBuildSelection) {
    const items = globalInventory.getItems();
    for (const [slot, select] of this.selects) {
      const currentVal = select.value || currentBuild[slot];
      select.innerHTML = '';
      
      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = '-- 未装备 --';
      select.appendChild(emptyOpt);

      const slotItems = items.filter(it => it.category === slot);
      for (const item of slotItems) {
        // Prevent equipping if it's already equipped on another top (for future multi-top support)
        if (item.equippedOnTopId && currentBuild[slot] !== item.instanceId) continue;

        const base = BASE_COMPONENTS[item.baseTemplateId];
        const opt = document.createElement('option');
        opt.value = item.instanceId;
        opt.textContent = `[${item.tier}] ${base ? base.name : item.baseTemplateId} (${item.attribute})`;
        select.appendChild(opt);
      }
      select.value = currentVal || '';
    }
  }

  readBuild(): NewBuildSelection {
    return {
      CHIP: this.selects.get('CHIP')!.value || null,
      LAYER: this.selects.get('LAYER')!.value || null,
      DISC: this.selects.get('DISC')!.value || null,
      DRIVER: this.selects.get('DRIVER')!.value || null,
      LAUNCHER: this.selects.get('LAUNCHER')!.value || null,
    };
  }

  setCoins(coins: number) {
    this.wallet.innerHTML = `
      <span>金币余额</span>
      <strong>${coins} 金币</strong>
    `;
  }

  setProgress(text: string) {
    this.progress.textContent = text;
  }

  setSummary(title: string, lines: string[]) {
    this.summary.innerHTML = `
      <div class="garage-summary__title">${title}</div>
      <div class="garage-summary__grid">
        ${lines.map((line) => `<div class="garage-summary__item">${line}</div>`).join('')}
      </div>
    `;
  }

  renderCollection() {
    this.collection.innerHTML = '<div class="collection__title">我的神装仓库 (共 ' + globalInventory.getItems().length + ' 件)</div>';
  }
}
