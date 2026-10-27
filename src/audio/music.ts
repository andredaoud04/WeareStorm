import type { AgeId } from '../contracts';
import type { Mixer } from './mixer';
import { songFor } from './songs';
import { bass, clap, kick, logDrum, marimba, midiHz, pluck, shaker, snare, type Ctx, type Out } from './synth';

/**
 * Music (TECH §1: "a tiny step-sequencer for per-Age music loops"). Songs are data (songs.ts); the sequencer looks
 * ahead on the AudioContext clock, so a late timer callback never shifts a note: timers only decide *when to
 * schedule*, the audio clock decides *when it sounds*. Intensity changes land on the next bar line.
 */

export type InstId = 'marimba' | 'bass' | 'logDrum' | 'pluck' | 'kick' | 'clap' | 'snare' | 'shaker';
/** 0 = hub and menus, 1 = battle, 2 = Storm Rising / Warlord. */
export type Level = 0 | 1 | 2;

export interface TrackDef {
  id: string;
  inst: InstId;
  gain: number;
  /** Lowest and highest intensity level the track plays at. */
  levels: readonly [Level, Level];
  /** One 16-token string per bar of the song... */
  bars?: readonly string[];
  /** ...or a short loop of bars repeated through the song. */
  loop?: readonly string[];
  /** Replacement bars by 0-based bar index (fills, turnarounds). */
  fills?: Readonly<Record<number, string>>;
  /** Chord-degree track: the bar chord's root lands in [chordRoot, chordRoot + 11]. */
  chordRoot?: number;
}

export interface SongDef {
  id: string;
  bpm: number;
  /** Delay of the off-beat 8ths, as a fraction of a 16th. */
  swing: number;
  bars: number;
  /** Key root pitch class (0 = C) and the scale melodic notes come from. */
  key: number;
  scale: readonly number[];
  /** Semitones applied at play time. */
  transpose: number;
  /** One chord symbol per bar: a root and an optional `m` (minor). */
  chords: readonly string[];
  tracks: readonly TrackDef[];
}

export const STEPS_PER_BAR = 16;

interface Inst {
  /** Playable MIDI range, or null for unpitched drums. */
  range: readonly [number, number] | null;
  play(o: Out, t: number, midi: number, vel: number, len: number): void;
}

export const INSTRUMENTS: Record<InstId, Inst> = {
  marimba: { range: [43, 96], play: (o, t, m, v) => marimba(o, t, midiHz(m), v) },
  bass: { range: [24, 60], play: (o, t, m, v, len) => bass(o, t, midiHz(m), v, len) },
  logDrum: { range: [36, 76], play: (o, t, m, v) => logDrum(o, t, midiHz(m), v) },
  pluck: { range: [55, 100], play: (o, t, m, v) => pluck(o, t, midiHz(m), v, 0.4) },
  kick: { range: null, play: (o, t, _m, v) => kick(o, t, v) },
  clap: { range: null, play: (o, t, _m, v) => clap(o, t, v) },
  snare: { range: null, play: (o, t, _m, v) => snare(o, t, v) },
  shaker: { range: null, play: (o, t, _m, v) => shaker(o, t, v) },
};

// ---------------------------------------------------------------------------------------------------------------
// Parsing (pure, tested)

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** `C5` → 72, `F#4` → 66, `Bb3` → 58 (C4 = 60). */
export function noteMidi(name: string): number | null {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return null;
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + PC[m[1]!]! + acc;
}

export interface Chord {
  root: number; // pitch class
  minor: boolean;
}

