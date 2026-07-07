import type { BattleStats } from '../gameplay/build';

const STATS_MAX = 50;
const LABELS = ['攻击', '防御', '持久', '机动', '抗爆', '重量'];

export class RadarChart {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private currentStats: number[] = [0, 0, 0, 0, 0, 0];
  private targetStats: number[] = [0, 0, 0, 0, 0, 0];
  private width = 240;
  private height = 240;
  private animating = false;

  constructor() {
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.className = 'radar-chart';
    this.ctx = this.canvas.getContext('2d')!;
  }

  update(stats: BattleStats) {
    this.targetStats = [
      Math.min(stats.attack, STATS_MAX),
      Math.min(stats.defense, STATS_MAX),
      Math.min(stats.stamina, STATS_MAX),
      Math.min(stats.mobility, STATS_MAX),
      Math.min(stats.burstResist, STATS_MAX),
      Math.min(stats.weight * 10, STATS_MAX),
    ];
    if (!this.animating) {
      this.animating = true;
      requestAnimationFrame(() => this.animate());
    }
  }

  private animate() {
    let needsUpdate = false;
    for (let i = 0; i < 6; i++) {
      const diff = this.targetStats[i] - this.currentStats[i];
      if (Math.abs(diff) > 0.1) {
        this.currentStats[i] += diff * 0.15;
        needsUpdate = true;
      } else {
        this.currentStats[i] = this.targetStats[i];
      }
    }

    this.draw();

    if (needsUpdate) {
      requestAnimationFrame(() => this.animate());
    } else {
      this.animating = false;
    }
  }

  private draw() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    const cx = this.width / 2;
    const cy = this.height / 2;
    const radius = this.width / 2 - 30;

    this.ctx.strokeStyle = 'rgba(126, 240, 255, 0.2)';
    this.ctx.lineWidth = 1;
    for (let level = 1; level <= 4; level++) {
      const r = radius * (level / 4);
      this.ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) this.ctx.moveTo(x, y);
        else this.ctx.lineTo(x, y);
      }
      this.ctx.closePath();
      this.ctx.stroke();
    }

    this.ctx.fillStyle = '#7ef0ff';
    this.ctx.font = '11px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
      const x = cx + Math.cos(angle) * (radius + 18);
      const y = cy + Math.sin(angle) * (radius + 18);
      this.ctx.fillText(LABELS[i], x, y);
    }

    this.ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
      const r = radius * (this.currentStats[i] / STATS_MAX);
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    }
    this.ctx.closePath();

    this.ctx.fillStyle = 'rgba(255, 209, 102, 0.3)';
    this.ctx.fill();
    this.ctx.strokeStyle = '#ffd166';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    this.ctx.fillStyle = '#fff';
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
      const r = radius * (this.currentStats[i] / STATS_MAX);
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      this.ctx.beginPath();
      this.ctx.arc(x, y, 3, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }
}
