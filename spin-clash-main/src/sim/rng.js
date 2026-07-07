// Seeded PRNG (mulberry32) for fully reproducible battles.
// Same seed + same inputs -> identical event stream (enables replay / netcode later).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = 1) {
    this.next = mulberry32(seed);
  }
  // float in [0,1)
  float() {
    return this.next();
  }
  // float in [a,b)
  range(a, b) {
    return a + (b - a) * this.next();
  }
  // true with probability p
  chance(p) {
    return this.next() < p;
  }
  // signed jitter in [-m, m]
  jitter(m) {
    return (this.next() * 2 - 1) * m;
  }
  pick(arr) {
    return arr[(this.next() * arr.length) | 0];
  }
}

// Deterministic 32-bit hash for turning strings/builds into seeds.
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
