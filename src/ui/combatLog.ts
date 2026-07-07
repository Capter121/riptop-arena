type LogEntry = {
  id: number;
  text: string;
  color: string;
  life: number;
  element: HTMLDivElement;
};

export class CombatLog {
  readonly root = document.createElement('div');
  private entries: LogEntry[] = [];
  private nextId = 0;

  constructor() {
    this.root.className = 'combat-log';
  }

  log(text: string, color: string = '#ffffff') {
    const el = document.createElement('div');
    el.className = 'combat-log__entry';
    el.textContent = text;
    el.style.color = color;
    this.root.appendChild(el);

    // Trigger reflow to ensure animation plays
    void el.offsetWidth;
    el.classList.add('combat-log__entry--visible');

    this.entries.push({
      id: this.nextId++,
      text,
      color,
      life: 2.5, // visible for 2.5 seconds
      element: el,
    });

    if (this.entries.length > 6) {
      const oldest = this.entries.shift()!;
      oldest.element.remove();
    }
  }

  update(dt: number) {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i];
      entry.life -= dt;
      if (entry.life <= 0) {
        entry.element.remove();
        this.entries.splice(i, 1);
      } else if (entry.life < 0.5) {
        entry.element.style.opacity = (entry.life / 0.5).toString();
      }
    }
  }
  
  clear() {
    this.entries.forEach(e => e.element.remove());
    this.entries = [];
  }
}
