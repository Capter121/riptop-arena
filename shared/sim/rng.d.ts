export type RandomSource = {
  nextUint32(): number;
  nextFloat(): number;
  nextInt(min: number, maxExclusive: number): number;
};

export function hashString32(value: string): number;
export function createMulberry32(seed: number): RandomSource;
