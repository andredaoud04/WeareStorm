import { bell, clap, coin, horn, kick, logDrum, marimba, midiHz, noise, pluck, thud, tone, whoosh, type Out } from './synth';

/**
 * Every sound in the game (battle and UI), by name. A recipe draws the sound at time `t` from the synth toolkit; the
 * mixer adds per-play pitch/gain variation, panning, caps and ducking from the same row. Stings are written in
 * C major so they sit inside the Stone music; enemy-side sounds are a little lower and darker than the player's.
 */

export interface VoiceParams {
  /** Pitch multiplier (variation and cue pitch already folded in). */
  k: number;
  /** Free per-sound parameter (queue position, count-up progress, heavy flag...). */
  param: number;
  /** Duration for sounds that span a sim interval (slam windup, Stormcall charge), in seconds. */
  dur: number;
}

export type Recipe = (o: Out, t: number, p: VoiceParams) => void;

export interface Cap {
  max: number;
  ms: number;
}

export interface SoundDef {
  play: Recipe;
  /** Linear gain of one play before variation (the SFX bus and limiter follow). */
  gain: number;
  /** Cap group; sounds sharing a group share its windows (all hit kinds count as 'hit'). Defaults to the id. */
  group?: string;
  /** Minimum time between two plays of this sound. */
  minGapMs?: number;
  /** At most `max` plays of the group in any `ms` window. */
  caps?: readonly Cap[];
  /** Rough length in seconds, for the polyphony budget. */
  len: number;
  /** 0 = combat chatter (first to go when busy), 1 = normal, 2 = player feedback and stings (never budget-dropped). */
  prio: 0 | 1 | 2;
  /** Random variation per play: ± semitones and ± dB. */
  vary?: { pitch: number; db: number };
  /** Music ducking when this plays: depth (0..1 of the music level), hold and release in seconds. */
  duck?: { depth: number; hold: number; release: number };
}

const C = (m: number) => midiHz(m);
// C major, for stings: C4 = 60
const N = { C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, B4: 71, C5: 72, D5: 74, E5: 76, F5: 77, G5: 79, A5: 81, B5: 83, C6: 84, D6: 86, E6: 88, G6: 91, A6: 93, C7: 96, E7: 100 } as const;

const HIT_CAPS: readonly Cap[] = [
  { max: 4, ms: 60 },
  { max: 8, ms: 300 },
];

function sparkle(o: Out, t: number, k: number, notes: readonly number[], gap: number, vel = 0.7) {
  notes.forEach((m, i) => bell(o, t + i * gap, C(m) * k, vel, 0.45, 3.01));
}

function cymbal(o: Out, t: number, peak: number, d: number) {
  noise(o, t, { env: { a: 0.004, d, peak }, filter: { type: 'highpass', f: 5200 }, filter2: { type: 'lowpass', f: 12000 } });
}

