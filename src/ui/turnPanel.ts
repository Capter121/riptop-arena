import {
  ELEMENT_ATTACKS,
  type ElementAttackSkillId,
  type TurnAction,
} from '../types/battle';
import type { TurnResolution } from '../gameplay/battlePhysics';

type TurnPanelState = {
  visible: boolean;
  resolving: boolean;
  spirit: number;
  maxSpirit: number;
  turnIndex: number;
  lastLog: string;
};

const ATTACK_ORDER: ElementAttackSkillId[] = [
  'wind_blade',
  'aqua_surge',
  'lightning_bolt',
  'blazing_meteor',
  'phantom_clone',
];

export class TurnPanel {
  readonly root = document.createElement('section');
  private readonly spiritText = document.createElement('div');
  private readonly spiritFill = document.createElement('div');
  private readonly stateText = document.createElement('div');
  private readonly logText = document.createElement('div');
  private readonly attackButton = document.createElement('button');
  private readonly evadeButton = document.createElement('button');
  private readonly defenseButton = document.createElement('button');
  private readonly chargeButton = document.createElement('button');
  private readonly skillGrid = document.createElement('div');
  private readonly skillButtons = new Map<ElementAttackSkillId, HTMLButtonElement>();
  private readonly onAction: (action: TurnAction) => void;
  private expanded = false;
  private state: TurnPanelState = {
    visible: false,
    resolving: false,
    spirit: 0,
    maxSpirit: 100,
    turnIndex: 1,
    lastLog: '等待发射',
  };

