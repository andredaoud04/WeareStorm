/**
 * Tiny Web Audio voice toolkit (TECH §1: no audio files, everything is synthesized). A voice schedules a handful of
 * short-lived nodes at an absolute context time and lets them free themselves when they end. Everything here works
 * on any BaseAudioContext: the live one, an OfflineAudioContext (WAV renders) or the test fake.
 *
 * House style for a bright clean-cartoon game: sines and triangles carry the tone, noise is always filtered, saws
 * and squares only ever go through a low-pass, and every attack has a few milliseconds of ramp so nothing clicks.
 */

export type Ctx = BaseAudioContext;

/** Where a voice plays: a context and the node its output connects to. */
export interface Out {
  ctx: Ctx;
  dest: AudioNode;
}

const EPS = 0.0001;

export const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
export const semis = (n: number) => Math.pow(2, n / 12);
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Amplitude envelope: linear attack to `peak`, exponential decay to silence (or to a held sustain, then release). */
export interface Env {
  a?: number;
  d: number;
  peak?: number;
  /** Sustain level as a fraction of peak; needs `hold`. */
  s?: number;
  hold?: number;
  r?: number;
}

/** Schedules an envelope on a gain param and returns the time it reaches silence. */
export function envelope(p: AudioParam, t: number, e: Env): number {
  const a = Math.max(0.0008, e.a ?? 0.003);
  const peak = Math.max(EPS * 4, e.peak ?? 1);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  let end = t + a;
  if (e.s !== undefined && e.hold !== undefined) {
    const sv = Math.max(EPS * 2, peak * e.s);
    end += Math.max(0.005, e.d);
    p.exponentialRampToValueAtTime(sv, end);
    end += Math.max(0, e.hold);
    p.setValueAtTime(sv, end);
    end += Math.max(0.01, e.r ?? 0.08);
    p.exponentialRampToValueAtTime(EPS, end);
  } else {
    end += Math.max(0.005, e.d);
    p.exponentialRampToValueAtTime(EPS, end);
  }
  p.setValueAtTime(0, end + 0.001);
  return end;
}

export interface FilterSpec {
  type: BiquadFilterType;
  f: number;
  /** Sweep target (exponential), reached after `time` (default: the whole sound). */
  to?: number;
  time?: number;
  q?: number;
}

function makeFilter(ctx: Ctx, t: number, s: FilterSpec, end: number): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = s.type;
  const nyq = ctx.sampleRate * 0.45;
  f.frequency.setValueAtTime(clamp(s.f, 20, nyq), t);
  if (s.to !== undefined) f.frequency.exponentialRampToValueAtTime(clamp(s.to, 20, nyq), t + Math.max(0.005, s.time ?? end - t));
  f.Q.setValueAtTime(s.q ?? 0.7, t);
  return f;
}

export interface ToneSpec {
  type?: OscillatorType;
  f: number;
  /** Pitch glide target in Hz (exponential), reached after `glide` seconds. */
  to?: number;
  glide?: number;
  /** Start the glide after this delay (a held note that then bends). */
  glideAt?: number;
  env: Env;
  detune?: number;
  filter?: FilterSpec;
  /** Vibrato: rate in Hz, depth in cents, fading in after `delay`. */
  vib?: { rate: number; depth: number; delay?: number };
  /** Two-operator FM: modulator at f × ratio, index decaying from `index` to `indexTo` over `decay` seconds. */
  fm?: { ratio: number; index: number; indexTo?: number; decay?: number };
  /** Amplitude tremolo: rate in Hz, depth 0..1. */
  trem?: { rate: number; depth: number };
}

/** One oscillator through an envelope (plus optional filter, vibrato, FM, tremolo). Returns the end time. */
export function tone(o: Out, t: number, s: ToneSpec): number {
  const { ctx } = o;
  const osc = ctx.createOscillator();
  osc.type = s.type ?? 'sine';
  const nyq = ctx.sampleRate * 0.45;
  osc.frequency.setValueAtTime(clamp(s.f, 10, nyq), t);
  if (s.to !== undefined) {
    const at = t + (s.glideAt ?? 0);
    if (s.glideAt) osc.frequency.setValueAtTime(clamp(s.f, 10, nyq), at);
    osc.frequency.exponentialRampToValueAtTime(clamp(s.to, 10, nyq), at + Math.max(0.004, s.glide ?? 0.1));
  }
  if (s.detune) osc.detune.setValueAtTime(s.detune, t);
  const g = ctx.createGain();
  const end = envelope(g.gain, t, s.env);
  const stopAt = end + 0.03;
  const extra: AudioScheduledSourceNode[] = [];
  if (s.vib) {
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(s.vib.rate, t);
    const depth = ctx.createGain();
    const hz = s.f * (Math.pow(2, s.vib.depth / 1200) - 1);
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(hz, t + (s.vib.delay ?? 0) + 0.05);
    lfo.connect(depth);
    depth.connect(osc.frequency);
    extra.push(lfo);
  }
  if (s.fm) {
    const mod = ctx.createOscillator();
    const mf = s.f * s.fm.ratio;
    mod.frequency.setValueAtTime(clamp(mf, 1, nyq), t);
    const idx = ctx.createGain();
    idx.gain.setValueAtTime(s.fm.index * mf, t);
    idx.gain.exponentialRampToValueAtTime(Math.max(EPS, (s.fm.indexTo ?? 0.01) * mf), t + Math.max(0.005, s.fm.decay ?? 0.1));
    mod.connect(idx);
    idx.connect(osc.frequency);
    extra.push(mod);
  }
  let head: AudioNode = g;
  osc.connect(g);
  if (s.trem) {
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(1 - s.trem.depth / 2, t);
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(s.trem.rate, t);
    const amt = ctx.createGain();
    amt.gain.setValueAtTime(s.trem.depth / 2, t);
    lfo.connect(amt);
    amt.connect(tg.gain);
    head.connect(tg);
    head = tg;
    extra.push(lfo);
  }
  if (s.filter) {
    const f = makeFilter(ctx, t, s.filter, end);
    head.connect(f);
    head = f;
  }
  head.connect(o.dest);
  osc.start(t);
  osc.stop(stopAt);
  for (const x of extra) {
    x.start(t);
    x.stop(stopAt);
  }
  const last = head;
  osc.onended = () => {
    g.disconnect();
    if (last !== g) last.disconnect();
  };
  return end;
}

