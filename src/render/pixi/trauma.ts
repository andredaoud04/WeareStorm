/**
 * Trauma camera shake (ART_BIBLE §5.15): offset = maxOffset × trauma² × noise(t · 18 Hz), maxOffset 7 pt, maxAngle
 * 0.8°, trauma decays 1.6/s. Presentation only: it moves the world container, never the sim or the DOM HUD.
 */
export const SHAKE = { maxOffset: 7, maxAngleDeg: 0.8, decayPerSec: 1.6, freqHz: 18 } as const;

/** Trauma added per source (ART_BIBLE §5.15 / VFX table). */
export const TRAUMA = {
  tankHit: 0.12,
  baseHit: 0.15,
  splash: 0.2,
  warlordSlam: 0.25,
  warlordIntro: 0.25,
  stormcall: 0.3,
  wardBreak: 0.35,
  tankKill: 0.12,
  warlordKill: 0.5,
  collapse: 0.8,
} as const;

export interface ShakeSample {
  x: number; // pt
  y: number; // pt
  angle: number; // radians
}

const ZERO: ShakeSample = { x: 0, y: 0, angle: 0 };
const MAX_ANGLE = (SHAKE.maxAngleDeg * Math.PI) / 180;

export class Trauma {
  value = 0;

  add(amount: number) {
    if (amount > 0) this.value = Math.min(1, this.value + amount);
  }

  update(dtSec: number) {
    this.value = Math.max(0, this.value - Math.max(0, dtSec) * SHAKE.decayPerSec);
  }

  /** The shake at presentation time `tSec` (smooth noise, one stream per axis). */
  sample(tSec: number): ShakeSample {
    const s = this.value * this.value;
    if (s <= 0) return ZERO;
    const p = tSec * SHAKE.freqHz;
    return { x: SHAKE.maxOffset * s * noise1(p, 1), y: SHAKE.maxOffset * s * noise1(p, 2), angle: MAX_ANGLE * s * noise1(p, 3) };
  }

  /** The largest offset / angle the current trauma can produce (for edge cover). */
  envelope(): ShakeSample {
    const s = this.value * this.value;
    return { x: SHAKE.maxOffset * s, y: SHAKE.maxOffset * s, angle: MAX_ANGLE * s };
  }
}

/** Smooth 1-D value noise in [-1, 1]: a hashed lattice with cosine interpolation. Deterministic per (x, seed). */
export function noise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash(i, seed);
  const b = hash(i + 1, seed);
  const t = (1 - Math.cos(f * Math.PI)) / 2;
  return a + (b - a) * t;
}

function hash(i: number, seed: number): number {
  let h = Math.imul(i, 374761393) ^ Math.imul(seed + 1, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

/**
 * The zoom that keeps a w × h layer covering the whole screen while it is shifted by (dx, dy) and rotated by `angle`
 * around the screen centre — so a shake never shows the empty canvas at an edge.
 */
export function coverScale(w: number, h: number, dx: number, dy: number, angle: number): number {
  if (!dx && !dy && !angle) return 1;
  const c = Math.cos(angle);
  const s = Math.abs(Math.sin(angle));
  const hw = w / 2 + Math.abs(dx);
  const hh = h / 2 + Math.abs(dy);
  return Math.max(1, (hw * c + hh * s) / (w / 2), (hw * s + hh * c) / (h / 2));
}
