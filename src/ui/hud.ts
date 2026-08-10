import type { BattleResult } from '../gameplay/rules';
import type { Phase } from '../utils/state';
import { CombatLog } from './combatLog';
import { getAffinityBadge, renderAffinityBadge } from './affinityPresentation';
import type { BattleAffinityProfile } from '../gameplay/battleAffinity';

export type RoundHud = {
  playerSpin: number;
  playerSpinMax: number;
  playerIntegrity: number;
  playerIntegrityMax: number;
  playerBurst: number;
  playerEnergy: number;
  enemySpin: number;
  enemySpinMax: number;
  enemyIntegrity: number;
  enemyIntegrityMax: number;
  enemyBurst: number;
  enemyEnergy: number;
  timeLeft: number;
  result: BattleResult | null;
  enemyName: string;
  launchPower: number;
  angleDeg: number;
  phase: Phase;
  countdown: number;
  paused: boolean;
  dangerLevel: number;
  touchMode: boolean;
  mode: 'quick' | 'tournament' | 'survival';
  wave?: number;
  score?: number;
  playerAttributes?: Record<string, number>;
  enemyAttributes?: Record<string, number>;
  playerAffinity?: BattleAffinityProfile;
  enemyAffinity?: BattleAffinityProfile;
};

type HudControls = {
  onLaunchChargeStart: () => void;
  onLaunchChargeEnd: () => void;
  onAimLeft: () => void;
  onAimRight: () => void;
  onPauseToggle: () => void;
  onDashEnemy: () => void;
  onDashCenter: () => void;
};

export class Hud {
  readonly root = document.createElement('div');
  readonly combatLog = new CombatLog();

  private playerSpinFill = document.createElement('div');
  private playerIntegrityFill = document.createElement('div');
  private playerIntegrityText = document.createElement('div');
  private enemySpinFill = document.createElement('div');
  private enemyIntegrityFill = document.createElement('div');
  private enemyIntegrityText = document.createElement('div');
  private playerBurst = document.createElement('span');
  private enemyBurst = document.createElement('span');
  private playerEnergyFill = document.createElement('div');
  private enemyEnergyFill = document.createElement('div');
  private timer = document.createElement('div');
  private survival = document.createElement('div');
  private callout = document.createElement('div');
  private phaseHint = document.createElement('div');
  private launchMeter = document.createElement('div');
  private enemyName = document.createElement('div');
  private playerAttributesText = document.createElement('div');
  private enemyAttributesText = document.createElement('div');
  private touchControls = document.createElement('div');
  private aimLeft = document.createElement('button');
  private aimRight = document.createElement('button');
  private launchButton = document.createElement('button');
  private dashEnemy = document.createElement('button');
  private dashCenter = document.createElement('button');
  private pauseButton = document.createElement('button');

