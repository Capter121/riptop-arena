import { globalInventory } from '../data/inventoryManager';
import { BASE_COMPONENTS } from '../data/recipes';
import { ELEMENT_COLORS, type MaterialTier, TIER_MULTIPLIERS } from '../types/shopItems';

export class BlackMarketPanel {
  public readonly root = document.createElement('section');
  private readonly content = document.createElement('div');
  private readonly header = document.createElement('div');
  private readonly grid = document.createElement('div');
  private readonly closeBtn = document.createElement('button');
  private readonly refreshBtn = document.createElement('button');
  private readonly coinsDisplay = document.createElement('div');

  private currentCoins = 0;
  private onPurchase?: (cost: number) => void;
  private onCoinsNeeded?: () => number;

  constructor() {
    this.root.className = 'black-market hidden';
    this.content.className = 'bm-content';
    
    this.header.className = 'bm-header';
    const title = document.createElement('h1');
    title.textContent = '黑色商城';
    title.className = 'bm-title';
    
    this.coinsDisplay.className = 'bm-coins';
    
    this.closeBtn.className = 'button';
    this.closeBtn.textContent = '返回大厅';
    this.closeBtn.onclick = () => this.close();
    
    this.refreshBtn.className = 'button button--warning bm-refresh';
    this.refreshBtn.onclick = () => this.handleRefresh();
    
    this.header.append(title, this.coinsDisplay, this.refreshBtn, this.closeBtn);
    
    this.grid.className = 'bm-grid';
    
    this.content.append(this.header, this.grid);
    this.root.append(this.content);
  }

  public open(onPurchase: (cost: number) => void, onCoinsNeeded: () => number) {
    this.onPurchase = onPurchase;
    this.onCoinsNeeded = onCoinsNeeded;
    this.updateCoins();
    this.renderGrid();
    this.root.classList.remove('hidden');
  }

  public close() {
    this.root.classList.add('hidden');
  }

  private updateCoins() {
    if (this.onCoinsNeeded) {
      this.currentCoins = this.onCoinsNeeded();
    }
    this.coinsDisplay.textContent = `💰 ${this.currentCoins}`;
    this.updateRefreshButton();
  }

  private updateRefreshButton() {
    const cost = globalInventory.getRefreshCost();
    this.refreshBtn.textContent = cost === 0 ? '刷新货架 (免费)' : `刷新货架 (💰${cost})`;
  }

  private handleRefresh() {
    const cost = globalInventory.getRefreshCost();
    if (this.currentCoins < cost) {
      this.showToast('金币不足以刷新！');
      return;
    }
    if (cost > 0 && this.onPurchase) {
      this.onPurchase(cost);
    }
    globalInventory.refreshMarket();
    this.updateCoins();
    this.renderGrid();
  }

  private renderGrid() {
    this.grid.innerHTML = '';
    const items = globalInventory.marketItems;

    items.forEach((slot, index) => {
      const card = document.createElement('div');
      card.className = `bm-card tier-${slot.item.tier.toLowerCase()}`;
      if (slot.sold) card.classList.add('sold');

      const base = BASE_COMPONENTS[slot.item.baseTemplateId];
      const elColor = ELEMENT_COLORS[slot.item.attribute];
      const tierName = this.getTierName(slot.item.tier);
      const elName = this.getElementName(slot.item.attribute);

      const categoryIcons: Record<string, string> = {
        'CHIP': '💠', 'LAYER': '💿', 'DISC': '⚙️', 'DRIVER': '🔧', 'LAUNCHER': '🔫'
      };
      const catIcon = base ? (categoryIcons[base.category] || '📦') : '📦';

      // Mock base stats since BaseComponent doesn't have them
      const baseStats = { attack: 10, defense: 10, stamina: 10 };

      card.innerHTML = `
        <div class="bm-card-header">
          <span class="bm-tier-badge" style="color: ${elColor}">【${tierName}·${elName}】</span>
        </div>
        <div class="bm-icon-wrapper">
          <div class="bm-icon">${catIcon}</div>
          ${slot.sold ? '<div class="sold-stamp">SOLD</div>' : ''}
        </div>
        <div class="bm-item-name">${base?.name || '未知零件'}</div>
        <div class="bm-stats">
          <div>ATK: ${Math.floor(baseStats.attack * TIER_MULTIPLIERS[slot.item.tier])}</div>
          <div>DEF: ${Math.floor(baseStats.defense * TIER_MULTIPLIERS[slot.item.tier])}</div>
          <div>STA: ${Math.floor(baseStats.stamina * TIER_MULTIPLIERS[slot.item.tier])}</div>
        </div>
        ${this.getPerkHtml(slot.item.tier)}
      `;

      const buyBtn = document.createElement('button');
      buyBtn.className = 'button button--primary bm-buy-btn';
      buyBtn.textContent = slot.sold ? '已售出' : `💰 ${slot.price}`;
      buyBtn.disabled = slot.sold;

      buyBtn.onclick = () => {
        const rect = buyBtn.getBoundingClientRect();
        this.handlePurchase(index, rect.left + rect.width / 2, rect.top + rect.height / 2);
      };

      card.append(buyBtn);
      this.grid.append(card);
    });
  }

  private handlePurchase(index: number, x: number, y: number) {
    this.updateCoins();
    const result = globalInventory.purchaseMarketItem(index, this.currentCoins);
    if (result.success) {
      if (this.onPurchase) {
        this.onPurchase(result.cost!);
      }
      this.updateCoins();
      this.spawnParticles(x, y);
      this.renderGrid();
    } else {
      this.showToast(result.error || '购买失败');
    }
  }

  private spawnParticles(x: number, y: number) {
    const p = document.createElement('div');
    p.className = 'bm-particle';
    p.textContent = '📦';
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    document.body.appendChild(p);

    // Target the forge/garage button generally (bottom left usually)
    const targetX = 50;
    const targetY = window.innerHeight - 50;

    requestAnimationFrame(() => {
      p.style.transform = `translate(${targetX - x}px, ${targetY - y}px) scale(0)`;
      p.style.opacity = '0';
    });

    setTimeout(() => {
      p.remove();
    }, 800);
  }

  private showToast(msg: string) {
    const toast = document.createElement('div');
    toast.className = 'bm-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  private getTierName(tier: MaterialTier): string {
    const names: Record<MaterialTier, string> = {
      COMMON: '普通', REFINED: '精良', RARE: '稀有', LEGENDARY: '传说', MYTHIC: '神话'
    };
    return names[tier] || tier;
  }

  private getElementName(attr: string): string {
    const names: Record<string, string> = {
      WIND: '风', WATER: '水', ROCK: '岩', LIGHTNING: '电', FIRE: '火', DARK: '暗', LIGHT: '光', DIVINE: '神'
    };
    return names[attr] || attr;
  }

  private getPerkHtml(tier: MaterialTier): string {
    if (tier === 'MYTHIC') {
      return '<div class="bm-perk mythic-perk">15%几率触发核心卡顿，打断对方动作</div>';
    } else if (tier === 'LEGENDARY') {
      return '<div class="bm-perk legendary-perk">10%几率无视防御造成真实伤害</div>';
    } else if (tier === 'RARE') {
      return '<div class="bm-perk rare-perk">受到暴击时，减少5%承受伤害</div>';
    }
    return '<div class="bm-perk empty-perk">无附加特技</div>';
  }
}
