import { EventBus } from '../utils/events';
import type { ClashAction } from '../gameplay/clash';
import { EnergySystem } from '../gameplay/energy';

export class ClashPanel {
  private el = document.createElement('div');
  private timerEl = document.createElement('div');
  private resultEl = document.createElement('div');
  private resolveTimeout = 0;
  private buttons: HTMLButtonElement[] = [];
  private events: EventBus;
  private energy: EnergySystem;

  constructor(events: EventBus, energy: EnergySystem) {
    this.events = events;
    this.energy = energy;
    this.el.className = 'clash-panel hidden';

    this.timerEl.className = 'clash-panel__timer';

    const title = document.createElement('div');
    title.innerHTML = `
      <div class="clash-panel__subtitle">战术冲突</div>
      <div class="clash-panel__title">决策窗口</div>
    `;
    this.el.appendChild(title);

    const actionsEl = document.createElement('div');
    actionsEl.className = 'clash-panel__actions';

    const createBtn = (label: string, action: ClashAction, key: string, cost: number) => {
      const btn = document.createElement('button');
      btn.className = 'clash-panel__btn';
      btn.innerHTML = `<span class="key">${key}</span> ${label} <span class="cost">${cost > 0 ? `-${cost} 能量` : ''}</span>`;
      btn.onclick = () => {
        if (!this.energy.canAfford('player', cost)) return;
        this.events.emit('clash_input', action);
        this.buttons.forEach((candidate) => candidate.classList.remove('active'));
        btn.classList.add('active');
      };
      this.buttons.push(btn);
      return btn;
    };

    actionsEl.append(
      createBtn('轻击', { type: 'attack', power: 1 }, '1', 1),
      createBtn('重击', { type: 'attack', power: 2 }, '2', 2),
      createBtn('全力一击', { type: 'attack', power: 3 }, '3', 3),
      createBtn('防御', { type: 'defend' }, 'D', 0),
      createBtn('闪避', { type: 'dodge' }, 'S', 0),
      createBtn('蓄力', { type: 'charge' }, 'C', 0),
    );

    this.resultEl.className = 'clash-panel__result';

    this.el.append(this.timerEl, actionsEl, this.resultEl);
    document.body.appendChild(this.el);

    this.events.on('clash_start', () => {
      this.el.classList.remove('hidden');
      this.el.classList.add('active');
      this.resultEl.textContent = '选择你的行动';

      this.buttons.forEach((btn, i) => {
        btn.classList.remove('active');
        const cost = [1, 2, 3, 0, 0, 0][i];
        if (!this.energy.canAfford('player', cost)) {
          btn.classList.add('disabled');
        } else {
          btn.classList.remove('disabled');
        }
      });
    });

    this.events.on('clash_resolved', (res: { log: string }) => {
      this.resultEl.textContent = res.log;
      clearTimeout(this.resolveTimeout);
      this.resolveTimeout = setTimeout(() => {
        this.el.classList.remove('active');
        setTimeout(() => this.el.classList.add('hidden'), 300);
      }, 1500) as unknown as number;
    });
  }

  update(timer: number) {
    if (timer <= 0 && this.timerEl.textContent !== '时间到') {
      this.timerEl.textContent = '时间到';
    } else if (timer > 0) {
      this.timerEl.textContent = timer.toFixed(1);
    }

    if (timer <= 1.0) this.timerEl.classList.add('danger');
    else this.timerEl.classList.remove('danger');
  }
}
