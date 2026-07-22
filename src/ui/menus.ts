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
  readonly meta = document.createElement('div');
  readonly trophyShelf = document.createElement('div');
  readonly stageSelect = document.createElement('select');

  constructor() {
    this.root.className = 'card menu';
    this.start.className = 'button button--primary';
    this.online.className = 'button button--online';
    this.online.textContent = '\u771f\u4eba\u8054\u673a';
    this.onlineStatus.className = 'menu__online-status';
    this.onlineStatus.textContent = '\u5c40\u57df\u7f51 WebSocket \u53cc\u4eba\u5bf9\u6218';
    this.start.textContent = '快速战斗';
    this.survival.className = 'button button--danger';
    this.survival.textContent = '生存模式';
    this.tournament.className = 'button';
    this.tournament.textContent = '锦标赛';
    this.garage.className = 'button';
    this.garage.textContent = '神级改装库';
    this.forge = document.createElement('button');
    this.forge.className = 'button button--warning';
    this.forge.textContent = '铁匠铺 (Forge)';
    
    // Add Black Market Button
    this.blackMarket = document.createElement('button');
    this.blackMarket.className = 'button button--danger';
    this.blackMarket.textContent = '黑色商城';
    this.blackMarket.style.boxShadow = '0 0 10px rgba(255, 0, 85, 0.5)';
    this.blackMarket.style.textShadow = '0 0 5px #ff0055';

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
    stageStrip.className = 'menu__strip';
    stageStrip.innerHTML = `
      <span>发射博弈</span>
      <span>金币奖励</span>
      <span>商城养成</span>
    `;

    const stageWrap = document.createElement('label');
    stageWrap.className = 'field stage-select';
    stageWrap.style.margin = '1rem 0';
    const stageLabel = document.createElement('span');
    stageLabel.textContent = '场地风格 (Stage Theme)';
    this.stageSelect.innerHTML = `
      <option value="classic_grid">经典赛博网格 (Classic Grid)</option>
      <option value="neon_magma" selected>霓虹熔岩废土 (Neon Magma)</option>
      <option value="absolute_zero">全息绝对零度镜面 (Absolute Zero)</option>
    `;
    stageWrap.append(stageLabel, this.stageSelect);

    this.root.append(
      eyebrow, title, intro, stageStrip, stageWrap, 
      this.start, this.online, this.onlineStatus, this.survival, this.tournament, this.garage, this.forge, this.blackMarket,
      this.meta, this.trophyShelf
    );
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
