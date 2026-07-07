#!/usr/bin/env python3
"""
Generate WAV sound effects and background music for Top vs Top Arena.
Run: python3 assets/generate_sounds.py
Output: assets/*.wav (imported by Godot automatically)
"""

import math
import struct
import wave
import os
from dataclasses import dataclass

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "wav")
SAMPLE_RATE = 22050

@dataclass
class Note:
    freq: float
    dur: float  # seconds
    vol: float = 0.3


def write_wav(filename: str, samples: list[float]):
    path = os.path.join(OUT_DIR, filename)
    n = len(samples)
    data = bytearray()
    for s in samples:
        s = max(-1.0, min(1.0, s))
        data.extend(struct.pack("<h", int(s * 32767)))
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(bytes(data))
    print(f"  wrote {path}  ({n // SAMPLE_RATE}.{((n % SAMPLE_RATE) * 1000) // SAMPLE_RATE:02d}s)")


def envelope(env: str, t: float, dur: float) -> float:
    """Apply an amplitude envelope."""
    r = t / dur
    if env == "decay":
        return max(0.0, 1.0 - r)
    if env == "fade":
        return max(0.0, 1.0 - r ** 2)
    if env == "pop":
        return max(0.0, 1.0 - r) if r < 0.5 else max(0.0, 2.0 - 2.0 * r)
    if env == "sustain":
        return 1.0 if r < 0.9 else max(0.0, 1.0 - 10.0 * (r - 0.9))
    return 1.0


def sine(freq: float, t: float) -> float:
    return math.sin(2.0 * math.pi * freq * t)


def noise() -> float:
    return (hash(str(os.urandom(4))) % 2000000 - 1000000) / 1000000.0


def gen_hit():
    """Short dull thud — low sine + noise, fast decay."""
    dur = 0.15
    n = int(SAMPLE_RATE * dur)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        v = sine(120, t) * 0.35 + noise() * 0.15
        v *= envelope("decay", t, dur)
        samples.append(v)
    write_wav("hit.wav", samples)


def gen_pickup():
    """Rising chime — two ascending tones."""
    dur = 0.35
    n = int(SAMPLE_RATE * dur)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        f = 600 + (t / dur) * 600
        v = sine(f, t) * 0.25 + sine(f * 1.5, t) * 0.12
        v *= envelope("decay", t, dur)
        samples.append(v)
    write_wav("pickup.wav", samples)


def gen_player_death():
    """Descending wobble — frequency sweep down."""
    dur = 0.8
    n = int(SAMPLE_RATE * dur)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        f = 400 - (t / dur) * 350
        v = sine(f, t) * 0.3
        v *= envelope("fade", t, dur)
        samples.append(v)
    write_wav("player_death.wav", samples)


def gen_enemy_death():
    """Noise pop."""
    dur = 0.12
    n = int(SAMPLE_RATE * dur)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        v = noise() * 0.4
        v *= envelope("pop", t, dur)
        samples.append(v)
    write_wav("enemy_death.wav", samples)


def gen_wave_clear():
    """Ascending arpeggio C5 E5 G5."""
    notes = [523, 659, 784]
    note_len = 0.12
    dur = note_len * 3
    n = int(SAMPLE_RATE * dur)
    sn = int(SAMPLE_RATE * note_len)
    samples = []
    for ni, freq in enumerate(notes):
        for i in range(sn):
            t = i / SAMPLE_RATE
            v = sine(freq, t) * 0.25
            v *= envelope("decay", t, note_len)
            samples.append(v)
    write_wav("wave_clear.wav", samples)


def gen_wave_start():
    """Drum hit — low sine + noise."""
    dur = 0.2
    n = int(SAMPLE_RATE * dur)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        v = sine(90, t) * 0.35 + noise() * 0.12
        v *= envelope("decay", t, dur)
        samples.append(v)
    write_wav("wave_start.wav", samples)


def gen_bgm():
    """
    Simple looping background music.
    4 bars of Cm → Ab → Eb → Bb at 120 BPM.
    Uses a basic square-wave lead + sine bass.
    """
    bpm = 120
    beat_sec = 60.0 / bpm
    beats_per_chord = 4
    chord_dur = beat_sec * beats_per_chord
    total_bars = 4
    dur = chord_dur * total_bars
    n = int(SAMPLE_RATE * dur)

    chords = [
        # (bass_note, melody_notes)
        (261.63, [261.63, 311.13, 392.00]),   # Cm
        (207.65, [207.65, 261.63, 311.13]),   # Ab
        (311.13, [311.13, 392.00, 466.16]),   # Eb
        (233.08, [233.08, 311.13, 392.00]),   # Bb
    ]

    samples = []
    for ci, (bass_f, mel_fs) in enumerate(chords):
        cn = int(SAMPLE_RATE * chord_dur)
        for i in range(cn):
            t = i / SAMPLE_RATE
            chord_beat = t / beat_sec

            # Bass — sine
            bass = sine(bass_f, t) * 0.15

            # Lead — square-like (sum of odd harmonics)
            lead = 0.0
            for mi, mf in enumerate(mel_fs):
                pattern = 0.5 if (int(chord_beat) % 2 == 0) else 0.25
                if mi == int(chord_beat) % len(mel_fs):
                    h = sine(mf, t)
                    h += sine(mf * 3, t) * 0.3
                    h += sine(mf * 5, t) * 0.15
                    lead += h * pattern * 0.12

            # Percussion — subtle noise on each beat
            perc = 0.0
            beat_phase = chord_beat - int(chord_beat)
            if beat_phase < 0.05:
                perc = noise() * 0.06 * (1.0 - beat_phase / 0.05)

            v = bass + lead + perc
            samples.append(v)

    write_wav("bgm.wav", samples)


def gen_spin_loop():
    """Gentle spinning whoosh — soft filtered hum, very quiet."""
    dur = 0.8
    n = int(SAMPLE_RATE * dur)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        # soft tone with slight wobble
        v = sine(160 + sine(5.5, t) * 20, t) * 0.06
        # add a whisper of noise
        v += noise() * 0.02
        # gentle fade-in/out loop points
        env = min(1.0, t / 0.05) * min(1.0, (dur - t) / 0.05)
        v *= env
        samples.append(v)
    write_wav("spin_loop.wav", samples)


def main():
    print("Generating sound effects for Top vs Top Arena...")
    # gen_hit()
    # gen_pickup()
    # gen_player_death()
    # gen_enemy_death()
    # gen_wave_clear()
    # gen_wave_start()
    # gen_spin_loop()
    gen_bgm()
    print("Done! Import .wav files from Godot's FileSystem dock.")


if __name__ == "__main__":
    main()
