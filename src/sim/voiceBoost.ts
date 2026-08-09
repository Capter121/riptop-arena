import { FIXED_BATTLE_DT } from './fixedStep';
import type { RandomSource } from './rng';

const BYTE_MAX = 255;

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function encodePlayerVoiceFrame(value: number) {
  return Math.round(clamp01(value) * BYTE_MAX);
}

export function decodePlayerVoiceFrame(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > BYTE_MAX) {
    throw new RangeError('Player voice frame must be an integer byte.');
  }
  return value / BYTE_MAX;
}

export class DeterministicAiVoiceBoost {
  private random: RandomSource;
  private phase = 0;
  private targetVolume = 0;
  private currentVolume = 0;
  private shoutTicksRemaining = 0;

  constructor(random: RandomSource) {
    this.random = random;
    this.reset(random);
  }

  reset(random: RandomSource) {
    this.random = random;
    this.phase = random.nextFloat() * Math.PI * 2;
    this.targetVolume = 0;
    this.currentVolume = 0;
    this.shoutTicksRemaining = 0;
  }

  triggerShout(durationSeconds = 1.5) {
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
      throw new RangeError('AI shout duration must be finite and non-negative.');
    }
    this.shoutTicksRemaining = Math.max(
      this.shoutTicksRemaining,
      Math.ceil(durationSeconds / FIXED_BATTLE_DT),
    );
  }

  update() {
    this.phase += FIXED_BATTLE_DT * 8;
    if (this.shoutTicksRemaining > 0) {
      this.shoutTicksRemaining -= 1;
      this.targetVolume = 0.68
        + Math.sin(this.phase) * 0.22
        + (this.random.nextFloat() - 0.5) * 0.12;
    } else {
      const noise = Math.sin(this.phase * 0.5) * 0.2 + Math.cos(this.phase * 1.3) * 0.15;
      this.targetVolume = Math.max(0.08, Math.min(0.48, noise + 0.18));
    }
    this.currentVolume += (this.targetVolume - this.currentVolume) * Math.min(1, FIXED_BATTLE_DT * 10);
    return clamp01(this.currentVolume);
  }
}
