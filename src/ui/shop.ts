import type {
  UpgradeKey,
  UpgradeLevels,
} from '../app/progression';
import { type InstanceComponent, ELEMENT_COLORS } from '../types/shopItems';
import { BASE_COMPONENTS } from '../data/recipes';

const UPGRADE_LABELS: Record<UpgradeKey, { name: string; desc: string }> = {
  attack: { name: '攻击调校', desc: '提升冲击输出，让碰撞更具压制性。' },
  defense: { name: '防御装甲', desc: '提升耐久与抗爆能力，增加正面换血容错。' },
  stamina: { name: '续航核心', desc: '提升旋转续航与机动保持能力。' },
};

export class ShopPanel {
  readonly root = document.createElement('section');
  readonly backButton = document.createElement('button');
  readonly garageButton = document.createElement('button');
  readonly wallet = document.createElement('div');
  readonly notice = document.createElement('div');
  readonly upgrades = document.createElement('div');
  readonly blackMarket = document.createElement('div');
  readonly unboxingOverlay = document.createElement('div');

  constructor() {
    this.root.className = 'card shop';
    this.backButton.className = 'button garage-back';
    this.backButton.innerHTML = '&larr; 返回改装库';

    const title = document.createElement('h2');
    title.textContent = '黑市商城';

    const intro = document.createElement('p');
    intro.textContent = '在这里购买基础盲盒或搜刮随机刷新的极品词条装备。';

    this.wallet.className = 'garage-wallet';
    this.notice.className = 'garage-progress';
    this.upgrades.className = 'shop-upgrades';
    this.blackMarket.className = 'shop-grid';
    this.garageButton.className = 'button button--primary';
    this.garageButton.textContent = '返回改装并装配';

    this.unboxingOverlay.className = 'unboxing-overlay';
    this.unboxingOverlay.innerHTML = `
      <div class="unboxing-box" id="unboxing-box">
         <div class="unboxing-content" style="display:none; flex-direction:column; align-items:center; color:#fff; padding: 20px; text-align:center;">
           <h3 id="ub-name" style="margin:0; font-size: 1.5rem; color:#ffaa00; text-shadow: 0 0 10px rgba(255,170,0,0.5);"></h3>
           <p id="ub-tier" style="margin:10px 0; font-weight:bold;"></p>
           <p id="ub-desc" style="margin:0; font-size: 0.9rem; color:#aaa;"></p>
         </div>
      </div>
    `;
    this.unboxingOverlay.addEventListener('click', () => {
      this.skipUnboxing();
    });

    this.root.append(this.backButton, title, intro, this.wallet, this.notice, this.upgrades, this.blackMarket, this.garageButton, this.unboxingOverlay);
  }

  setCoins(coins: number) {
    this.wallet.innerHTML = `
      <span>金币余额</span>
      <strong>${coins} 金币</strong>
    `;
  }

  setNotice(text: string) {
    this.notice.textContent = text;
  }