  constructor(onAction: (action: TurnAction) => void) {
    this.onAction = onAction;
    this.root.className = 'turn-panel';
    this.root.dataset.visible = 'false';

    const header = document.createElement('div');
    header.className = 'turn-panel__header';
    header.innerHTML = `
      <span>Elements RPS</span>
      <strong>回合博弈</strong>
    `;

    const spirit = document.createElement('div');
    spirit.className = 'turn-panel__spirit';
    this.spiritText.className = 'turn-panel__spirit-text';
    const spiritTrack = document.createElement('div');
    spiritTrack.className = 'turn-panel__spirit-track';
    this.spiritFill.className = 'turn-panel__spirit-fill';
    spiritTrack.appendChild(this.spiritFill);
    spirit.append(this.spiritText, spiritTrack);

    const actions = document.createElement('div');
    actions.className = 'turn-panel__actions';

    this.attackButton.className = 'turn-panel__button turn-panel__button--attack';
    this.attackButton.textContent = '进攻';
    this.attackButton.addEventListener('click', () => {
      if (this.state.resolving) return;
      this.expanded = !this.expanded;
      this.render();
    });

    this.evadeButton.className = 'turn-panel__button';
    this.evadeButton.textContent = '回避';
    this.evadeButton.addEventListener('click', () => this.submit({ kind: 'evade' }));

    this.defenseButton.className = 'turn-panel__button';
    this.defenseButton.textContent = '防守';
    this.defenseButton.addEventListener('click', () => this.submit({ kind: 'defense' }));

    this.chargeButton.className = 'turn-panel__button turn-panel__button--charge';
    this.chargeButton.textContent = '蓄能';
    this.chargeButton.addEventListener('click', () => this.submit({ kind: 'charge' }));

    actions.append(this.attackButton, this.evadeButton, this.defenseButton, this.chargeButton);

    this.skillGrid.className = 'turn-panel__skills';
    for (const skillId of ATTACK_ORDER) {
      const meta = ELEMENT_ATTACKS[skillId];
      const button = document.createElement('button');
      button.className = 'turn-panel__skill';
      button.style.setProperty('--skill-color', meta.color);
      button.addEventListener('click', () => this.submit({ kind: 'attack', skillId }));
      this.skillButtons.set(skillId, button);
      this.skillGrid.appendChild(button);
    }

    // Add explicit Back button in the skill grid
    const backGridButton = document.createElement('button');
    backGridButton.className = 'turn-panel__skill turn-panel__skill--back';
    backGridButton.style.setProperty('--skill-color', '#888888');
    backGridButton.style.pointerEvents = 'auto'; // Force clickable
    backGridButton.type = 'button'; // Prevent form submission
    backGridButton.innerHTML = `
      <span class="turn-panel__skill-icon">↩️</span>
      <span class="turn-panel__skill-name">返回</span>
      <span class="turn-panel__skill-cost">取消</span>
    `;
    backGridButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.expanded = false;
      this.render();
    });
    this.skillGrid.appendChild(backGridButton);

    this.stateText.className = 'turn-panel__state';
    this.logText.className = 'turn-panel__log';

    this.root.append(header, spirit, actions, this.skillGrid, this.stateText, this.logText);
    this.render();
  }

  attach(parent: HTMLElement) {
    parent.appendChild(this.root);
  }

  update(state: Partial<TurnPanelState>) {
    this.state = { ...this.state, ...state };
    if (!this.state.visible) this.expanded = false;
    this.render();
  }

  setPanelLock(locked: boolean) {
    this.root.dataset.locked = String(locked);
  }

  showResolution(resolution: TurnResolution) {
    this.expanded = false;
    this.update({ lastLog: resolution.log, resolving: true });
  }

  private submit(action: TurnAction) {
    if (this.state.resolving || !this.state.visible) return;

    if (action.kind === 'attack') {
      const cost = ELEMENT_ATTACKS[action.skillId].spiritCost;
      if (this.state.spirit < cost) return;
    }
    const evadeDefendCost = this.state.turnIndex <= 3 ? 0 : 1;
    if ((action.kind === 'evade' || action.kind === 'defense') && evadeDefendCost > 0 && this.state.spirit < evadeDefendCost) return;
    if (action.kind === 'charge' && this.state.spirit >= this.state.maxSpirit) return;

    this.expanded = false;
    this.onAction(action);
  }

  private render() {
    this.root.dataset.visible = String(this.state.visible);
    this.root.dataset.resolving = String(this.state.resolving);
    this.skillGrid.dataset.expanded = String(this.expanded);

    const spiritRatio = this.state.maxSpirit > 0 ? this.state.spirit / this.state.maxSpirit : 0;
    const tier = Math.floor(this.state.spirit / 20);
    this.spiritText.textContent = `Spirit ${Math.round(this.state.spirit)}/${this.state.maxSpirit} · ${tier}档`;
    this.spiritFill.style.width = `${Math.max(0, Math.min(1, spiritRatio)) * 100}%`;
    this.stateText.textContent = this.state.resolving ? '结算动画中' : `第 ${this.state.turnIndex} 回合 · 请选择行动`;
    this.logText.textContent = this.state.lastLog;

    this.attackButton.textContent = '进攻';
    this.attackButton.disabled = this.state.resolving;
    
    const evadeDefendCost = this.state.turnIndex <= 3 ? 0 : 1;
    const hideCost = evadeDefendCost === 0;
    
    this.evadeButton.disabled = this.expanded || this.state.resolving || (evadeDefendCost > 0 && this.state.spirit < evadeDefendCost);
    this.defenseButton.disabled = this.expanded || this.state.resolving || (evadeDefendCost > 0 && this.state.spirit < evadeDefendCost);
    
    this.evadeButton.innerHTML = `回避 <span class="cost">${hideCost ? '0斗志' : `-${evadeDefendCost}斗志`}</span>`;
    this.defenseButton.innerHTML = `防守 <span class="cost">${hideCost ? '0斗志' : `-${evadeDefendCost}斗志`}</span>`;
    
    this.chargeButton.disabled = this.expanded || this.state.resolving || this.state.spirit >= this.state.maxSpirit;

    for (const skillId of ATTACK_ORDER) {
      const meta = ELEMENT_ATTACKS[skillId];
      const button = this.skillButtons.get(skillId)!;
      const disabled = this.state.resolving || this.state.spirit < meta.spiritCost;
      button.disabled = disabled;
      button.innerHTML = `
        <span class="turn-panel__skill-icon">${meta.icon}</span>
        <span class="turn-panel__skill-name">${meta.label}</span>
        <span class="turn-panel__skill-cost">${meta.tier}档 / ${meta.spiritCost}</span>
      `;
    }
  }
}
