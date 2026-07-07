// Canvas 6-axis radar chart for the six stats. Animates between updates.

import { STAT_KEYS, STAT_LABELS } from '../sim/stats.js';
import { hexCss } from './dom.js';

// Per-axis display maxima (a bit above the PRD全陀螺範圍 upper bounds).
const AXIS_MAX = { atk: 42, def: 48, spd: 50, wgt: 48, bst: 38, trj: 42 };
const ORDER = ['atk', 'spd', 'bst', 'trj', 'wgt', 'def']; // visually balanced ring

export class RadarChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cur = Object.fromEntries(ORDER.map((k) => [k, 0]));
    this.target = { ...this.cur };
    this.color = 0xff3b30;
    this._raf = null;
    this._animate = this._animate.bind(this);
    this._resize();
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = this.canvas.clientWidth || 260;
    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.size = size;
  }

  update(stats, color) {
    this._resize();
    this.target = { ...stats };
    if (color != null) this.color = color;
    if (!this._raf) this._raf = requestAnimationFrame(this._animate);
  }

  _animate() {
    let moving = false;
    for (const k of ORDER) {
      const d = (this.target[k] || 0) - this.cur[k];
      if (Math.abs(d) > 0.05) {
        this.cur[k] += d * 0.2;
        moving = true;
      } else {
        this.cur[k] = this.target[k] || 0;
      }
    }
    this._draw();
    this._raf = moving ? requestAnimationFrame(this._animate) : null;
  }

  _draw() {
    const ctx = this.ctx;
    const S = this.size;
    const cx = S / 2;
    const cy = S / 2;
    const R = S * 0.36;
    const n = ORDER.length;
    ctx.clearRect(0, 0, S, S);

    // grid rings
    ctx.strokeStyle = 'rgba(150,180,220,0.16)';
    ctx.lineWidth = 1;
    for (let ring = 1; ring <= 4; ring++) {
      const rr = (R * ring) / 4;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = (-Math.PI / 2) + (i / n) * Math.PI * 2;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // spokes + labels
    ctx.fillStyle = 'rgba(200,220,255,0.75)';
    ctx.font = `600 ${Math.round(S * 0.052)}px Rajdhani, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const a = (-Math.PI / 2) + (i / n) * Math.PI * 2;
      ctx.strokeStyle = 'rgba(150,180,220,0.14)';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.stroke();
      const lx = cx + Math.cos(a) * (R + S * 0.075);
      const ly = cy + Math.sin(a) * (R + S * 0.075);
      ctx.fillText(STAT_LABELS[ORDER[i]], lx, ly);
    }

    // data polygon
    const col = hexCss(this.color);
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const k = ORDER[i % n];
      const v = Math.min(1, (this.cur[k] || 0) / AXIS_MAX[k]);
      const a = (-Math.PI / 2) + (i / n) * Math.PI * 2;
      const x = cx + Math.cos(a) * R * v;
      const y = cy + Math.sin(a) * R * v;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = hexToRgba(this.color, 0.28);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.stroke();

    // vertices
    ctx.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const k = ORDER[i];
      const v = Math.min(1, (this.cur[k] || 0) / AXIS_MAX[k]);
      const a = (-Math.PI / 2) + (i / n) * Math.PI * 2;
      const x = cx + Math.cos(a) * R * v;
      const y = cy + Math.sin(a) * R * v;
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function hexToRgba(n, a) {
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}
