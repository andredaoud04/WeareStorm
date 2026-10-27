import { SOUNDS, type SoundDef, type SoundId } from './sounds';
import { clamp, semis, type Ctx } from './synth';

/**
 * The mix (ART_BIBLE polish checklist: "the mix never clips; concurrency limits per SFX; music ducks under big
 * moments").
 *
 *   sounds ─► cue gain ─► panner ─► sfx bus ───────────────────────────────┐
 *   music  ─► music bus ─► tone filter ─► music level ─► duck ─────────────┤
 *                                                                           ▼
 *                              master ─► compressor (limiter) ─► soft clipper ─► destination
 *
 * The compressor holds the sum under about -3 dBFS; the soft clipper after it is a safety net that is transparent
 * below 0.7 and can never output more than 0.92, so the output cannot clip whatever piles up.
 *
 * The context is created lazily on the first user gesture (the title tap). With no Web Audio at all (SSR, tests, old
 * browsers) every call is a silent no-op.
 */

// ---------------------------------------------------------------------------------------------------------------
// Pure helpers (unit-tested)

export interface CapRule {
  minGapMs?: number;
  caps?: readonly { max: number; ms: number }[];
}

/**
 * Per-sound retrigger interval and per-group windows ("at most 4 hits in 60 ms"), plus a global polyphony budget that
 * drops low-priority chatter first. Time is passed in, so this is deterministic and testable.
 */
export class VoiceLimiter {
  private lastBySound = new Map<string, number>();
  private hist = new Map<string, number[]>();
  private active: number[] = [];

  constructor(readonly maxVoices = 28) {}

  /** Plays of `group` within the last `ms` before `now`. */
  recent(group: string, now: number, ms: number): number {
    const h = this.hist.get(group);
    if (!h) return 0;
    let n = 0;
    for (let i = h.length - 1; i >= 0 && now - h[i]! < ms; i--) n++;
    return n;
  }

  /** Voices still sounding at `now`. */
  activeAt(now: number): number {
    let n = 0;
    for (const end of this.active) if (end > now) n++;
    return n;
  }

  /**
   * Asks to play `sound` (in `group`) at `now` ms, lasting `lenMs`. Returns the reason it was refused, or null and
   * records the play.
   */
  check(sound: string, group: string, rule: CapRule, prio: number, now: number, lenMs: number): 'gap' | 'cap' | 'budget' | null {
    const last = this.lastBySound.get(sound);
    if (rule.minGapMs && last !== undefined && now - last < rule.minGapMs) return 'gap';
    for (const c of rule.caps ?? []) if (this.recent(group, now, c.ms) >= c.max) return 'cap';
    if (this.active.length > 64) this.active = this.active.filter((e) => e > now);
    const busy = this.activeAt(now);
    // low-priority chatter gives way first; normal sounds may use the whole budget; stings always play
    if (prio === 0 && busy >= this.maxVoices * 0.6) return 'budget';
    if (prio === 1 && busy >= this.maxVoices) return 'budget';
    this.lastBySound.set(sound, now);
    let h = this.hist.get(group);
    if (!h) this.hist.set(group, (h = []));
    h.push(now);
    if (h.length > 32) h.splice(0, h.length - 32);
    this.active.push(now + lenMs);
    return null;
  }

  reset() {
    this.lastBySound.clear();
    this.hist.clear();
    this.active = [];
  }
}

/** Busy groups play each new voice a little quieter, so a big battle gets denser, not louder. */
export function densityGain(recentCount: number): number {
  return 1 / Math.sqrt(1 + 0.12 * recentCount);
}

/** Lane x (world units, player gate 0, enemy gate 1000) to a gentle stereo position. */
export const LANE = { min: 0, max: 1000 } as const;
export function panFor(x: number, width = 0.55): number {
  const mid = (LANE.min + LANE.max) / 2;
  const half = (LANE.max - LANE.min) / 2;
  return clamp(((x - mid) / half) * width, -width, width);
}

/** Per-play variation: a pitch multiplier and a gain multiplier from ± semitones and ± dB. */
export function variation(rng: () => number, vary: SoundDef['vary']): { k: number; g: number } {
  if (!vary) return { k: 1, g: 1 };
  const k = semis((rng() * 2 - 1) * vary.pitch);
  const g = Math.pow(10, ((rng() * 2 - 1) * vary.db) / 20);
  return { k, g };
}

