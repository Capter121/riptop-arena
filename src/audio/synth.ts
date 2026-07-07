type Envelope = {
  attack: number;
  release: number;
  gain: number;
};

export class SynthAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private unlocked = false;
  private ambienceGain: GainNode | null = null;
  private ambienceLfo: OscillatorNode | null = null;
  private ambienceOscillators: OscillatorNode[] = [];

  unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.16;
      this.master.connect(this.context.destination);
    }

    if (this.context.state !== 'running') {
      void this.context.resume();
    }

    this.unlocked = true;
  }

  private pulse(type: OscillatorType, frequency: number, envelope: Envelope, detune = 0, whenOffset = 0) {
    if (!this.context || !this.master || !this.unlocked) return;
    const now = this.context.currentTime + whenOffset;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    osc.detune.setValueAtTime(detune, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(envelope.gain, now + envelope.attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + envelope.attack + envelope.release);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + envelope.attack + envelope.release + 0.02);
  }

  playVoice(id: string) {
    if (!this.unlocked) return;
    // Attempt to play a voice clip from public assets.
    // If the file doesn't exist, this will just fail silently or log to console.
    const audio = new Audio(`/${id}.mp3`);
    audio.volume = 0.8;
    audio.play().catch(e => {
        console.warn(`Voice file /${id}.mp3 not found or blocked.`, e);
    });
  }

  startMenuAmbience() {
    if (!this.context || !this.master || !this.unlocked || this.ambienceGain) return;

    const padGain = this.context.createGain();
    padGain.gain.setValueAtTime(0.0001, this.context.currentTime);
    padGain.gain.linearRampToValueAtTime(0.03, this.context.currentTime + 0.8);
    padGain.connect(this.master);

    const low = this.context.createOscillator();
    low.type = 'triangle';
    low.frequency.value = 74;

    const high = this.context.createOscillator();
    high.type = 'sine';
    high.frequency.value = 148;

    const shimmer = this.context.createOscillator();
    shimmer.type = 'triangle';
    shimmer.frequency.value = 222;

    const lfo = this.context.createOscillator();
    const lfoGain = this.context.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 0.11;
    lfoGain.gain.value = 7;

    lfo.connect(lfoGain);
    lfoGain.connect(low.detune);
    lfoGain.connect(high.detune);

    const shimmerGain = this.context.createGain();
    shimmerGain.gain.value = 0.32;
    shimmer.connect(shimmerGain).connect(padGain);
    low.connect(padGain);
    high.connect(padGain);

    low.start();
    high.start();
    shimmer.start();
    lfo.start();

    this.ambienceGain = padGain;
    this.ambienceLfo = lfo;
    this.ambienceOscillators = [low, high, shimmer];
  }

  stopMenuAmbience() {
    if (!this.context || !this.ambienceGain) return;

    const now = this.context.currentTime;
    this.ambienceGain.gain.cancelScheduledValues(now);
    this.ambienceGain.gain.setValueAtTime(Math.max(this.ambienceGain.gain.value, 0.0001), now);
    this.ambienceGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    const gain = this.ambienceGain;
    const oscillators = [...this.ambienceOscillators];
    const lfo = this.ambienceLfo;

    window.setTimeout(() => {
      try {
        oscillators.forEach((osc) => osc.stop());
        lfo?.stop();
        gain.disconnect();
      } catch {
        // Best-effort teardown for transient ambience nodes.
      }
    }, 420);

    this.ambienceGain = null;
    this.ambienceLfo = null;
    this.ambienceOscillators = [];
  }

  launch(power: number) {
    this.pulse('sawtooth', 180 + power * 220, { attack: 0.01, release: 0.18, gain: 0.14 });
    this.pulse('triangle', 90 + power * 70, { attack: 0.005, release: 0.15, gain: 0.08 }, 6);
  }

  clash(intensity: number) {
    this.pulse('square', 240 + intensity * 90, { attack: 0.002, release: 0.09, gain: 0.08 + intensity * 0.05 });
    this.pulse('triangle', 520 + intensity * 120, { attack: 0.001, release: 0.06, gain: 0.04 }, -18);
  }

  dash() {
    this.pulse('triangle', 330, { attack: 0.003, release: 0.08, gain: 0.07 });
  }

  burst() {
    this.pulse('sawtooth', 110, { attack: 0.005, release: 0.35, gain: 0.16 });
    this.pulse('square', 58, { attack: 0.01, release: 0.42, gain: 0.1 }, -10);
  }

  finish(win: boolean) {
    if (win) {
      this.pulse('triangle', 392, { attack: 0.02, release: 0.2, gain: 0.1 });
      this.pulse('triangle', 523, { attack: 0.02, release: 0.32, gain: 0.08 }, 0, 0.06);
    } else {
      this.pulse('sine', 210, { attack: 0.01, release: 0.22, gain: 0.08 });
      this.pulse('sine', 164, { attack: 0.04, release: 0.38, gain: 0.06 }, 0, 0.03);
    }
  }

  champion() {
    this.pulse('triangle', 392, { attack: 0.01, release: 0.18, gain: 0.12 }, 0, 0);
    this.pulse('triangle', 523, { attack: 0.01, release: 0.2, gain: 0.1 }, 0, 0.1);
    this.pulse('triangle', 659, { attack: 0.01, release: 0.24, gain: 0.09 }, 0, 0.22);
    this.pulse('sawtooth', 784, { attack: 0.02, release: 0.55, gain: 0.08 }, 4, 0.34);
    this.pulse('sine', 988, { attack: 0.04, release: 0.7, gain: 0.04 }, 0, 0.4);
  }
}
