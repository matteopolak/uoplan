function toUint32(n: number): number {
  return (n >>> 0) & 0xffffffff;
}

/**
 * Mulberry32 PRNG.
 * Deterministic, fast, and good enough for UI-level randomization.
 * Returns a float in [0, 1).
 */
export function createSeededRng(seed: number): () => number {
  let a = toUint32(seed);
  return () => {
    a = toUint32(a + 0x6d2b79f5);
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateRandomSeed(): number {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] >>> 0;
  }
  // Fallback for older/non-browser contexts.
  return toUint32(Date.now() ^ Math.floor(Math.random() * 0xffffffff));
}

