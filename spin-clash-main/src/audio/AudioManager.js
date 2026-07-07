// Procedural audio engine (Web Audio API). All SFX + BGM are SYNTHESISED in
// code — no sample files — so there are ZERO copyright concerns. Real CC0
// tracks can be layered in later via loadTrack(); see README audio notes.

class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.muted = false;
    this._noise = null;
    this._tracks = {}; // file -> { el, src }
    this._curFile = null;
    this._desired = null;
  }

  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.85;
    this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.38;
    this.musicGain.connect(this.master);
    // 2s of white noise reused by all noise-based SFX
    const len = this.ctx.sampleRate * 2;
    this._noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this._noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  // Resume the context on a user gesture (required by browser autoplay policy).
  resume() {
    this._ensure();
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') {
      this.ctx.resume().then(() => this._syncBgm()).catch(() => {});
    } else {
      this._syncBgm();
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.02);
  }
  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // ---- low-level synth helpers --------------------------------------------
  _tone({ type = 'sine', freq, freqEnd = null, dur = 0.2, gain = 0.3, attack = 0.004, dest, detune = 0, when = 0 }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(Math.max(1, freq), t0);
    if (freqEnd != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest || this.sfxGain);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  _noiseBurst({ dur = 0.2, gain = 0.4, type = 'bandpass', freq = 2000, freqEnd = null, q = 1, dest, when = 0 }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(Math.max(40, freq), t0);
    if (freqEnd != null) f.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t0 + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(dest || this.sfxGain);
    src.start(t0, Math.random() * 1.0, dur + 0.05);
    src.stop(t0 + dur + 0.05);
  }

  // ---- SFX -----------------------------------------------------------------
  ui(kind = 'click') {
    this.resume();
    const f = kind === 'select' ? 760 : kind === 'back' ? 320 : 540;
    this._tone({ type: 'triangle', freq: f, freqEnd: f * 1.25, dur: 0.07, gain: 0.16, attack: 0.002 });
  }

  launchCharge() {
    this.resume();
    this._tone({ type: 'sawtooth', freq: 120, freqEnd: 700, dur: 0.9, gain: 0.12 });
  }

  launchRelease(zone) {
    this.resume();
    // ripcord zip
    this._noiseBurst({ dur: 0.3, gain: 0.3, type: 'bandpass', freq: 600, freqEnd: 3200, q: 1.2 });
    if (zone === 'perfect') {
      [784, 1047, 1319].forEach((f, i) => this._tone({ type: 'triangle', freq: f, dur: 0.25, gain: 0.2, when: i * 0.06 }));
    } else if (zone === 'slip') {
      this._tone({ type: 'square', freq: 220, freqEnd: 140, dur: 0.3, gain: 0.18 });
    } else {
      this._tone({ type: 'triangle', freq: 660, dur: 0.18, gain: 0.18 });
    }
  }

  clash(intensity = 0.5) {
    this.resume();
    const v = 0.22 + intensity * 0.5;
    this._noiseBurst({ dur: 0.11, gain: v * 0.5, type: 'highpass', freq: 1900 });
    [3100, 4500, 5900].forEach((f, i) =>
      this._tone({ type: 'square', freq: f * (0.95 + Math.random() * 0.1), dur: 0.17 - i * 0.03, gain: v * 0.1, attack: 0.002 })
    );
    this._tone({ type: 'sine', freq: 190, freqEnd: 80, dur: 0.12, gain: v * 0.32 });
  }

  crit() {
    this.resume();
    // electric zap + boom
    this._tone({ type: 'sawtooth', freq: 1500, freqEnd: 280, dur: 0.26, gain: 0.26 });
    this._noiseBurst({ dur: 0.3, gain: 0.26, type: 'bandpass', freq: 5200, freqEnd: 1400, q: 0.7 });
    this._tone({ type: 'square', freq: 95, freqEnd: 48, dur: 0.22, gain: 0.32 });
  }

  knockback() {
    this.resume();
    this._tone({ type: 'sine', freq: 170, freqEnd: 60, dur: 0.18, gain: 0.36 });
    this._noiseBurst({ dur: 0.26, gain: 0.22, type: 'bandpass', freq: 400, freqEnd: 1700, q: 0.8 });
  }

  ringout() {
    this.resume();
    this._noiseBurst({ dur: 0.45, gain: 0.32, type: 'bandpass', freq: 300, freqEnd: 3200, q: 0.9 });
    this._tone({ type: 'sine', freq: 240, freqEnd: 900, dur: 0.4, gain: 0.18 });
    this._tone({ type: 'sine', freq: 140, freqEnd: 50, dur: 0.3, gain: 0.3, when: 0.32 });
  }

  burst() {
    this.resume();
    this._noiseBurst({ dur: 0.6, gain: 0.5, type: 'lowpass', freq: 1400, freqEnd: 220 });
    this._tone({ type: 'sine', freq: 130, freqEnd: 30, dur: 0.55, gain: 0.5 });
    for (let i = 0; i < 5; i++) this._noiseBurst({ dur: 0.08, gain: 0.13, type: 'highpass', freq: 3200, when: i * 0.04 });
  }

  spinout() {
    this.resume();
    this._tone({ type: 'sawtooth', freq: 420, freqEnd: 55, dur: 0.9, gain: 0.22 });
    this._noiseBurst({ dur: 0.9, gain: 0.12, type: 'lowpass', freq: 900, freqEnd: 200 });
  }

  cheer() {
    this.resume();
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1100;
    f.Q.value = 0.6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.28, t0 + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start(t0, Math.random());
    src.stop(t0 + 1.7);
  }

  challenge() {
    this.resume();
    // rising power chord + a clash for the duel-invite hype
    [392, 523, 659, 784].forEach((f, i) => this._tone({ type: 'sawtooth', freq: f, dur: 0.5, gain: 0.16, when: i * 0.08 }));
    setTimeout(() => this.clash(1), 380);
  }

  victory() {
    this.resume();
    [523, 659, 784, 1047].forEach((f, i) => this._tone({ type: 'triangle', freq: f, dur: 0.32, gain: 0.22, when: i * 0.12 }));
  }
  defeat() {
    this.resume();
    [440, 349, 262].forEach((f, i) => this._tone({ type: 'sawtooth', freq: f, dur: 0.4, gain: 0.18, when: i * 0.16 }));
  }

  // ---- BGM (streamed CC-BY tracks, looped, with crossfade) -----------------
  // High-energy real music (Kevin MacLeod, CC-BY 4.0) to match the arena combat.
  _trackFile(mood) {
    if (mood === 'battle') return 'battle.mp3'; // launch/intro/battle -> Volatile Reaction
    if (mood === 'prebattle') return 'prebattle.mp3'; // garage/arena -> Crossing the Chasm
    return 'menu.mp3'; // menu/result -> Rynos Theme
  }

  _getTrack(file) {
    if (this._tracks[file]) return this._tracks[file];
    const el = new Audio(`${import.meta.env.BASE_URL}audio/${file}`);
    el.loop = true;
    el.preload = 'auto';
    el.volume = 0;
    let src = null;
    try {
      // Route through the graph so the master mute/volume applies.
      src = this.ctx.createMediaElementSource(el);
      src.connect(this.musicGain);
    } catch (e) {
      /* fall back to element.volume only */
    }
    const t = { el, src, file, _raf: 0 };
    this._tracks[file] = t;
    return t;
  }

  _fade(t, to, dur, done) {
    if (t._raf) cancelAnimationFrame(t._raf);
    const from = t.el.volume;
    const start = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - start) / (dur * 1000));
      t.el.volume = from + (to - from) * k;
      if (k < 1) t._raf = requestAnimationFrame(step);
      else if (done) done();
    };
    step();
  }

  playBgm(mood) {
    this._desired = this._trackFile(mood);
    this._syncBgm();
  }

  stopBgm() {
    const cur = this._curFile && this._tracks[this._curFile];
    if (cur) this._fade(cur, 0, 0.5, () => cur.el.pause());
    this._curFile = null;
  }

  _syncBgm() {
    if (!this.ctx || this.ctx.state !== 'running' || !this._desired) return;
    if (this._curFile === this._desired) return;
    const prev = this._curFile && this._tracks[this._curFile];
    if (prev) this._fade(prev, 0, 0.8, () => prev.el.pause());
    const next = this._getTrack(this._desired);
    this._curFile = this._desired;
    const p = next.el.play();
    if (p && p.catch) p.catch(() => {});
    this._fade(next, 1, 0.8);
  }
}

export const audio = new AudioManager();
