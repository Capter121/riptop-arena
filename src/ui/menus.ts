export class MenuPanel {
  readonly root = document.createElement('section');
  readonly start = document.createElement('button');
  readonly survival = document.createElement('button');
  readonly tournament = document.createElement('button');
  readonly garage = document.createElement('button');
  readonly forge = document.createElement('button');
  readonly meta = document.createElement('div');
  readonly trophyShelf = document.createElement('div');

  constructor() {
    this.root.className = 'card menu';
    this.start.className = 'button button--primary';
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

    this.root.append(eyebrow, title, intro, stageStrip, this.start, this.survival, this.tournament, this.garage, this.forge, this.meta, this.trophyShelf);
  }

  setMeta(text: string) {
    this.meta.textContent = text;
  }

  setTrophyShelf(title: string, body: string) {
    this.trophyShelf.innerHTML = `
      <div class="trophy-shelf__kicker">冠军陈列</div>
      <div class="trophy-shelf__title">${title}</div>
      <div class="trophy-shelf__body">${body}</div>
    `;
  }
}
