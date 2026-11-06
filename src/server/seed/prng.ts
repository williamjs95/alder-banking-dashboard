/**
 * Small deterministic PRNG (mulberry32). The demo data must look random but be
 * reproducible, so tests can assert on it and every visitor sees a coherent
 * company rather than noise.
 */
export type Rng = {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  /** True with the given probability. */
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** RFC 4122 v4-shaped identifier drawn from this generator. */
  uuid(): string;
};

export function hashSeed(input: string): number {
  // FNV-1a, 32-bit.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number) =>
    min + Math.floor(next() * (max - min + 1));

  const hex = (length: number) => {
    let out = "";
    for (let i = 0; i < length; i++) out += int(0, 15).toString(16);
    return out;
  };

  return {
    next,
    int,
    chance: (probability) => next() < probability,
    pick: (items) => items[int(0, items.length - 1)],
    uuid: () =>
      `${hex(8)}-${hex(4)}-4${hex(3)}-${"89ab"[int(0, 3)]}${hex(3)}-${hex(12)}`,
  };
}