const SOUND_TABLE = {
  // ---------------------------------------------------------------------------------------------------- deploys
  /** Card tap / deploy accepted: a crisp wooden tock that climbs with the queue. */
  deployTick: {
    gain: 0.5, len: 0.15, prio: 2, minGapMs: 28,
    play: (o, t, p) => {
      marimba(o, t, C(N.G5) * p.k, 0.7, 1.4);
      logDrum(o, t, C(N.C5) * p.k, 0.35);
    },
  },
  /** A Clubber pops out of the camp: a bouncy "hup" and a drum knock. */
  deployMelee: {
    gain: 0.443, len: 0.25, prio: 1, minGapMs: 60, vary: { pitch: 0.6, db: 1 },
    play: (o, t, p) => {
      tone(o, t, { type: 'triangle', f: C(N.C5) * p.k, to: C(N.G5) * p.k, glide: 0.07, env: { a: 0.004, d: 0.12, peak: 0.55 }, filter: { type: 'lowpass', f: 3200 } });
      logDrum(o, t, C(N.C4) * p.k, 0.5);
    },
  },
  /** A Slinger: lighter, a two-note kalimba flick. */
  deployRanged: {
    gain: 1.032, len: 0.3, prio: 1, minGapMs: 60, vary: { pitch: 0.6, db: 1 },
    play: (o, t, p) => {
      pluck(o, t, C(N.E5) * p.k, 0.8, 0.25);
      pluck(o, t + 0.045, C(N.A5) * p.k, 0.8, 0.3);
      whoosh(o, t, 0.12, 1800, 3600, 0.12);
    },
  },
  /** A Rockhide: a heavy stomp with a grunt-like low sweep. */
  deployTank: {
    gain: 0.424, len: 0.4, prio: 1, minGapMs: 90, vary: { pitch: 0.5, db: 1 },
    play: (o, t, p) => {
      kick(o, t, 0.9, 120 * p.k);
      logDrum(o, t + 0.01, C(43) * p.k, 0.7);
      tone(o, t, { type: 'triangle', f: 150 * p.k, to: 95 * p.k, glide: 0.16, env: { a: 0.01, d: 0.2, peak: 0.35 }, filter: { type: 'lowpass', f: 900 } });
    },
  },
  /** An enemy arrives at the far gate: a quiet distant drum. `param` 1 = a big one. */
  enemySpawn: {
    gain: 0.129, len: 0.3, prio: 0, minGapMs: 180, vary: { pitch: 0.8, db: 1.5 },
    play: (o, t, p) => {
      logDrum(o, t, (p.param ? 82 : 98) * p.k, 0.7);
      if (p.param) kick(o, t, 0.5, 100 * p.k);
    },
  },
  /** One unit of an enemy rally pack stomping in. */
  rallyStomp: {
    gain: 0.299, len: 0.25, prio: 0, minGapMs: 70, caps: [{ max: 3, ms: 400 }], vary: { pitch: 1.5, db: 1.5 },
    play: (o, t, p) => thud(o, t, 92 * p.k, 0.8, 0.14),
  },

  // ---------------------------------------------------------------------------------------------------- attacks
  /** Melee swing: a short whoosh timed to land just before the impact. */
  swing: {
    gain: 0.56, len: 0.15, prio: 0, group: 'swing', minGapMs: 18, caps: [{ max: 3, ms: 80 }, { max: 7, ms: 400 }], vary: { pitch: 2, db: 2 },
    play: (o, t, p) => whoosh(o, t, 0.13, 700 * p.k, 2600 * p.k, 0.6, 1.4),
  },
  /** Tank / Warlord swing: slower, lower air. */
  swingHeavy: {
    gain: 0.589, len: 0.25, prio: 1, group: 'swing', minGapMs: 40, caps: [{ max: 3, ms: 80 }, { max: 7, ms: 400 }], vary: { pitch: 1.5, db: 1.5 },
    play: (o, t, p) => {
      whoosh(o, t, 0.22, 300 * p.k, 1100 * p.k, 0.7, 1);
      tone(o, t + 0.05, { type: 'triangle', f: 95 * p.k, to: 62 * p.k, glide: 0.15, env: { a: 0.04, d: 0.14, peak: 0.25 }, filter: { type: 'lowpass', f: 600 } });
    },
  },
  /** A Slinger winding up: a soft double whirr of the sling. */
  slingWhirl: {
    gain: 0.242, len: 0.25, prio: 0, minGapMs: 60, caps: [{ max: 2, ms: 120 }], vary: { pitch: 2, db: 2 },
    play: (o, t, p) => {
      whoosh(o, t, 0.09, 1100 * p.k, 2100 * p.k, 0.6, 2);
      whoosh(o, t + 0.11, 0.09, 1300 * p.k, 2400 * p.k, 0.7, 2);
    },
  },
  /** Release: a rubber-band twang with a faint flight whistle lasting the pebble's flight (`dur`). */
  slingTwang: {
    gain: 0.314, len: 0.4, prio: 0, group: 'sling', minGapMs: 25, caps: [{ max: 3, ms: 80 }, { max: 7, ms: 400 }], vary: { pitch: 1.5, db: 1.5 },
    play: (o, t, p) => {
      tone(o, t, { type: 'triangle', f: 440 * p.k, to: 270 * p.k, glide: 0.09, env: { a: 0.002, d: 0.12, peak: 0.55 }, filter: { type: 'lowpass', f: 2600 } });
      const fl = Math.min(0.7, Math.max(0.12, p.dur));
      tone(o, t + 0.02, { f: 1500 * p.k, to: 1150 * p.k, glide: fl, env: { a: fl * 0.4, d: fl * 0.6, peak: 0.05 } });
    },
  },
  /** A pebble that found no target lands in the dirt: "plip". */
  projFizzle: {
    gain: 0.157, len: 0.1, prio: 0, minGapMs: 40, vary: { pitch: 2, db: 2 },
    play: (o, t, p) => {
      tone(o, t, { f: 900 * p.k, to: 520 * p.k, glide: 0.03, env: { a: 0.001, d: 0.05, peak: 0.5 } });
      noise(o, t, { env: { a: 0.001, d: 0.03, peak: 0.25 }, filter: { type: 'lowpass', f: 1300 } });
    },
  },
  /** Splash projectiles (later Ages): a rounded boom. */
  projExplode: {
    gain: 0.396, len: 0.45, prio: 1, minGapMs: 50, caps: [{ max: 3, ms: 200 }], vary: { pitch: 1.5, db: 1 },
    play: (o, t, p) => {
      kick(o, t, 0.9, 120 * p.k);
      noise(o, t, { env: { a: 0.002, d: 0.35, peak: 0.6 }, filter: { type: 'lowpass', f: 2200, to: 300, q: 0.5 } });
    },
  },

  // ---------------------------------------------------------------------------------------------------- hits
  /** Ordinary melee hit: a cartoon "bonk". */
  hitLight: {
    gain: 0.3, len: 0.1, prio: 0, group: 'hit', minGapMs: 12, caps: HIT_CAPS, vary: { pitch: 1.5, db: 1.5 },
    play: (o, t, p) => {
      tone(o, t, { f: 380 * p.k, to: 150 * p.k, glide: 0.05, env: { a: 0.0015, d: 0.09, peak: 0.7 } });
      tone(o, t, { type: 'triangle', f: 1400 * p.k, to: 700 * p.k, glide: 0.02, env: { a: 0.001, d: 0.03, peak: 0.14 } });
      noise(o, t, { env: { a: 0.001, d: 0.035, peak: 0.3 }, filter: { type: 'bandpass', f: 2400 * p.k, q: 1 } });
    },
  },
  /** A pebble landing on a head: a small high "tok". */
  hitPebble: {
    gain: 0.346, len: 0.08, prio: 0, group: 'hit', minGapMs: 15, caps: HIT_CAPS, vary: { pitch: 2, db: 1.5 },
    play: (o, t, p) => {
      tone(o, t, { f: 1150 * p.k, to: 760 * p.k, glide: 0.025, env: { a: 0.001, d: 0.05, peak: 0.6 } });
      noise(o, t, { env: { a: 0.0008, d: 0.02, peak: 0.3 }, filter: { type: 'bandpass', f: 3200 * p.k, q: 1.2 } });
    },
  },
  /** Heavy hit: a deep "thwump" with a crunch. */
  hitHeavy: {
    gain: 0.344, len: 0.22, prio: 1, group: 'hit', minGapMs: 25, caps: HIT_CAPS, vary: { pitch: 1.2, db: 1 },
    play: (o, t, p) => {
      tone(o, t, { f: 190 * p.k, to: 55 * p.k, glide: 0.09, env: { a: 0.0015, d: 0.2, peak: 0.85 } });
      noise(o, t, { env: { a: 0.001, d: 0.12, peak: 0.45 }, filter: { type: 'lowpass', f: 1600, to: 400 } });
      noise(o, t, { env: { a: 0.001, d: 0.04, peak: 0.22 }, filter: { type: 'bandpass', f: 2600 * p.k, q: 1.2 } });
    },
  },
  /** Hit on armour: a short metallic "tink-clank", low-passed so it never stings. */
  hitArmor: {
    gain: 0.307, len: 0.18, prio: 0, group: 'hit', minGapMs: 20, caps: HIT_CAPS, vary: { pitch: 1.5, db: 1.5 },
    play: (o, t, p) => {
      tone(o, t, { f: 1250 * p.k, env: { a: 0.001, d: 0.16, peak: 0.3 }, fm: { ratio: 1.414, index: 3.5, indexTo: 0.2, decay: 0.08 }, filter: { type: 'lowpass', f: 5200 } });
      tone(o, t, { f: 240 * p.k, to: 120 * p.k, glide: 0.04, env: { a: 0.001, d: 0.06, peak: 0.4 } });
      noise(o, t, { env: { a: 0.0008, d: 0.02, peak: 0.14 }, filter: { type: 'highpass', f: 3000 }, filter2: { type: 'lowpass', f: 7000 } });
    },
  },
  /** The Warlord's ward absorbs a hit: a glassy "ting". */
  wardTing: {
    gain: 0.763, len: 0.5, prio: 1, minGapMs: 70, caps: [{ max: 3, ms: 300 }], vary: { pitch: 0.5, db: 1.5 },
    play: (o, t, p) => {
      bell(o, t, C(N.A6) * p.k, 0.9, 0.5, 2.76);
      bell(o, t + 0.015, C(N.E7) * p.k, 0.5, 0.35, 2.76);
    },
  },
  /** A hit on a camp wall: a wooden thud. `param` 1 = heavy. */
  baseHit: {
    gain: 0.24, len: 0.2, prio: 1, group: 'base', minGapMs: 45, caps: [{ max: 3, ms: 150 }], vary: { pitch: 1.5, db: 1.5 },
    play: (o, t, p) => {
      logDrum(o, t, 92 * p.k, 0.8);
      thud(o, t, 100 * p.k, p.param ? 0.9 : 0.6, p.param ? 0.22 : 0.14);
      noise(o, t, { env: { a: 0.001, d: 0.05, peak: 0.25 }, filter: { type: 'bandpass', f: 1200 * p.k, q: 1 } });
      if (p.param) kick(o, t, 0.6, 110 * p.k);
    },
  },
  /** A swing that met nothing: a light "fwip". */
  whiff: {
    gain: 0.524, len: 0.12, prio: 0, minGapMs: 40, vary: { pitch: 2, db: 2 },
    play: (o, t, p) => {
      whoosh(o, t, 0.1, 2200 * p.k, 900 * p.k, 0.5, 1.6);
      tone(o, t, { f: 1200 * p.k, to: 700 * p.k, glide: 0.08, env: { a: 0.01, d: 0.07, peak: 0.05 } });
    },
  },

  // ---------------------------------------------------------------------------------------------------- deaths
  /** A troop leaves the fight: a cute pop and a puff. */
  poof: {
    gain: 0.66, len: 0.22, prio: 1, group: 'death', minGapMs: 25, caps: [{ max: 3, ms: 90 }, { max: 6, ms: 400 }], vary: { pitch: 1.5, db: 1 },
    play: (o, t, p) => {
      tone(o, t, { f: 640 * p.k, to: 1250 * p.k, glide: 0.035, env: { a: 0.002, d: 0.05, peak: 0.4 } });
      tone(o, t + 0.03, { f: 1250 * p.k, to: 480 * p.k, glide: 0.12, env: { a: 0.002, d: 0.13, peak: 0.28 } });
      noise(o, t, { env: { a: 0.006, d: 0.18, peak: 0.32 }, filter: { type: 'bandpass', f: 1100, to: 550, q: 0.8 } });
    },
  },
  /** A tank falls: a bigger, lower poof with a thump. */
  poofBig: {
    gain: 0.446, len: 0.4, prio: 1, group: 'death', minGapMs: 40, caps: [{ max: 3, ms: 90 }, { max: 6, ms: 400 }], vary: { pitch: 1, db: 1 },
    play: (o, t, p) => {
      kick(o, t, 0.8, 120 * p.k);
      tone(o, t, { f: 300 * p.k, to: 620 * p.k, glide: 0.05, env: { a: 0.003, d: 0.08, peak: 0.4 } });
      tone(o, t + 0.05, { f: 620 * p.k, to: 190 * p.k, glide: 0.2, env: { a: 0.003, d: 0.22, peak: 0.3 } });
      noise(o, t, { env: { a: 0.01, d: 0.32, peak: 0.42 }, filter: { type: 'bandpass', f: 800, to: 300, q: 0.7 } });
    },
  },
  /** The Warlord topples: a big boom and a long falling brass groan. */
  warlordDown: {
    gain: 0.664, len: 1.4, prio: 2, minGapMs: 500, duck: { depth: 0.35, hold: 0.9, release: 0.8 },
    play: (o, t, p) => {
      kick(o, t, 1, 110 * p.k);
      noise(o, t, { env: { a: 0.01, d: 0.9, peak: 0.6 }, filter: { type: 'lowpass', f: 900, to: 140, q: 0.5 } });
      horn(o, t + 0.05, C(43) * p.k, 0.7, 0.5, 0.7);
      tone(o, t + 0.05, { type: 'triangle', f: C(43) * p.k, to: C(31) * p.k, glide: 0.7, glideAt: 0.2, env: { a: 0.03, d: 0.9, peak: 0.3 }, filter: { type: 'lowpass', f: 800 } });
      sparkle(o, t + 0.45, p.k, [N.C6, N.E6, N.G6], 0.07, 0.6);
    },
  },
  /** Gold from a kill: the classic two-step coin. `param` = coins (1..5) adds sparkle. */
  coin: {
    gain: 1.08, len: 0.3, prio: 1, minGapMs: 35, caps: [{ max: 3, ms: 120 }], vary: { pitch: 0, db: 1 },
    play: (o, t, p) => {
      coin(o, t, C(N.B5) * p.k, 0.9);
      if (p.param >= 3) bell(o, t + 0.09, C(N.E7) * p.k, 0.4, 0.3, 3.01);
    },
  },
  /** A chunk of the enemy camp breaks: a woody crunch with splinters. */
  baseChunk: {
    gain: 0.576, len: 0.3, prio: 1, minGapMs: 90, vary: { pitch: 1, db: 1 },
    play: (o, t, p) => {
      noise(o, t, { env: { a: 0.002, d: 0.16, peak: 0.55 }, filter: { type: 'bandpass', f: 700 * p.k, q: 0.9 } });
      logDrum(o, t, 76 * p.k, 0.8);
      noise(o, t + 0.03, { env: { a: 0.001, d: 0.03, peak: 0.25 }, filter: { type: 'highpass', f: 3000 }, filter2: { type: 'lowpass', f: 7000 } });
      noise(o, t + 0.07, { env: { a: 0.001, d: 0.025, peak: 0.18 }, filter: { type: 'highpass', f: 3400 }, filter2: { type: 'lowpass', f: 7000 } });
    },
  },
  /** Base-damage Gold: a little rising three-coin jingle. */
  chunkCoins: {
    gain: 1.068, len: 0.4, prio: 1, minGapMs: 120,
    play: (o, t, p) => {
      coin(o, t, C(N.G5) * p.k, 0.7);
      coin(o, t + 0.06, C(N.B5) * p.k, 0.7);
      coin(o, t + 0.12, C(N.D6) * p.k, 0.8);
    },
  },

  // ---------------------------------------------------------------------------------------------------- moments
  /** Enemy rally: a two-note war horn over drums. Cartoon-menacing, not scary. */
  rallyHorn: {
    gain: 0.574, len: 1.1, prio: 2, minGapMs: 1000, duck: { depth: 0.55, hold: 1.0, release: 0.7 },
    play: (o, t, p) => {
      horn(o, t, C(50) * p.k, 0.9, 0.22, 0.8);
      horn(o, t + 0.26, C(57) * p.k, 1, 0.6, 0.9);
      horn(o, t + 0.26, C(50) * p.k, 0.6, 0.6, 0.7);
      for (let i = 0; i < 3; i++) logDrum(o, t + i * 0.13, C(43), 0.7);
      kick(o, t + 0.26, 0.7);
    },
  },
  /** The ward goes up at the start of a Warlord battle: a rising shimmer. */
  wardUp: {
    gain: 0.839, len: 1.0, prio: 1, minGapMs: 500,
    play: (o, t, p) => {
      sparkle(o, t, p.k, [N.G5, N.B5, N.D6, N.G6], 0.06, 0.8);
      for (const m of [N.G4, N.B4, N.D5]) tone(o, t, { f: C(m) * p.k, env: { a: 0.25, d: 0.6, peak: 0.12 }, trem: { rate: 7, depth: 0.4 } });
    },
  },
  /** The ward shatters: glass, a thud, then a falling sparkle (a reward). */
  wardBreak: {
    gain: 0.517, len: 1.0, prio: 2, minGapMs: 500, duck: { depth: 0.5, hold: 0.5, release: 0.6 },
    play: (o, t, p) => {
      const parts = [2350, 3120, 2780, 4100, 3560, 4800, 2600];
      parts.forEach((f, i) => tone(o, t + i * 0.011, { f: f * p.k, env: { a: 0.001, d: 0.1 + (i % 3) * 0.08, peak: 0.12 }, fm: { ratio: 1.73, index: 1.5, decay: 0.05 } }));
      noise(o, t, { env: { a: 0.001, d: 0.3, peak: 0.45 }, filter: { type: 'highpass', f: 2500 }, filter2: { type: 'lowpass', f: 9000 } });
      thud(o, t, 120 * p.k, 0.8, 0.25);
      sparkle(o, t + 0.18, p.k, [N.G6, N.D6, N.B5, N.G5], 0.06, 0.6);
    },
  },
  /** The Warlord arrives: dum-dum-DUM and a low brass stab. */
  warlordSting: {
    gain: 0.367, len: 1.6, prio: 2, minGapMs: 1000, duck: { depth: 0.3, hold: 1.6, release: 1.2 },
    play: (o, t, p) => {
      logDrum(o, t, C(43) * p.k, 0.8);
      logDrum(o, t + 0.16, C(43) * p.k, 0.8);
      logDrum(o, t + 0.36, C(36) * p.k, 1);
      kick(o, t + 0.36, 1, 110);
      for (const m of [36, 43, 48]) horn(o, t + 0.36, C(m) * p.k, 0.9, 0.85, 0.75);
      noise(o, t, { env: { a: 0.34, d: 0.6, peak: 0.18 }, filter: { type: 'highpass', f: 4000 }, filter2: { type: 'lowpass', f: 10000 } });
    },
  },
  /** Slam windup: a low rumble swelling over the windup (`dur`). */
  slamRumble: {
    gain: 0.569, len: 1.0, prio: 1, minGapMs: 300,
    play: (o, t, p) => {
      const d = Math.max(0.25, p.dur);
      noise(o, t, { env: { a: d * 0.85, d: 0.15, peak: 0.7 }, filter: { type: 'lowpass', f: 90, to: 420, time: d, q: 0.8 } });
      tone(o, t, { f: 38 * p.k, to: 72 * p.k, glide: d, env: { a: d * 0.8, d: 0.2, peak: 0.45 } });
    },
  },
  /** Slam impact: a big ground pound. */
  slamBoom: {
    gain: 0.579, len: 0.7, prio: 2, minGapMs: 200,
    play: (o, t, p) => {
      kick(o, t, 1, 115 * p.k);
      noise(o, t, { env: { a: 0.002, d: 0.45, peak: 0.7 }, filter: { type: 'lowpass', f: 900, to: 150, q: 0.5 } });
      noise(o, t + 0.02, { env: { a: 0.004, d: 0.25, peak: 0.3 }, filter: { type: 'bandpass', f: 500, q: 0.8 } });
    },
  },
  /** Storm Rising (overtime): a swelling chord, a timpani-like roll and a bright bell at the top. */
  stormRising: {
    gain: 0.601, len: 1.8, prio: 2, minGapMs: 2000, duck: { depth: 0.5, hold: 1.2, release: 1.0 },
    play: (o, t, p) => {
      for (const [m, det] of [[48, -6], [55, 6], [60, -4], [64, 4]] as const) {
        tone(o, t, { type: 'sawtooth', f: C(m) * p.k, detune: det, env: { a: 1.0, d: 0.5, peak: 0.08 }, filter: { type: 'lowpass', f: 260, to: 2600, time: 1.1, q: 1.2 } });
      }
      tone(o, t, { f: 55 * p.k, env: { a: 0.6, d: 0.8, peak: 0.4 }, trem: { rate: 14, depth: 0.5 } });
      noise(o, t, { env: { a: 0.9, d: 0.6, peak: 0.25 }, filter: { type: 'lowpass', f: 220, q: 0.6 } });
      bell(o, t + 1.05, C(N.C6) * p.k, 0.9, 0.9, 3.01);
      bell(o, t + 1.05, C(N.G6) * p.k, 0.6, 0.8, 3.01);
      kick(o, t + 1.05, 0.8);
    },
  },
  /** Later Storm Rising steps: a short distant rumble and a bell. */
  stormStep: {
    gain: 1.026, len: 1.0, prio: 1, minGapMs: 2000,
    play: (o, t, p) => {
      noise(o, t, { env: { a: 0.15, d: 0.8, peak: 0.4 }, filter: { type: 'lowpass', f: 300, to: 120, q: 0.6 } });
      bell(o, t + 0.1, C(N.G5) * p.k, 0.6, 0.6, 3.01);
    },
  },
  /** Stormcall is charged: a bright rising arpeggio. */
  stormReady: {
    gain: 1.067, len: 0.6, prio: 2, minGapMs: 500,
    play: (o, t, p) => {
      [N.C6, N.E6, N.G6, N.C7].forEach((m, i) => pluck(o, t + i * 0.045, C(m) * p.k, 0.8, 0.3));
      bell(o, t + 0.18, C(N.C7) * p.k, 0.5, 0.5, 3.01);
    },
  },
  /** The player presses a ready Stormcall: an electric click. */
  stormTap: {
    gain: 0.95, len: 0.12, prio: 2, minGapMs: 80,
    play: (o, t, p) => {
      tone(o, t, { type: 'square', f: 220 * p.k, to: 880 * p.k, glide: 0.06, env: { a: 0.002, d: 0.08, peak: 0.15 }, filter: { type: 'lowpass', f: 2500 } });
      bell(o, t, C(N.G6) * p.k, 0.4, 0.15, 3.01);
    },
  },
  /** Stormcall cast: a rising electric charge over the time to the strike (`dur`). */
  stormCharge: {
    gain: 0.875, len: 1.0, prio: 1, minGapMs: 300,
    play: (o, t, p) => {
      const d = Math.max(0.2, p.dur);
      tone(o, t, { type: 'sawtooth', f: 110 * p.k, to: 440 * p.k, glide: d, env: { a: d * 0.9, d: 0.06, peak: 0.3 }, filter: { type: 'bandpass', f: 600, to: 2200, time: d, q: 1.5 }, trem: { rate: 22, depth: 0.6 } });
      noise(o, t, { env: { a: d * 0.9, d: 0.05, peak: 0.12 }, filter: { type: 'highpass', f: 4000 }, filter2: { type: 'lowpass', f: 9000 } });
    },
  },
  /** The Stormcall strike: a thunder crack and a rolling boom. */
  thunder: {
    gain: 0.436, len: 1.6, prio: 2, minGapMs: 300, duck: { depth: 0.35, hold: 0.6, release: 0.9 },
    play: (o, t, p) => {
      noise(o, t, { env: { a: 0.001, d: 0.07, peak: 0.75 }, filter: { type: 'highpass', f: 1800 }, filter2: { type: 'lowpass', f: 8000 } });
      noise(o, t + 0.025, { env: { a: 0.001, d: 0.05, peak: 0.5 }, filter: { type: 'highpass', f: 1400 }, filter2: { type: 'lowpass', f: 7000 } });
      tone(o, t, { f: 70 * p.k, to: 32 * p.k, glide: 0.5, env: { a: 0.003, d: 0.8, peak: 0.9 } });
      noise(o, t + 0.01, { env: { a: 0.02, d: 1.4, peak: 0.6 }, filter: { type: 'lowpass', f: 520, to: 110, q: 0.5 } });
      noise(o, t, { env: { a: 0.002, d: 0.25, peak: 0.35 }, filter: { type: 'bandpass', f: 900, q: 0.8 } });
    },
  },
  /** Failed tap (GDD §2.3): a soft two-note "nuh-uh". */
  nope: {
    gain: 0.578, len: 0.2, prio: 2, minGapMs: 110,
    play: (o, t, p) => {
      for (const [i, m] of [N.E4, N.C4].entries()) {
        const tt = t + i * 0.085;
        tone(o, tt, { type: 'square', f: C(m) * p.k, env: { a: 0.004, d: 0.08, peak: 0.16 }, filter: { type: 'lowpass', f: 1100, q: 0.7 } });
        tone(o, tt, { f: C(m) * p.k, env: { a: 0.004, d: 0.09, peak: 0.3 } });
      }
    },
  },
  /** Victory: a marimba-and-brass fanfare in C with a cymbal swell. */
  victory: {
    gain: 0.502, len: 2.4, prio: 2, minGapMs: 2000, duck: { depth: 0, hold: 3.2, release: 1.5 },
    play: (o, t, p) => {
      [N.C5, N.E5, N.G5].forEach((m, i) => {
        marimba(o, t + i * 0.11, C(m) * p.k, 1);
        horn(o, t + i * 0.11, C(m - 12) * p.k, 0.6, 0.09, 1);
      });
      const top = t + 0.33;
      for (const m of [N.C4, N.E4, N.G4, N.C5]) horn(o, top, C(m) * p.k, 0.8, 0.9, 1.1);
      for (let i = 0; i < 6; i++) marimba(o, top + i * 0.055, C(N.C6) * p.k, 0.55 - i * 0.05);
      kick(o, top, 1);
      clap(o, top, 0.7);
      cymbal(o, top, 0.22, 1.4);
      sparkle(o, top + 0.35, p.k, [N.E6, N.G6, N.C7], 0.07, 0.6);
    },
  },
  /** Defeat: a wobbly, sheepish brass slide down. Gentle, a little funny, never harsh. */
  defeat: {
    gain: 1.159, len: 2.4, prio: 2, minGapMs: 2000, duck: { depth: 0, hold: 3.2, release: 1.5 },
    play: (o, t, p) => {
      [N.A4, N.G4, N.E4].forEach((m, i) => horn(o, t + i * 0.3, C(m) * p.k, 0.7, 0.22, 0.6));
      const last = t + 0.9;
      for (const det of [-6, 6]) {
        tone(o, last, { type: 'sawtooth', f: C(63) * p.k, to: C(62) * p.k, glide: 0.8, glideAt: 0.3, detune: det, env: { a: 0.04, d: 0.1, s: 0.8, hold: 0.9, r: 0.35, peak: 0.14 }, filter: { type: 'lowpass', f: 1300, to: 600, q: 0.8 }, vib: { rate: 4.5, depth: 38, delay: 0.25 } });
      }
      logDrum(o, t, C(43) * p.k, 0.5);
      logDrum(o, last, C(36) * p.k, 0.6);
    },
  },
  /** Retreat: a soft neutral two-note pluck. */
  retreat: {
    gain: 1.055, len: 0.6, prio: 2, minGapMs: 1000,
    play: (o, t, p) => {
      pluck(o, t, C(N.G5) * p.k, 0.8, 0.35);
      pluck(o, t + 0.16, C(N.D5) * p.k, 0.8, 0.5);
      whoosh(o, t, 0.3, 1600, 500, 0.15);
    },
  },
  /** A camp collapses at the end: a long crumbling rumble with falling thuds. */
  baseCollapse: {
    gain: 0.35, len: 1.4, prio: 2, minGapMs: 1000,
    play: (o, t, p) => {
      noise(o, t, { env: { a: 0.02, d: 1.3, peak: 0.7 }, filter: { type: 'lowpass', f: 620, to: 120, q: 0.5 } });
      [0, 0.12, 0.27, 0.38, 0.55].forEach((dt, i) => thud(o, t + dt, (88 - i * 6) * p.k, 0.8 - i * 0.08, 0.2));
      kick(o, t, 0.9, 120 * p.k);
    },
  },

  // ---------------------------------------------------------------------------------------------------- UI
  /** Any button press: a soft, short click (ART_BIBLE: every tap answers with a sound). */
  tap: {
    gain: 0.261, len: 0.05, prio: 2, group: 'ui', minGapMs: 25, vary: { pitch: 0.4, db: 0.5 },
    play: (o, t, p) => {
      tone(o, t, { f: 1500 * p.k, to: 1100 * p.k, glide: 0.02, env: { a: 0.001, d: 0.035, peak: 0.5 } });
      tone(o, t, { type: 'triangle', f: 750 * p.k, env: { a: 0.001, d: 0.025, peak: 0.2 } });
      noise(o, t, { env: { a: 0.0006, d: 0.008, peak: 0.12 }, filter: { type: 'bandpass', f: 4000, q: 1 } });
    },
  },
  /** Tab switch: a woody tock. */
  tab: {
    gain: 0.31, len: 0.2, prio: 2, group: 'ui', minGapMs: 40,
    play: (o, t, p) => {
      marimba(o, t, C(N.G5) * p.k, 0.7);
      logDrum(o, t, C(N.G4) * p.k, 0.3);
    },
  },
  toggleOn: {
    gain: 0.74, len: 0.12, prio: 2, group: 'ui', minGapMs: 40,
    play: (o, t, p) => {
      pluck(o, t, C(N.E6) * p.k, 0.7, 0.12);
      pluck(o, t + 0.05, C(N.A6) * p.k, 0.7, 0.16);
    },
  },
  toggleOff: {
    gain: 0.74, len: 0.12, prio: 2, group: 'ui', minGapMs: 40,
    play: (o, t, p) => {
      pluck(o, t, C(N.A5) * p.k, 0.7, 0.12);
      pluck(o, t + 0.05, C(N.E5) * p.k, 0.7, 0.16);
    },
  },
  sheetOpen: {
    gain: 0.41, len: 0.2, prio: 2, minGapMs: 80,
    play: (o, t, p) => {
      whoosh(o, t, 0.18, 500 * p.k, 2200 * p.k, 0.7, 1.2);
      pluck(o, t + 0.1, C(N.C6) * p.k, 0.4, 0.15);
    },
  },
  sheetClose: {
    gain: 0.489, len: 0.18, prio: 2, minGapMs: 80,
    play: (o, t, p) => whoosh(o, t, 0.16, 2000 * p.k, 500 * p.k, 0.7, 1.2),
  },
  /** A toast arriving: a bubble pop. */
  toastPop: {
    gain: 0.29, len: 0.1, prio: 2, minGapMs: 120,
    play: (o, t, p) => {
      tone(o, t, { f: 300 * p.k, to: 1400 * p.k, glide: 0.05, env: { a: 0.002, d: 0.07, peak: 0.55 } });
      noise(o, t, { env: { a: 0.0008, d: 0.01, peak: 0.1 }, filter: { type: 'bandpass', f: 3000, q: 1 } });
    },
  },
  /** Upgrade bought: the register "cha" and a bright "ching". */
  purchase: {
    gain: 0.989, len: 0.8, prio: 2, minGapMs: 100,
    play: (o, t, p) => {
      noise(o, t, { env: { a: 0.001, d: 0.05, peak: 0.4 }, filter: { type: 'highpass', f: 3500 }, filter2: { type: 'lowpass', f: 9000 } });
      noise(o, t + 0.05, { env: { a: 0.001, d: 0.04, peak: 0.3 }, filter: { type: 'highpass', f: 3800 }, filter2: { type: 'lowpass', f: 9000 } });
      bell(o, t + 0.09, C(N.E6) * p.k, 0.9, 0.6, 3.01);
      bell(o, t + 0.09, C(N.B5 + 12) * p.k, 0.6, 0.5, 3.01);
      coin(o, t + 0.09, C(N.B5) * p.k, 0.7);
    },
  },
  /** A new troop unlocked: a short marimba fanfare with a sparkle. */
  unlock: {
    gain: 0.536, len: 1.0, prio: 2, minGapMs: 300,
    play: (o, t, p) => {
      [N.C5, N.E5, N.G5, N.C6].forEach((m, i) => marimba(o, t + i * 0.06, C(m) * p.k, 0.9));
      for (const m of [N.C5, N.E5, N.G5]) pluck(o, t + 0.24, C(m) * p.k, 0.6, 0.6);
      sparkle(o, t + 0.3, p.k, [N.G6, N.C7], 0.08, 0.6);
      kick(o, t + 0.24, 0.5);
    },
  },
  /** Evolve: a big fanfare with brass, a marimba run and thunder-lite. */
  evolve: {
    gain: 0.634, len: 2.0, prio: 2, minGapMs: 1000, duck: { depth: 0.2, hold: 1.8, release: 1.2 },
    play: (o, t, p) => {
      [N.G4, N.C5, N.E5, N.G5, N.C6, N.E6].forEach((m, i) => marimba(o, t + i * 0.05, C(m) * p.k, 0.85));
      for (const m of [N.C4, N.G4, N.C5, N.E5]) horn(o, t + 0.3, C(m) * p.k, 0.85, 1.0, 1.1);
      kick(o, t + 0.3, 1);
      cymbal(o, t + 0.3, 0.22, 1.6);
      noise(o, t + 0.3, { env: { a: 0.02, d: 1.0, peak: 0.3 }, filter: { type: 'lowpass', f: 400, to: 100 } });
      sparkle(o, t + 0.55, p.k, [N.C6, N.E6, N.G6, N.C7], 0.07, 0.7);
    },
  },
  /** Count-up tick (Results): a tiny coin blip that climbs C-major degrees with `param` (0..1 progress). */
  coinTick: {
    gain: 0.32, len: 0.08, prio: 2, minGapMs: 50, vary: { pitch: 0, db: 1 },
    play: (o, t, p) => {
      const steps = [N.E6, N.G6, N.A6, N.C7, 98, N.E7];
      const m = steps[Math.max(0, Math.min(steps.length - 1, Math.floor(p.param * steps.length)))]!;
      tone(o, t, { type: 'triangle', f: C(m) * p.k, env: { a: 0.001, d: 0.06, peak: 0.45 } });
      tone(o, t, { f: C(m) * p.k * 2, env: { a: 0.001, d: 0.03, peak: 0.12 } });
    },
  },
  /** The title tap: a bright start chord and an upward swish. */
  start: {
    gain: 0.326, len: 0.8, prio: 2, minGapMs: 500,
    play: (o, t, p) => {
      for (const m of [N.C5, N.E5, N.G5]) marimba(o, t, C(m) * p.k, 0.8);
      pluck(o, t + 0.08, C(N.C6) * p.k, 0.8, 0.5);
      pluck(o, t + 0.14, C(N.G6) * p.k, 0.6, 0.5);
      whoosh(o, t, 0.3, 400, 3000, 0.25);
    },
  },
} satisfies Record<string, SoundDef>;

export type SoundId = keyof typeof SOUND_TABLE;
export const SOUNDS: Readonly<Record<SoundId, SoundDef>> = SOUND_TABLE;
export const SOUND_IDS = Object.keys(SOUND_TABLE) as SoundId[];
