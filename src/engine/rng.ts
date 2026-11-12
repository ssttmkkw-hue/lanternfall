// sfc32 v1 with versioned seeding. Bitwise ops here are intentional and confined to u32 PRNG maths.
export const RNG_VERSION = 'sfc32-v1' as const;

export type RngState = [number, number, number, number];

function fnvStep(h: number, v: number): number {
  // mix 4 bytes of v into FNV-1a state h
  for (let i = 0; i < 4; i++) {
    h ^= (v >>> (i * 8)) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** hash32(matchSeed, round, actorId) → u32. Used for decisionSeed. */
export function hash32(...values: number[]): number {
  let h = 0x811c9dc5;
  for (const v of values) h = fnvStep(h, v | 0);
  // final avalanche (murmur3 fmix32)
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export function seedRng(seed: number): RngState {
  const s: RngState = [hash32(seed, 1), hash32(seed, 2), hash32(seed, 3), hash32(seed, 4)];
  const st = s;
  for (let i = 0; i < 12; i++) nextU32(st);
  return st;
}

/** Advances the state in place and returns a u32. */
export function nextU32(s: RngState): number {
  let [a, b, c, d] = s;
  const t = (((a + b) >>> 0) + d) >>> 0;
  d = (d + 1) >>> 0;
  a = (b ^ (b >>> 9)) >>> 0;
  b = (c + (c << 3)) >>> 0;
  c = ((c << 21) | (c >>> 11)) >>> 0;
  c = (c + t) >>> 0;
  s[0] = a; s[1] = b; s[2] = c; s[3] = d;
  return t;
}

/** Stateless PRNG for controllers: build from a decisionSeed. */
export function makeRng(seed: number): () => number {
  const s = seedRng(seed);
  return () => nextU32(s);
}
