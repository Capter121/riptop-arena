export class MenuPanel {
  readonly root = document.createElement('section');
  readonly start = document.createElement('button');
  readonly online = document.createElement('button');
  readonly onlineStatus = document.createElement('div');
  readonly survival = document.createElement('button');
  readonly tournament = document.createElement('button');
  readonly garage = document.createElement('button');
  readonly forge = document.createElement('button');
  readonly blackMarket = document.createElement('button');
  readonly nssCustomizer = document.createElement('a');
  readonly meta = document.createElement('div');
  readonly trophyShelf = document.createElement('div');
  readonly stageSelect = document.createElement('select');

  constructor() {
    this.root.className = 'card menu';
    this.start.className = 'button button--primary button--hero';
    this.start.textContent = '⚔️ 快速战斗';
    this.online.className = 'button button--online';
    this.online.textContent = '🌐 真人联机';
    this.onlineStatus.className = 'menu__online-status';
    this.onlineStatus.textContent = '随机匹配或指定好友房间';
    this.survival.className = 'button';
    this.survival.textContent = '🛡️ 生存模式';
    this.tournament.className = 'button';
    this.tournament.textContent = '🏆 八人战役';

    // 🛠️ Nova Spin 3D Assembly Button
    this.nssCustomizer.className = 'button button--nss-customizer';
    this.nssCustomizer.textContent = '🛠️ 3D 陀螺组装 (Nova Spin)';
    this.nssCustomizer.style.background = 'linear-gradient(135deg, rgba(0, 242, 254, 0.25) 0%, rgba(79, 172, 254, 0.35) 100%)';
    this.nssCustomizer.style.border = '1px solid rgba(79, 172, 254, 0.6)';
    this.nssCustomizer.style.color = '#7ef0ff';
    this.nssCustomizer.style.fontWeight = 'bold';
    this.nssCustomizer.style.textDecoration = 'none';
    this.nssCustomizer.style.display = 'inline-block';
    this.nssCustomizer.style.textAlign = 'center';
    this.nssCustomizer.style.lineHeight = '2.4rem';
    this.nssCustomizer.addEventListener('click', (event) => {
      const url = this.nssCustomizer.href;
      if (url && !url.endsWith('#') && !url.startsWith('javascript:')) {
        event.preventDefault();
        window.location.href = url;
      }
    });

    this.garage.className = 'button';
    this.garage.textContent = '📦 神装改装库';
    this.forge = document.createElement('button');
    this.forge.className = 'button';
    this.forge.textContent = '🔨 铁匠铺 (Forge)';
    
    // Add Black Market Button
    this.blackMarket = document.createElement('button');
    this.blackMarket.className = 'button button--black-market';
    this.blackMarket.textContent = '🏪 黑色商城';

    this.meta.className = 'menu__meta';
    this.trophyShelf.className = 'trophy-shelf';

    const eyebrow = document.createElement('div');
    eyebrow.className = 'menu__eyebrow';
    eyebrow.textContent = '新钢铁联盟';

    const title = document.createElement('h1');
    title.className = 'menu__title';
    title.innerHTML = '<span>战斗陀螺</span><span>竞技场</span>';

    const intro = document.createElement('p');
    intro.className = 'menu__intro';
    intro.textContent = '全力发射，切入碰撞赛场，赢下赏金金币，然后不断调整配置去迎战下一位对手。';

    const stageStrip = document.createElement('div');
    stageStrip.className = 'menu__tags';
    stageStrip.innerHTML = `
      <span class="tag">🏷️ 发射博弈</span>
      <span class="tag">💰 金币奖励</span>
      <span class="tag">⚙️ 组合养成</span>
    `;

    const stageWrap = document.createElement('label');
    stageWrap.className = 'field stage-select';
    stageWrap.style.margin = '0.5rem 0';
    const stageLabel = document.createElement('span');
    stageLabel.textContent = '⚙️ 场地风格 (Stage Theme)';
    this.stageSelect.innerHTML = `
      <option value="classic_grid">经典赛博网格 (Classic Grid)</option>
      <option value="neon_magma" selected>霓虹熔岩废土 (Neon Magma)</option>
      <option value="absolute_zero">全息绝对零度镜面 (Absolute Zero)</option>
    `;
    stageWrap.append(stageLabel, this.stageSelect);

    this.root.append(
      eyebrow, title, intro, stageStrip,
      this.start, this.online, this.onlineStatus, this.nssCustomizer, this.survival, this.tournament, this.garage, this.forge, this.blackMarket,
      stageWrap, this.meta, this.trophyShelf
    );
  }

  setNssCustomizerUrl(url: string) {
    this.nssCustomizer.href = url;
  }

  setMeta(text: string) {
    this.meta.textContent = text;
  }

  setOnlineState(label: string, status: string, active = false) {
    this.online.textContent = label;
    this.online.classList.toggle('is-active', active);
    this.onlineStatus.textContent = status;
  }

  setTrophyShelf(title: string, body: string) {
    this.trophyShelf.innerHTML = `
      <div class="trophy-shelf__kicker">冠军陈列</div>
      <div class="trophy-shelf__title">${title}</div>
      <div class="trophy-shelf__body">${body}</div>
    `;
  }
}