  constructor() {
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="status status-player">
        <div class="status__title"><span>玩家</span><div class="status__attributes js-player-attributes"></div></div>
        <div class="bar"><div class="bar__fill js-player-spin"></div></div>
        <div class="bar bar--integrity">
          <div class="bar__fill js-player-integrity"></div>
          <div class="bar__text js-player-integrity-text"></div>
        </div>
        <div class="bar bar--energy"><div class="bar__fill js-player-energy"></div></div>
        <div class="status__meta">爆裂风险 <span class="js-player-burst">0%</span></div>
      </div>
      <div class="hud__center">
        <div class="hud__timer js-timer">45.0</div>
        <div class="hud__survival js-survival" style="display: none; font-size: 24px; font-weight: bold; text-align: center; font-family: monospace;"></div>
        <div class="hud__callout js-callout"></div>
        <div class="hud__hint js-hint"></div>
        <div class="launch-meter"><div class="launch-meter__fill js-launch"></div></div>
      </div>
      <div class="status status-enemy">
        <div class="status__title"><span class="js-enemy-name">对手</span><div class="status__attributes js-enemy-attributes"></div></div>
        <div class="bar"><div class="bar__fill js-enemy-spin"></div></div>
        <div class="bar bar--integrity">
          <div class="bar__fill js-enemy-integrity"></div>
          <div class="bar__text js-enemy-integrity-text"></div>
        </div>
        <div class="bar bar--energy"><div class="bar__fill js-enemy-energy"></div></div>
        <div class="status__meta">爆裂风险 <span class="js-enemy-burst">0%</span></div>
      </div>
    `;

    this.playerSpinFill = this.root.querySelector('.js-player-spin') as HTMLDivElement;
    this.playerIntegrityFill = this.root.querySelector('.js-player-integrity') as HTMLDivElement;
    this.playerIntegrityText = this.root.querySelector('.js-player-integrity-text') as HTMLDivElement;
    this.playerEnergyFill = this.root.querySelector('.js-player-energy') as HTMLDivElement;
    this.enemySpinFill = this.root.querySelector('.js-enemy-spin') as HTMLDivElement;
    this.enemyIntegrityFill = this.root.querySelector('.js-enemy-integrity') as HTMLDivElement;
    this.enemyIntegrityText = this.root.querySelector('.js-enemy-integrity-text') as HTMLDivElement;
    this.enemyEnergyFill = this.root.querySelector('.js-enemy-energy') as HTMLDivElement;
    this.playerBurst = this.root.querySelector('.js-player-burst') as HTMLSpanElement;
    this.enemyBurst = this.root.querySelector('.js-enemy-burst') as HTMLSpanElement;
    this.timer = this.root.querySelector('.js-timer') as HTMLDivElement;
    this.survival = this.root.querySelector('.js-survival') as HTMLDivElement;
    this.callout = this.root.querySelector('.js-callout') as HTMLDivElement;
    this.phaseHint = this.root.querySelector('.js-hint') as HTMLDivElement;
    this.launchMeter = this.root.querySelector('.js-launch') as HTMLDivElement;
    this.enemyName = this.root.querySelector('.js-enemy-name') as HTMLDivElement;
    this.playerAttributesText = this.root.querySelector('.js-player-attributes') as HTMLDivElement;
    this.enemyAttributesText = this.root.querySelector('.js-enemy-attributes') as HTMLDivElement;

    this.touchControls.className = 'touch-controls';
    this.touchControls.innerHTML = `
      <div class="touch-controls__group touch-controls__group--launch"></div>
      <div class="touch-controls__group touch-controls__group--battle"></div>
    `;

    this.aimLeft.className = 'touch-button';
    this.aimLeft.textContent = '瞄准 -';
    this.aimRight.className = 'touch-button';
    this.aimRight.textContent = '瞄准 +';
    this.launchButton.className = 'touch-button touch-button--primary';
    this.launchButton.textContent = '按住发射';
    this.dashEnemy.className = 'touch-button touch-button--primary';
    this.dashEnemy.textContent = '冲刺对手';
    this.dashCenter.className = 'touch-button';
    this.dashCenter.textContent = '回到中心';
    this.pauseButton.className = 'touch-button';
    this.pauseButton.textContent = '暂停';

    const launchGroup = this.touchControls.querySelector('.touch-controls__group--launch') as HTMLDivElement;
    const battleGroup = this.touchControls.querySelector('.touch-controls__group--battle') as HTMLDivElement;
    launchGroup.append(this.aimLeft, this.launchButton, this.aimRight);
    battleGroup.append(this.dashEnemy, this.dashCenter, this.pauseButton);
  }

  attach(parent: HTMLElement) {
    parent.appendChild(this.root);
    parent.appendChild(this.combatLog.root);
    parent.appendChild(this.touchControls);
  }

  setVisible(visible: boolean) {
    const display = visible ? '' : 'none';
    this.root.style.display = display;
    this.combatLog.root.style.display = display;
    this.touchControls.style.display = display;
  }

  bindControls(controls: HudControls) {
    this.launchButton.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      controls.onLaunchChargeStart();
    });
    const releaseLaunch = (event: Event) => {
      event.preventDefault();
      controls.onLaunchChargeEnd();
    };
    this.launchButton.addEventListener('pointerup', releaseLaunch);
    this.launchButton.addEventListener('pointercancel', releaseLaunch);
    this.launchButton.addEventListener('pointerleave', releaseLaunch);
    this.aimLeft.addEventListener('click', () => controls.onAimLeft());
    this.aimRight.addEventListener('click', () => controls.onAimRight());
    this.pauseButton.addEventListener('click', () => controls.onPauseToggle());
    this.dashEnemy.addEventListener('click', () => controls.onDashEnemy());
    this.dashCenter.addEventListener('click', () => controls.onDashCenter());
  }

  private renderAttributes(
    container: HTMLElement,
    affinity?: BattleAffinityProfile,
    attributes?: Record<string, number>,
  ) {
    const renderKey = `${affinity?.primary ?? 'NEUTRAL'}:${JSON.stringify(attributes ?? {})}`;
    if (container.dataset.statusRenderKey === renderKey) return;
    container.dataset.statusRenderKey = renderKey;
    container.replaceChildren();
    if (affinity) {
      const affinityHost = document.createElement('span');
      renderAffinityBadge(affinityHost, getAffinityBadge(affinity.primary));
      container.append(affinityHost.firstElementChild!);
    }
    for (const [attribute, count] of Object.entries(attributes ?? {})) {
      const badge = document.createElement('span');
      badge.className = `attr-badge attr-${attribute.toLowerCase()}`;
      badge.textContent = `${attribute} x${count}`;
      container.append(badge);
    }
  }

  update(state: RoundHud) {
    const percent = (value: number, max: number) => Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
    this.playerSpinFill.style.width = `${percent(state.playerSpin, state.playerSpinMax)}%`;
    this.playerIntegrityFill.style.width = `${percent(state.playerIntegrity, state.playerIntegrityMax)}%`;
    this.playerIntegrityText.textContent = `${Math.ceil(state.playerIntegrity)} / ${Math.ceil(state.playerIntegrityMax)}`;
    this.playerEnergyFill.style.width = `${state.playerEnergy}%`;
    this.enemySpinFill.style.width = `${percent(state.enemySpin, state.enemySpinMax)}%`;
    this.enemyIntegrityFill.style.width = `${percent(state.enemyIntegrity, state.enemyIntegrityMax)}%`;
    this.enemyIntegrityText.textContent = `${Math.ceil(state.enemyIntegrity)} / ${Math.ceil(state.enemyIntegrityMax)}`;
    this.enemyEnergyFill.style.width = `${state.enemyEnergy}%`;
    this.playerBurst.textContent = `${Math.round(state.playerBurst)}%`;
    this.enemyBurst.textContent = `${Math.round(state.enemyBurst)}%`;
    this.renderAttributes(this.playerAttributesText, state.playerAffinity, state.playerAttributes);
    this.renderAttributes(this.enemyAttributesText, state.enemyAffinity, state.enemyAttributes);

    if (state.mode === 'survival') {
      this.timer.style.display = 'none';
      this.survival.style.display = 'block';
      this.survival.innerHTML = `第 ${state.wave || 1} 波 - 得分：${state.score || 0}`;
    } else {
      this.timer.style.display = 'block';
      this.survival.style.display = 'none';
      this.timer.textContent = state.timeLeft.toFixed(1);
    }

    this.enemyName.textContent = state.enemyName;
    this.launchMeter.style.width = `${state.launchPower * 100}%`;

    const showTouchControls = state.touchMode && (state.phase === 'launch' || state.paused);
    this.touchControls.dataset.visible = showTouchControls ? 'true' : 'false';
    this.touchControls.dataset.phase = state.phase;
    this.touchControls.dataset.paused = String(state.paused);
    this.pauseButton.textContent = state.paused ? '继续' : '暂停';

    if (state.paused) {
      this.callout.textContent = '已暂停';
      this.callout.dataset.mode = 'pause';
    } else if (state.phase === 'launch' && state.countdown > 0) {
      this.callout.textContent = `${Math.ceil(state.countdown)} 秒后发射`;
      this.callout.dataset.mode = 'countdown';
    } else if (state.result) {
      this.callout.textContent = `${state.result.label} - ${state.result.winner === 'player' ? '你赢了' : '你输了'}`;
      this.callout.dataset.mode = state.result.winner === 'player' ? 'win' : 'lose';
    } else if (state.dangerLevel > 0.72 && state.phase === 'battle') {
      this.callout.textContent = '边缘危险';
      this.callout.dataset.mode = 'danger';
    } else if (state.phase === 'launch') {
      this.callout.textContent = '准备发射';
      this.callout.dataset.mode = 'idle';
    } else {
      this.callout.textContent = '';
      this.callout.dataset.mode = 'idle';
    }

    if (state.paused) {
      this.phaseHint.textContent = state.touchMode ? '点击继续回到战斗' : '按 Esc 继续';
    } else if (state.phase === 'launch') {
      this.phaseHint.textContent = state.touchMode
        ? `长按蓄力 - 角度 ${state.angleDeg > 0 ? '+' : ''}${state.angleDeg.toFixed(0)} 度 - 用两侧按钮微调`
        : `长按蓄力 - 角度 ${state.angleDeg > 0 ? '+' : ''}${state.angleDeg.toFixed(0)} 度 - 按 Q/E 瞄准`;
    } else if (state.dangerLevel > 0.72) {
      this.phaseHint.textContent = '危险区域 - 再吃一次重击就可能被打出场外';
    } else {
      this.phaseHint.textContent = state.touchMode
        ? '使用右下角回合面板选择行动'
        : '使用右下角回合面板选择行动 - Esc 暂停';
    }
  }
}