export function parseChord(sym: string): Chord {
  const m = /^([A-G])([#b]?)(m?)$/.exec(sym);
  if (!m) throw new Error(`bad chord ${sym}`);
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return { root: (PC[m[1]!]! + acc + 12) % 12, minor: m[3] === 'm' };
}

export interface NoteEv {
  step: number;
  midi: readonly number[];
  vel: number;
  /** Length in steps (ties extend it). */
  len: number;
}

const VEL = { '!': 1, '?': 0.5 } as Record<string, number>;
const DRUM_VEL: Record<string, number> = { x: 0.8, X: 1, o: 0.45 };

export function tokens(bar: string): string[] {
  return bar.trim().split(/\s+/);
}

/** The bar string a track plays at bar `i` of the song. */
export function barOf(track: TrackDef, i: number): string {
  const fill = track.fills?.[i];
  if (fill !== undefined) return fill;
  if (track.bars) return track.bars[i] ?? '';
  const loop = track.loop ?? [];
  return loop[i % Math.max(1, loop.length)] ?? '';
}

function chordNotes(c: Chord, degree: string, base: number): number[] {
  const root = base + ((c.root - base) % 12 + 12) % 12;
  const third = root + (c.minor ? 3 : 4);
  switch (degree) {
    case '1':
      return [root];
    case '3':
      return [third];
    case '5':
      return [root + 7];
    case '8':
      return [root + 12];
    case 'T':
      return [root, third, root + 7];
    default:
      throw new Error(`bad chord degree ${degree}`);
  }
}

/** Compiles one track into note events over the whole song. Throws on malformed bars (the data test runs this). */
export function compileTrack(song: SongDef, track: TrackDef): NoteEv[] {
  const out: NoteEv[] = [];
  const drum = INSTRUMENTS[track.inst].range === null;
  for (let b = 0; b < song.bars; b++) {
    const toks = tokens(barOf(track, b));
    if (toks.length !== STEPS_PER_BAR) throw new Error(`${song.id}/${track.id} bar ${b + 1}: ${toks.length} steps, want ${STEPS_PER_BAR}`);
    const chord = track.chordRoot !== undefined ? parseChord(song.chords[b] ?? 'C') : null;
    toks.forEach((tok, s) => {
      const step = b * STEPS_PER_BAR + s;
      if (tok === '.') return;
      if (tok === '-') {
        const last = out[out.length - 1];
        if (last && last.step + last.len === step) last.len += 1;
        return;
      }
      if (drum) {
        const v = DRUM_VEL[tok];
        if (v === undefined) throw new Error(`${song.id}/${track.id} bar ${b + 1}: bad drum token ${tok}`);
        out.push({ step, midi: [], vel: v, len: 1 });
        return;
      }
      const suffix = tok.slice(-1);
      const vel = VEL[suffix] ?? 0.8;
      const body = VEL[suffix] !== undefined ? tok.slice(0, -1) : tok;
      if (chord) {
        out.push({ step, midi: chordNotes(chord, body, track.chordRoot!), vel, len: 1 });
        return;
      }
      const m = noteMidi(body);
      if (m === null) throw new Error(`${song.id}/${track.id} bar ${b + 1}: bad note ${tok}`);
      out.push({ step, midi: [m], vel, len: 1 });
    });
  }
  return out;
}

interface Compiled {
  song: SongDef;
  steps: number;
  /** Per track, events indexed by step. */
  tracks: { def: TrackDef; byStep: (NoteEv | undefined)[] }[];
}

const compiled = new Map<SongDef, Compiled>();

export function compile(song: SongDef): Compiled {
  let c = compiled.get(song);
  if (!c) {
    const steps = song.bars * STEPS_PER_BAR;
    c = {
      song,
      steps,
      tracks: song.tracks.map((def) => {
        const byStep: (NoteEv | undefined)[] = new Array(steps);
        for (const e of compileTrack(song, def)) byStep[e.step] = e;
        return { def, byStep };
      }),
    };
    compiled.set(song, c);
  }
  return c;
}

/** Seconds per 16th step. */
export const stepSeconds = (bpm: number) => 60 / bpm / 4;

/** Swing offset of a step inside its beat, in seconds. */
export function swingOffset(song: SongDef, step: number): number {
  const shape = [0, 0.5, 1, 0.5][step % 4]!;
  return shape * song.swing * stepSeconds(song.bpm);
}

/** Tracks that sound at an intensity level. */
export function activeTracks(song: SongDef, level: Level): string[] {
  return song.tracks.filter((t) => level >= t.levels[0] && level <= t.levels[1]).map((t) => t.id);
}

// ---------------------------------------------------------------------------------------------------------------
// Sequencer

export interface Timer {
  every(fn: () => void, ms: number): unknown;
  cancel(h: unknown): void;
}

const realTimer: Timer = {
  every: (fn, ms) => setInterval(fn, ms),
  cancel: (h) => clearInterval(h as ReturnType<typeof setInterval>),
};

export interface SequencerOptions {
  /** How far ahead of the audio clock notes are scheduled (s). */
  lookahead?: number;
  /** How often the scheduler wakes (ms). */
  intervalMs?: number;
  timer?: Timer;
  rng?: () => number;
}

export class Sequencer {
  private c: Compiled | null = null;
  private level: Level = 0;
  private pending: Level | null = null;
  private step = 0;
  private nextTime = 0;
  private out: GainNode | null = null;
  private handle: unknown = null;
  private readonly lookahead: number;
  private readonly intervalMs: number;
  private readonly timer: Timer;
  private readonly rng: () => number;
  /** Notes scheduled so far (tests and the debug meter). */
  scheduled = 0;

  constructor(
    private readonly ctx: () => Ctx | null,
    private readonly dest: () => AudioNode | null,
    o: SequencerOptions = {},
  ) {
    this.lookahead = o.lookahead ?? 0.15;
    this.intervalMs = o.intervalMs ?? 25;
    this.timer = o.timer ?? realTimer;
    this.rng = o.rng ?? Math.random;
  }

  get playing(): boolean {
    return this.c !== null;
  }

  get songId(): string | null {
    return this.c?.song.id ?? null;
  }

  get currentLevel(): Level {
    return this.pending ?? this.level;
  }

  /** Starts `song` at `level` (or just changes level if it is already playing). */
  play(song: SongDef, level: Level, fadeIn = 0.6): void {
    if (this.c && this.c.song === song) {
      this.setLevel(level);
      return;
    }
    const ctx = this.ctx();
    const dest = this.dest();
    if (!ctx || !dest) return;
    this.stop(0.3);
    this.c = compile(song);
    this.level = level;
    this.pending = null;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.08;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(1, ctx.currentTime + Math.max(0.05, fadeIn));
    g.connect(dest);
    this.out = g;
    this.handle = this.timer.every(() => this.pump(), this.intervalMs);
    this.pump();
  }

  /** Changes intensity on the next bar line. */
  setLevel(level: Level) {
    if (!this.c) {
      this.level = level;
      return;
    }
    this.pending = level === this.level ? null : level;
  }

  stop(fade = 0.4) {
    if (this.handle !== null) this.timer.cancel(this.handle);
    this.handle = null;
    const ctx = this.ctx();
    const g = this.out;
    if (g && ctx) {
      const now = ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.setTargetAtTime(0, now, Math.max(0.01, fade / 4));
      if (typeof setTimeout === 'function') setTimeout(() => g.disconnect(), (fade + 0.5) * 1000);
    }
    this.out = null;
    this.c = null;
    this.pending = null;
  }

  /** Schedules every step that starts before `until` (defaults to the audio clock plus the look-ahead). */
  pump(until?: number) {
    const ctx = this.ctx();
    const c = this.c;
    const out = this.out;
    if (!ctx || !c || !out) return;
    const now = ctx.currentTime;
    const horizon = until ?? now + this.lookahead;
    const dt = stepSeconds(c.song.bpm);
    // the scheduler was starved (tab throttled, long task): skip the missed steps instead of playing a burst
    if (this.nextTime < now - 0.05) {
      const missed = Math.ceil((now - this.nextTime) / dt);
      const bar = Math.floor(this.step / STEPS_PER_BAR);
      this.step += missed;
      this.nextTime += missed * dt;
      // a bar line went by during the stall: the pending intensity change still lands
      if (this.pending !== null && Math.floor(this.step / STEPS_PER_BAR) !== bar) {
        this.level = this.pending;
        this.pending = null;
      }
    }
    const o: Out = { ctx, dest: out };
    while (this.nextTime < horizon) {
      const pos = this.step % c.steps;
      if (pos % STEPS_PER_BAR === 0 && this.pending !== null) {
        this.level = this.pending;
        this.pending = null;
      }
      const t = this.nextTime + swingOffset(c.song, pos) + (this.rng() - 0.5) * 0.004;
      const accent = pos % 4 === 0 ? 1 : 0.88;
      for (const tr of c.tracks) {
        const d = tr.def;
        if (this.level < d.levels[0] || this.level > d.levels[1]) continue;
        const e = tr.byStep[pos];
        if (!e) continue;
        const inst = INSTRUMENTS[d.inst];
        const vel = Math.min(1, e.vel * d.gain * accent * (0.94 + this.rng() * 0.12));
        const len = e.len * dt;
        try {
          if (e.midi.length === 0) inst.play(o, t, 0, vel, len);
          else for (const m of e.midi) inst.play(o, t, m + c.song.transpose, vel / Math.sqrt(e.midi.length), len);
        } catch {
          // never let a voice stop the band
        }
        this.scheduled++;
      }
      this.step++;
      this.nextTime += dt;
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Director: game state → song, intensity, colour

export type MusicMode = 'title' | 'hub' | 'battle' | 'results';

export interface MusicState {
  age: AgeId;
  mode: MusicMode;
  /** Storm Rising reached or the Warlord is on the field. */
  hot: boolean;
  paused: boolean;
}

/** Intensity and tone for a state (pure, tested). */
export function musicPlan(s: MusicState): { level: Level; cutoff: number; gain: number } {
  if (s.mode === 'battle') {
    if (s.paused) return { level: s.hot ? 2 : 1, cutoff: 700, gain: 0.5 };
    return { level: s.hot ? 2 : 1, cutoff: 16000, gain: 1 };
  }
  if (s.mode === 'results') return { level: 0, cutoff: 6000, gain: 0.8 };
  return { level: 0, cutoff: 4200, gain: 0.85 };
}

export class MusicDirector {
  readonly seq: Sequencer;
  private state: MusicState = { age: 'stone', mode: 'title', hot: false, paused: false };
  private started = false;

  constructor(
    private readonly mixer: Mixer,
    o: SequencerOptions = {},
  ) {
    this.seq = new Sequencer(() => mixer.ctx, () => mixer.musicInput(), o);
  }

  /** Called once audio is unlocked: from here on the music follows the state. */
  start() {
    this.started = true;
    this.apply();
  }

  set(next: Partial<MusicState>) {
    const s = { ...this.state, ...next };
    if (s.age === this.state.age && s.mode === this.state.mode && s.hot === this.state.hot && s.paused === this.state.paused) return;
    this.state = s;
    this.apply();
  }

  get current(): Readonly<MusicState> {
    return this.state;
  }

  /** Re-reads the mixer's music switch (settings changed). */
  apply() {
    if (!this.started) return;
    const plan = musicPlan(this.state);
    this.mixer.setMusicTone(plan.cutoff, plan.gain);
    if (!this.mixer.musicEnabled || !this.mixer.ctx) {
      if (this.seq.playing) this.seq.stop(0.5);
      return;
    }
    const song = songFor(this.state.age);
    if (this.seq.playing && this.seq.songId !== song.id) this.seq.stop(0.6);
    this.seq.play(song, plan.level);
  }
}
