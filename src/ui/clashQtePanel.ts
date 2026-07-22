export type ClashQtePanelState = {
  visible: boolean;
  playerScore: number;
  enemyScore: number;
  timeLeft: number;
  duration: number;
  tier: number;
  resultText?: string;
};

export class ClashQtePanel {
  readonly root = document.createElement('section');
  private readonly timerText = document.createElement('div');
  private readonly playerFill = document.createElement('div');
  private readonly enemyFill = document.createElement('div');
  private readonly playerScoreText = document.createElement('strong');
  private readonly enemyScoreText = document.createElement('strong');
  private readonly promptText = document.createElement('div');
  private readonly tierText = document.createElement('span');

  private state: ClashQtePanelState = {
    visible: false,
    playerScore: 50,
    enemyScore: 50,
    timeLeft: 0,
    duration: 5,
    tier: 1,
  };

  constructor() {
    this.root.className = 'clash-qte';
    this.root.dataset.visible = 'false';

    const header = document.createElement('div');
    header.className = 'clash-qte__header';

    const title = document.createElement('div');
    title.className = 'clash-qte__title';
    title.textContent = '按空格蓄力';

    this.tierText.className = 'clash-qte__tier';
    header.append(title, this.tierText, this.timerText);

    const bar = document.createElement('div');
    bar.className = 'clash-qte__bar';

    const playerSide = document.createElement('div');
    playerSide.className = 'clash-qte__fill clash-qte__fill--player';
    playerSide.appendChild(this.playerFill);

    const enemySide = document.createElement('div');
    enemySide.className = 'clash-qte__fill clash-qte__fill--enemy';
    enemySide.appendChild(this.enemyFill);

    const marker = document.createElement('div');
    marker.className = 'clash-qte__marker';
    bar.append(playerSide, enemySide, marker);

    const scores = document.createElement('div');
    scores.className = 'clash-qte__scores';
    const playerLabel = document.createElement('span');
    playerLabel.textContent = 'PLAYER';
    const enemyLabel = document.createElement('span');
    enemyLabel.textContent = 'AI';
    scores.append(playerLabel, this.playerScoreText, this.enemyScoreText, enemyLabel);

    this.promptText.className = 'clash-qte__prompt';
    this.promptText.textContent = '狂按 SPACE 推动蓝色能量';

    this.root.append(header, bar, scores, this.promptText);
    this.render();
  }

  attach(parent: HTMLElement) {
    parent.appendChild(this.root);
  }

  update(state: Partial<ClashQtePanelState>) {
    this.state = { ...this.state, ...state };
    this.render();
  }

  hide() {
    this.update({ visible: false, resultText: undefined });
  }

  private render() {
    const total = Math.max(1, this.state.playerScore + this.state.enemyScore);
    const playerRatio = this.state.playerScore / total;
    const enemyRatio = this.state.enemyScore / total;
    const playerPct = Math.max(8, Math.min(92, playerRatio * 100));
    const enemyPct = Math.max(8, Math.min(92, enemyRatio * 100));

    this.root.dataset.visible = String(this.state.visible);
    this.root.style.opacity = this.state.visible ? '1' : '0';
    this.root.style.visibility = this.state.visible ? 'visible' : 'hidden';
    this.root.style.transform = this.state.visible
      ? 'translate(-50%, 0) scale(1)'
      : 'translate(-50%, 26px) scale(0.98)';
    this.root.dataset.leader =
      Math.abs(this.state.playerScore - this.state.enemyScore) < 0.5
        ? 'even'
        : this.state.playerScore > this.state.enemyScore
          ? 'player'
          : 'enemy';

    this.timerText.className = this.state.timeLeft <= 1 ? 'clash-qte__timer clash-qte__timer--danger' : 'clash-qte__timer';
    this.timerText.textContent = `${Math.max(0, this.state.timeLeft).toFixed(1)}s`;
    this.tierText.textContent = `TIER ${this.state.tier}`;
    this.playerFill.style.width = `${playerPct}%`;
    this.enemyFill.style.width = `${enemyPct}%`;
    this.playerScoreText.textContent = Math.round(this.state.playerScore).toString();
    this.enemyScoreText.textContent = Math.round(this.state.enemyScore).toString();
    this.promptText.textContent = this.state.resultText ?? '狂按 SPACE 推动蓝色能量';
  }
}