/** The soft-clip curve: identity below `knee`, a tanh shoulder above it, never beyond `ceiling`. */
export function softClipCurve(n = 2048, knee = 0.7, ceiling = 0.92): Float32Array<ArrayBuffer> {
  const c = new Float32Array(n);
  const room = ceiling - knee;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + room * Math.tanh((a - knee) / room);
    c[i] = Math.sign(x) * Math.min(ceiling, y);
  }
  return c;
}

export const LIMITER = { threshold: -9, knee: 4, ratio: 16, attack: 0.002, release: 0.2 } as const;
export const LEVELS = { master: 0.9, sfx: 0.85, music: 0.42 } as const;

// ---------------------------------------------------------------------------------------------------------------
// The mixer

export interface PlayOpts {
  /** Lane x for panning (world units). */
  x?: number;
  /** Seconds from now. */
  delay?: number;
  /** Semitones. */
  pitch?: number;
  /** Extra gain multiplier. */
  gain?: number;
  param?: number;
  dur?: number;
}

export interface MixerOptions {
  /** Makes the context; return null when Web Audio is unavailable. */
  create?: () => Ctx | null;
  rng?: () => number;
  /** Wall clock in ms for the limiter (defaults to performance.now / Date.now). */
  now?: () => number;
  /** For OfflineAudioContext renders: treat the context as running. */
  offline?: boolean;
}

export interface MixerStats {
  played: number;
  dropped: { gap: number; cap: number; budget: number; muted: number; locked: number };
}

function defaultCreate(): Ctx | null {
  const g = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const AC = g.AudioContext ?? g.webkitAudioContext;
  if (!AC) return null;
  try {
    return new AC({ latencyHint: 'interactive' });
  } catch {
    return null;
  }
}

const wallNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class Mixer {
  readonly limiter = new VoiceLimiter();
  readonly stats: MixerStats = { played: 0, dropped: { gap: 0, cap: 0, budget: 0, muted: 0, locked: 0 } };
  private _ctx: Ctx | null = null;
  private failed = false;
  private resuming = false;
  private soundOn = true;
  private musicOn = true;
  private nodes: {
    master: GainNode;
    comp: DynamicsCompressorNode;
    clip: WaveShaperNode;
    sfx: GainNode;
    music: GainNode;
    tone: BiquadFilterNode;
    level: GainNode;
    duck: GainNode;
  } | null = null;
  private duckDepth = 1;
  private duckEnd = 0;
  private readonly create: () => Ctx | null;
  private readonly rng: () => number;
  private readonly now: () => number;
  private readonly offline: boolean;
  /** Called once the context first exists (the music director hooks in here). */
  onReady: (() => void) | null = null;

  constructor(o: MixerOptions = {}) {
    this.create = o.create ?? defaultCreate;
    this.rng = o.rng ?? Math.random;
    this.now = o.now ?? wallNow;
    this.offline = !!o.offline;
  }

  get ctx(): Ctx | null {
    return this._ctx;
  }

  get soundEnabled() {
    return this.soundOn;
  }

  get musicEnabled() {
    return this.musicOn;
  }

  /** True when scheduled sound will actually be heard soon. */
  get live(): boolean {
    const c = this._ctx;
    if (!c) return false;
    return this.offline || c.state === 'running' || this.resuming;
  }

  /** Creates the context and the bus graph if needed. Safe to call any time; returns false without Web Audio. */
  ensure(): boolean {
    if (this._ctx) return true;
    if (this.failed) return false;
    const c = this.create();
    if (!c) {
      this.failed = true;
      return false;
    }
    this._ctx = c;
    this.build(c);
    this.onReady?.();
    return true;
  }

  private build(c: Ctx) {
    const master = c.createGain();
    master.gain.value = LEVELS.master;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = LIMITER.threshold;
    comp.knee.value = LIMITER.knee;
    comp.ratio.value = LIMITER.ratio;
    comp.attack.value = LIMITER.attack;
    comp.release.value = LIMITER.release;
    const clip = c.createWaveShaper();
    clip.curve = softClipCurve();
    clip.oversample = 'none';
    master.connect(comp);
    comp.connect(clip);
    clip.connect(c.destination);
    const sfx = c.createGain();
    sfx.gain.value = this.soundOn ? LEVELS.sfx : 0;
    sfx.connect(master);
    const music = c.createGain();
    music.gain.value = this.musicOn ? LEVELS.music : 0;
    const tone = c.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 16000;
    tone.Q.value = 0.5;
    const level = c.createGain();
    level.gain.value = 1;
    const duck = c.createGain();
    duck.gain.value = 1;
    music.connect(tone);
    tone.connect(level);
    level.connect(duck);
    duck.connect(master);
    this.nodes = { master, comp, clip, sfx, music, tone, level, duck };
  }

  /** First gesture and every later one until the context runs: create (inside the gesture) and resume. */
  unlock() {
    if (!this.ensure()) return;
    const c = this._ctx as AudioContext;
    if (this.offline || c.state === 'running' || typeof c.resume !== 'function') return;
    if (typeof document !== 'undefined' && document.hidden) return;
    this.resuming = true;
    c.resume().then(
      () => (this.resuming = false),
      () => (this.resuming = false),
    );
  }

  /** The app went to the background: stop the clock (music holds its place). */
  suspend() {
    const c = this._ctx as AudioContext | null;
    if (!c || this.offline || typeof c.suspend !== 'function' || c.state !== 'running') return;
    c.suspend().catch(() => undefined);
  }

  /** Back in the foreground: resume if we had been unlocked. */
  resume() {
    const c = this._ctx as AudioContext | null;
    if (!c || this.offline || typeof c.resume !== 'function' || c.state === 'running') return;
    c.resume().catch(() => undefined);
  }

  setSoundEnabled(on: boolean) {
    this.soundOn = on;
    const n = this.nodes;
    if (n && this._ctx) n.sfx.gain.setTargetAtTime(on ? LEVELS.sfx : 0, this._ctx.currentTime, 0.03);
  }

  setMusicEnabled(on: boolean) {
    this.musicOn = on;
    const n = this.nodes;
    if (n && this._ctx) n.music.gain.setTargetAtTime(on ? LEVELS.music : 0, this._ctx.currentTime, 0.08);
  }

  /** Where the music sequencer connects. */
  musicInput(): AudioNode | null {
    return this.nodes?.music ?? null;
  }

  /** Music colour and level (hub = darker, pause = muffled and lower). */
  setMusicTone(cutoffHz: number, level: number, timeConst = 0.25) {
    const n = this.nodes;
    const c = this._ctx;
    if (!n || !c) return;
    n.tone.frequency.setTargetAtTime(cutoffHz, c.currentTime, timeConst);
    n.level.gain.setTargetAtTime(level, c.currentTime, timeConst);
  }

  /** Dips the music for a big moment. Overlapping ducks keep the deepest level and the latest end. */
  duck(depth: number, hold: number, release: number) {
    const n = this.nodes;
    const c = this._ctx;
    if (!n || !c) return;
    const now = c.currentTime;
    let end = now + hold;
    if (now < this.duckEnd) {
      depth = Math.min(depth, this.duckDepth);
      end = Math.max(end, this.duckEnd);
    }
    this.duckDepth = depth;
    this.duckEnd = end;
    const p = n.duck.gain;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.setTargetAtTime(Math.max(0.0001, depth), now, 0.03);
    p.setTargetAtTime(1, end, Math.max(0.05, release / 3));
  }

  /**
   * Plays a named sound. Returns true if it was scheduled. Sounds are dropped (not queued) while muted, before the
   * first gesture, or when the limiter says the moment is already full.
   */
  play(id: SoundId, o: PlayOpts = {}): boolean {
    const def = SOUNDS[id];
    if (!this.soundOn) return this.drop('muted');
    if (!this._ctx || !this.nodes || !this.live) return this.drop('locked');
    const c = this._ctx;
    const nowMs = this.now() + (o.delay ?? 0) * 1000;
    const group = def.group ?? id;
    const why = this.limiter.check(id, group, def, def.prio, nowMs, def.len * 1000);
    if (why) return this.drop(why);
    const v = variation(this.rng, def.vary);
    const dens = def.prio === 2 ? 1 : densityGain(this.limiter.recent(group, nowMs, 300) - 1);
    const t = c.currentTime + 0.005 + Math.max(0, o.delay ?? 0);
    const g = c.createGain();
    g.gain.value = def.gain * v.g * (o.gain ?? 1) * dens;
    let head: AudioNode = g;
    if (o.x !== undefined && typeof c.createStereoPanner === 'function') {
      const pan = c.createStereoPanner();
      pan.pan.value = panFor(o.x);
      g.connect(pan);
      head = pan;
    }
    head.connect(this.nodes.sfx);
    try {
      def.play({ ctx: c, dest: g }, t, { k: v.k * semis(o.pitch ?? 0), param: o.param ?? 0, dur: o.dur ?? def.len });
    } catch {
      // a voice must never take the game down; drop it
    }
    // free the per-cue nodes once the voice has certainly finished
    const done = (def.len + 1.5 + (o.delay ?? 0)) * 1000;
    if (!this.offline && typeof setTimeout === 'function') {
      setTimeout(() => {
        g.disconnect();
        if (head !== g) head.disconnect();
      }, done);
    }
    if (def.duck) this.duck(def.duck.depth, def.duck.hold + (o.delay ?? 0), def.duck.release);
    this.stats.played++;
    return true;
  }

  private drop(why: keyof MixerStats['dropped']): false {
    this.stats.dropped[why]++;
    return false;
  }

  /** Debug metering (the audio verification script): taps on the bus, the limiter output and the final output. */
  meter(): AudioMeter | null {
    const c = this._ctx;
    const n = this.nodes;
    if (!c || !n) return null;
    return new AudioMeter(c, { pre: n.master, comp: n.comp, out: n.clip }, n.comp);
  }
}