const noiseCache = new WeakMap<Ctx, AudioBuffer>();

/** Two seconds of white noise, made once per context. */
export function noiseBuffer(ctx: Ctx): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    const n = Math.floor(ctx.sampleRate * 2);
    b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    let seed = 0x2f6b1d3;
    for (let i = 0; i < n; i++) {
      // xorshift: fixed noise, so renders are repeatable
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      d[i] = ((seed >>> 0) / 4294967296) * 2 - 1;
    }
    noiseCache.set(ctx, b);
  }
  return b;
}

export interface NoiseSpec {
  env: Env;
  filter: FilterSpec;
  filter2?: FilterSpec;
  /** Playback rate of the noise buffer (below 1 darkens it). */
  rate?: number;
  /** Offset into the noise buffer, 0..1 (varies the grain). */
  seed?: number;
}

/** A filtered noise burst. Noise is never played raw. Returns the end time. */
export function noise(o: Out, t: number, s: NoiseSpec): number {
  const { ctx } = o;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  if (s.rate) src.playbackRate.setValueAtTime(s.rate, t);
  const g = ctx.createGain();
  const end = envelope(g.gain, t, s.env);
  const f1 = makeFilter(ctx, t, s.filter, end);
  src.connect(f1);
  let head: AudioNode = f1;
  if (s.filter2) {
    const f2 = makeFilter(ctx, t, s.filter2, end);
    head.connect(f2);
    head = f2;
  }
  head.connect(g);
  g.connect(o.dest);
  src.start(t, ((s.seed ?? Math.random()) * 1.7) % 1.9);
  src.stop(end + 0.03);
  src.onended = () => g.disconnect();
  return end;
}

// -----------------------------------------------------------------------------------------------------------------
// Instruments. Each takes a frequency in Hz (or none for drums), a velocity 0..1, and returns its end time.

/** Mallet on a tuned wooden bar: a sine body, the 4:1 overtone that makes the "tok", and a soft knock. */
export function marimba(o: Out, t: number, f: number, vel = 0.8, bright = 1): number {
  const d = clamp(0.62 - Math.log2(f / 262) * 0.2, 0.16, 0.95);
  const end = tone(o, t, { f, env: { a: 0.0015, d, peak: 0.5 * vel } });
  if (f * 4 < 9000) tone(o, t, { f: f * 4, env: { a: 0.001, d: d * 0.16, peak: 0.13 * vel * bright } });
  noise(o, t, { env: { a: 0.0008, d: 0.012, peak: 0.07 * vel * bright }, filter: { type: 'bandpass', f: Math.min(5000, f * 3), q: 1.4 } });
  return end;
}

/** Hollow slit-drum knock with a quick pitch drop. */
export function logDrum(o: Out, t: number, f: number, vel = 0.8): number {
  const end = tone(o, t, { f: f * 1.45, to: f, glide: 0.018, env: { a: 0.0012, d: 0.24, peak: 0.55 * vel } });
  tone(o, t, { f: f * 2.32, to: f * 2.2, glide: 0.02, env: { a: 0.001, d: 0.06, peak: 0.16 * vel } });
  noise(o, t, { env: { a: 0.0008, d: 0.018, peak: 0.1 * vel }, filter: { type: 'lowpass', f: 1800 } });
  return end;
}

/** Round, soft kick: a falling sine and a tiny click. */
export function kick(o: Out, t: number, vel = 0.8, f = 150): number {
  const end = tone(o, t, { f, to: f * 0.31, glide: 0.11, env: { a: 0.002, d: 0.3, peak: 0.85 * vel } });
  tone(o, t, { type: 'triangle', f: 1100, to: 180, glide: 0.012, env: { a: 0.0008, d: 0.018, peak: 0.1 * vel } });
  return end;
}