  renderCatalog(
    upgrades: UpgradeLevels,
    getUpgradeCost: (key: UpgradeKey) => number,
    canUpgrade: (key: UpgradeKey) => boolean,
    getUpgradePreview: (key: UpgradeKey) => string[],
    onUpgrade: (key: UpgradeKey) => void,
    blackMarketItems: InstanceComponent[],
    onPurchaseBlackMarket: (item: InstanceComponent, index: number, cost: number) => void,
    onPurchaseBlindBox: () => InstanceComponent | null
  ) {
    this.upgrades.innerHTML = '';
    this.blackMarket.innerHTML = '';

    // Upgrades
    for (const key of Object.keys(UPGRADE_LABELS) as UpgradeKey[]) {
      const meta = UPGRADE_LABELS[key];
      const currentLevel = upgrades[key];
      const capped = !canUpgrade(key);
      const card = document.createElement('article');
      card.className = `shop-card shop-card--owned${capped ? ' shop-card--capped' : ''}`;

      const button = document.createElement('button');
      button.className = capped ? 'button' : 'button button--primary';
      button.disabled = capped;
      button.textContent = capped ? '已满级' : `强化 Lv.${currentLevel + 1} · ${getUpgradeCost(key)} 金币`;
      if (!capped) {
        button.addEventListener('click', () => onUpgrade(key));
      }

      card.innerHTML = `
        <div class="shop-card__head">
          <strong>${meta.name}</strong>
          <span>整机升级</span>
        </div>
        <div class="shop-card__level-row">
          <div class="shop-card__level">Lv.${currentLevel}</div>
          <div class="shop-card__status">${capped ? 'MAX' : '可强化'}</div>
        </div>
        <div class="shop-card__desc">${meta.desc}</div>
        <div class="shop-card__preview">
          ${getUpgradePreview(key).map((line) => `<span>${line}</span>`).join('')}
        </div>
      `;
      card.appendChild(button);
      this.upgrades.appendChild(card);
    }

    // Blind Box
    const group1 = document.createElement('section');
    group1.className = 'collection__group';
    group1.innerHTML = '<div class="collection__title">基础物资 (图纸盲盒)</div>';
    const boxGrid = document.createElement('div');
    boxGrid.className = 'shop-grid__row';
    const blindBoxCard = document.createElement('article');
    blindBoxCard.className = 'shop-card shop-card--starter';
    const bbBtn = document.createElement('button');
    bbBtn.className = 'button button--primary';
    bbBtn.textContent = '抽取基础组件 (150 金币)';
    bbBtn.onclick = async () => {
      bbBtn.disabled = true;
      const item = onPurchaseBlindBox();
      if (item) {
        const base = BASE_COMPONENTS[item.baseTemplateId];
        await this.triggerUnboxing(item, base);
      }
      bbBtn.disabled = false;
    };
    blindBoxCard.innerHTML = `
        <div class="shop-card__head">
          <strong>神秘包裹</strong>
          <span>COMMON</span>
        </div>
        <div class="shop-card__desc">随机获得一件基础(COMMON)品质的零件。是铁匠铺初级合成的必需品！</div>
    `;
    blindBoxCard.appendChild(bbBtn);
    boxGrid.appendChild(blindBoxCard);
    group1.appendChild(boxGrid);
    this.blackMarket.appendChild(group1);

    // Black Market Items
    const group2 = document.createElement('section');
    group2.className = 'collection__group';
    group2.innerHTML = '<div class="collection__title">限时黑市 (每次战斗后刷新)</div>';
    const bmGrid = document.createElement('div');
    bmGrid.className = 'shop-grid__row';

    blackMarketItems.forEach((item, index) => {
      if (!item) return; // already bought
      const base = BASE_COMPONENTS[item.baseTemplateId];
      if (!base) return;

      const card = document.createElement('article');
      let classNames = `shop-card shop-card--${item.tier === 'MYTHIC' ? 'epic' : item.tier === 'LEGENDARY' ? 'rare' : 'starter'}`;
      if (base.perkId) {
        classNames += ' perk-highlight';
      }
      card.className = classNames;
      card.style.borderColor = ELEMENT_COLORS[item.attribute];
      
      let price = 500;
      if (item.tier === 'REFINED') price = 1000;
      if (item.tier === 'RARE') price = 2500;
      if (item.tier === 'LEGENDARY') price = 6000;
      if (item.tier === 'MYTHIC') price = 15000;

      const button = document.createElement('button');
      button.className = 'button button--primary';
      button.textContent = `购买 ${price} 金币`;
      button.onclick = () => onPurchaseBlackMarket(item, index, price);

      card.innerHTML = `
        <div class="shop-card__head">
          <strong>${base.name}</strong>
          <span style="color:${ELEMENT_COLORS[item.attribute]}">${item.attribute}</span>
        </div>
        <div class="shop-card__level-row">
          <div class="shop-card__level">${item.tier}</div>
          <div class="shop-card__status">${item.category}</div>
        </div>
        <div class="shop-card__desc">${base.perkId ? '✨ 包含稀有特效' : '高品质基础散件'}</div>
      `;
      card.appendChild(button);
      bmGrid.appendChild(card);
    });

    group2.appendChild(bmGrid);
    this.blackMarket.appendChild(group2);
  }

  // Animation state
  private isUnboxing = false;
  private unboxTimeout: any = null;
  private unboxResolve: (() => void) | null = null;
  private currentUnboxItem: any = null;

  async triggerUnboxing(item: InstanceComponent, base: any) {
    if (this.isUnboxing) return;
    this.isUnboxing = true;
    this.currentUnboxItem = { item, base };
    
    this.unboxingOverlay.classList.add('active');
    const box = this.unboxingOverlay.querySelector('#unboxing-box') as HTMLElement;
    const content = this.unboxingOverlay.querySelector('.unboxing-content') as HTMLElement;
    
    // reset
    box.className = 'unboxing-box shaking';
    content.style.display = 'none';

    return new Promise<void>((resolve) => {
      this.unboxResolve = resolve;
      this.unboxTimeout = setTimeout(() => {
        this.revealUnboxing();
      }, 1500); // 1.5s suspense
    });
  }

  private revealUnboxing() {
    if (!this.isUnboxing) return;
    const box = this.unboxingOverlay.querySelector('#unboxing-box') as HTMLElement;
    const content = this.unboxingOverlay.querySelector('.unboxing-content') as HTMLElement;
    
    box.className = 'unboxing-box revealed';
    setTimeout(() => {
        content.style.display = 'flex';
        this.unboxingOverlay.querySelector('#ub-name')!.textContent = this.currentUnboxItem.base.name;
        this.unboxingOverlay.querySelector('#ub-tier')!.textContent = this.currentUnboxItem.item.tier;
        this.unboxingOverlay.querySelector('#ub-desc')!.textContent = '已自动放入改装库！';
    }, 300); // Wait for half flip

    // auto close after a while
    this.unboxTimeout = setTimeout(() => {
       this.closeUnboxing();
    }, 2500);
  }

  private skipUnboxing() {
    if (!this.isUnboxing) return;
    clearTimeout(this.unboxTimeout);
    const box = this.unboxingOverlay.querySelector('#unboxing-box') as HTMLElement;
    if (box.classList.contains('shaking')) {
       // skip suspense, go to reveal
       this.revealUnboxing();
    } else {
       // already revealed, close
       this.closeUnboxing();
    }
  }

  private closeUnboxing() {
    this.isUnboxing = false;
    this.unboxingOverlay.classList.remove('active');
    if (this.unboxResolve) {
      this.unboxResolve();
      this.unboxResolve = null;
    }
  }
}