/** Polls analysers on three taps and keeps peak and RMS (debug only). */
export class AudioMeter {
  private taps: { name: 'pre' | 'comp' | 'out'; a: AnalyserNode; buf: Float32Array<ArrayBuffer> }[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  readonly peak = { pre: 0, comp: 0, out: 0 };
  private sumSq = 0;
  private count = 0;
  private loudSumSq = 0;
  private loudCount = 0;
  minReduction = 0;
  over1 = 0;

  constructor(
    ctx: Ctx,
    nodes: Record<'pre' | 'comp' | 'out', AudioNode>,
    private comp: DynamicsCompressorNode,
  ) {
    const sink = ctx.createGain();
    sink.gain.value = 0;
    sink.connect(ctx.destination);
    for (const name of ['pre', 'comp', 'out'] as const) {
      const a = ctx.createAnalyser();
      a.fftSize = 2048;
      nodes[name].connect(a);
      a.connect(sink);
      this.taps.push({ name, a, buf: new Float32Array(a.fftSize) });
    }
  }

  start(intervalMs = 10) {
    this.stop();
    this.timer = setInterval(() => this.sample(), intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private sample() {
    for (const t of this.taps) {
      t.a.getFloatTimeDomainData(t.buf);
      let pk = 0;
      let ss = 0;
      for (let i = 0; i < t.buf.length; i++) {
        const v = t.buf[i]!;
        const a = v < 0 ? -v : v;
        if (a > pk) pk = a;
        ss += v * v;
      }
      if (pk > this.peak[t.name]) this.peak[t.name] = pk;
      if (t.name === 'out') {
        if (pk > 1) this.over1++;
        this.sumSq += ss;
        this.count += t.buf.length;
        if (pk > 0.003) {
          this.loudSumSq += ss;
          this.loudCount += t.buf.length;
        }
      }
    }
    this.minReduction = Math.min(this.minReduction, this.comp.reduction);
  }

  report() {
    const db = (v: number) => (v > 0 ? Math.round(20 * Math.log10(v) * 10) / 10 : -Infinity);
    const rms = this.count ? Math.sqrt(this.sumSq / this.count) : 0;
    const loud = this.loudCount ? Math.sqrt(this.loudSumSq / this.loudCount) : 0;
    return {
      peakOut: this.peak.out,
      peakOutDb: db(this.peak.out),
      peakLimiter: this.peak.comp,
      peakBus: this.peak.pre,
      peakBusDb: db(this.peak.pre),
      rms,
      rmsDb: db(rms),
      rmsActive: loud,
      rmsActiveDb: db(loud),
      maxGainReductionDb: Math.round(this.minReduction * 10) / 10,
      windowsOver1: this.over1,
    };
  }
}
