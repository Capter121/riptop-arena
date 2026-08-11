const UINT32_RANGE = 0x1_0000_0000;

export function hashString32(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function createMulberry32(seed) {
  let state = seed >>> 0;

  const nextUint32 = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  };

  return {
    nextUint32,
    nextFloat: () => nextUint32() / UINT32_RANGE,
    nextInt: (min, maxExclusive) => {
      if (!Number.isSafeInteger(min) || !Number.isSafeInteger(maxExclusive)) {
        throw new RangeError('Random integer bounds must be safe integers.');
      }
      const range = maxExclusive - min;
      if (range <= 0 || range > UINT32_RANGE) {
        throw new RangeError('Random integer range must be within (0, 2^32].');
      }
      return min + Math.floor((nextUint32() / UINT32_RANGE) * range);
    },
  };
}
