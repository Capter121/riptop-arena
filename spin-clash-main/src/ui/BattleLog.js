// Turns the sim event stream into the scrolling combat log (PRD ch.11.2).
// Same event stream that drives the 3D VFX -> log and visuals stay causal.

import { el, hexCss } from './dom.js';

export class BattleLog {
  constructor(container, names, colors) {
    this.container = container;
    this.names = names;
    this.colors = colors; // [hex, hex]
    this.maxLines = 90;
  }

  _t(sec) {
    return `[${sec.toFixed(1).padStart(4, '0')}s]`;
  }

  _name(idx) {
    const c = hexCss(this.colors[idx]);
    return `<span class="log-name" style="color:${c}">${this.names[idx]}</span>`;
  }

  push(html, cls = '') {
    const line = el('div', { class: `log-line ${cls}`, html });
    this.container.appendChild(line);
    while (this.container.children.length > this.maxLines) {
      this.container.removeChild(this.container.firstChild);
    }
    this.container.scrollTop = this.container.scrollHeight;
  }

  handle(ev) {
    switch (ev.type) {
      case 'start':
        this.push(`${this._t(0)} <b>開戰！</b> ${this._name(0)} vs ${this._name(1)}`, 'log-start');
        break;
      case 'hit': {
        const dmg = Math.round(ev.dmg);
        let extra = '';
        if (ev.counter > 1.001) extra += ' <span class="log-counter">相剋 ×1.13</span>';
        else if (ev.counter < 0.999) extra += ' <span class="log-weak">被剋 ×0.87</span>';
        for (const p of ev.procs || []) {
          if (p.proc === 'burn') extra += ` <span class="log-burn">灼燒追擊 +${Math.round(p.value)}</span>`;
          if (p.proc === 'chaos') extra += ` <span class="log-chaos">混沌爆發(真傷) ${Math.round(p.value)}</span>`;
        }
        if (ev.crit) {
          this.push(`${this._t(ev.t)} ${this._name(ev.byIdx)} <b class="log-crit">爆擊！！</b> 造成 <b>${dmg}</b> 傷害${extra}`, 'log-crit-line');
        } else {
          this.push(`${this._t(ev.t)} ${this._name(ev.byIdx)} 衝撞！造成 <b>${dmg}</b> 傷害${extra}`);
        }
        break;
      }
      case 'dodge':
        this.push(`${this._t(ev.t)} ${this._name(ev.byIdx)} <span class="log-dodge">迴避！</span>`, 'log-dim');
        break;
      case 'reflect':
        this.push(`${this._t(ev.t)} ${this._name(ev.byIdx)} <span class="log-reflect">反震！</span>反彈 <b>${Math.round(ev.dmg)}</b> 傷害`);
        break;
      case 'knockback':
        this.push(`${this._t(ev.t)} ${this._name(ev.byIdx)} <span class="log-counter">擊退！</span>${this._name(ev.targetIdx)} 被打退`, 'log-dim');
        break;
      case 'cyclone':
        this.push(`${this._t(ev.t)} ${this._name(ev.idx)} <span class="log-cyclone">氣旋 +${ev.stacks} 層</span>`, 'log-dim');
        break;
      case 'status':
        this.push(
          `${this._t(ev.t)} ${this._name(0)} 續航 <b>${Math.round(ev.stamina[0] * 100)}%</b>｜${this._name(1)} 續航 <b>${Math.round(ev.stamina[1] * 100)}%</b>`,
          'log-status'
        );
        break;
      case 'finish': {
        const labels = { spinout: '擊停', ringout: '彈飛', burst: '解體', decision: '判定' };
        this.push(
          `${this._t(ev.t)} ${this._name(ev.winnerIdx)} <b class="log-win">${labels[ev.winType]}獲勝！</b>`,
          'log-finish'
        );
        break;
      }
      default:
        break;
    }
  }
}
