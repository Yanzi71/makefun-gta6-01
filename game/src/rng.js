// Seeded random numbers (mulberry32) so the city, traffic and screenshot scenes are
// deterministic: the same seed always builds the same Solmar.
export class RNG {
  constructor(seed) {
    this.state = (seed >>> 0) || 1;
  }

  /** Next float in [0, 1). */
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min, max) {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  /** A random element of an array. */
  pick(array) {
    return array[Math.floor(this.next() * array.length)];
  }

  /** True with probability p. */
  chance(p) {
    return this.next() < p;
  }

  /** Random sign, -1 or 1. */
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
}

/** A hash of a string, for seeding from a name. */
export function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