/** Hand clap: three quick band-passed bursts and a short tail. */
export function clap(o: Out, t: number, vel = 0.8): number {
  for (let i = 0; i < 3; i++) noise(o, t + i * 0.011, { env: { a: 0.0008, d: 0.012, peak: 0.32 * vel }, filter: { type: 'bandpass', f: 1400, q: 1.1 } });
  return noise(o, t + 0.024, { env: { a: 0.001, d: 0.13, peak: 0.26 * vel }, filter: { type: 'bandpass', f: 1250, q: 0.9 } });
}

/** Toy snare: a short triangle body and bright noise. */
export function snare(o: Out, t: number, vel = 0.8): number {
  tone(o, t, { type: 'triangle', f: 200, to: 160, glide: 0.04, env: { a: 0.001, d: 0.08, peak: 0.4 * vel } });
  return noise(o, t, { env: { a: 0.001, d: 0.13, peak: 0.3 * vel }, filter: { type: 'highpass', f: 1800 }, filter2: { type: 'lowpass', f: 8000 } });
}

/** Shaker: a soft swell of very high noise. */
export function shaker(o: Out, t: number, vel = 0.8): number {
  return noise(o, t, { env: { a: 0.008, d: 0.045, peak: 0.16 * vel }, filter: { type: 'highpass', f: 6500 }, filter2: { type: 'lowpass', f: 11000 } });
}

/** Warm round bass: triangle through a low-pass with a sine underneath and a little pluck on top. */
export function bass(o: Out, t: number, f: number, vel = 0.8, len = 0.3): number {
  const d = clamp(len, 0.12, 0.6);
  const end = tone(o, t, { type: 'triangle', f, env: { a: 0.004, d, peak: 0.45 * vel }, filter: { type: 'lowpass', f: 1000, q: 0.5 } });
  tone(o, t, { f, env: { a: 0.004, d: d + 0.05, peak: 0.32 * vel } });
  tone(o, t, { f: f * 2, env: { a: 0.002, d: 0.05, peak: 0.1 * vel } });
  return end;
}

/** Kalimba-like pluck: FM with a bright attack that settles into a pure tone. */
export function pluck(o: Out, t: number, f: number, vel = 0.8, d = 0.5): number {
  return tone(o, t, { f, env: { a: 0.002, d, peak: 0.3 * vel }, fm: { ratio: 3, index: 2.2, indexTo: 0.05, decay: 0.12 } });
}

/** Glassy bell: inharmonic FM with a long decay. */
export function bell(o: Out, t: number, f: number, vel = 0.8, d = 0.8, ratio = 3.5): number {
  return tone(o, t, { f, env: { a: 0.001, d, peak: 0.22 * vel }, fm: { ratio, index: 2.6, indexTo: 0.15, decay: d * 0.6 } });
}

/** Cartoon brass: two detuned saws behind an opening low-pass, a pitch scoop, and late vibrato. */
export function horn(o: Out, t: number, f: number, vel = 0.8, len = 0.4, bright = 1): number {
  const env: Env = { a: 0.035, d: 0.08, s: 0.78, hold: Math.max(0, len - 0.1), r: 0.14, peak: 0.2 * vel };
  const filter: FilterSpec = { type: 'lowpass', f: 2300 * bright, to: 1200 * bright, time: len + 0.2, q: 0.9 };
  let end = 0;
  for (const det of [-7, 7]) {
    end = tone(o, t, { type: 'sawtooth', f: f * 0.94, to: f, glide: 0.06, detune: det, env, filter, vib: { rate: 5.6, depth: 14, delay: 0.16 } });
  }
  return end;
}

/** Air movement: band-passed noise swelling while its centre sweeps. */
export function whoosh(o: Out, t: number, dur: number, f1: number, f2: number, peak = 0.5, q = 1.3): number {
  return noise(o, t, { env: { a: dur * 0.55, d: dur * 0.45, peak }, filter: { type: 'bandpass', f: f1, to: f2, time: dur * 0.8, q } });
}

/** Classic two-step coin: a soft square through a low-pass, a fourth up. */
export function coin(o: Out, t: number, f = 1976, vel = 0.8): number {
  const lp: FilterSpec = { type: 'lowpass', f: 4200 };
  tone(o, t, { type: 'square', f, env: { a: 0.001, d: 0.06, peak: 0.08 * vel }, filter: lp });
  tone(o, t + 0.05, { type: 'square', f: f * 1.335, env: { a: 0.001, d: 0.22, peak: 0.08 * vel }, filter: lp });
  return tone(o, t + 0.05, { f: f * 1.335, env: { a: 0.001, d: 0.25, peak: 0.12 * vel } });
}

/** Soft low thud for impacts on wood and earth. */
export function thud(o: Out, t: number, f = 110, vel = 0.8, d = 0.16): number {
  tone(o, t, { f: f * 1.8, to: f * 0.6, glide: 0.07, env: { a: 0.0015, d, peak: 0.7 * vel } });
  return noise(o, t, { env: { a: 0.001, d: d * 0.6, peak: 0.45 * vel }, filter: { type: 'lowpass', f: 900, to: 300, q: 0.6 } });
}
