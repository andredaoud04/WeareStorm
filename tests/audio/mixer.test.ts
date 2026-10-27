import { describe, expect, it } from 'vitest';
import { densityGain, Mixer, panFor, softClipCurve, variation, VoiceLimiter } from '../../src/audio/mixer';
import { SOUNDS } from '../../src/audio/sounds';
import { fakeCtx, type FakeAudioContext } from './fakeAudio';

const HIT = SOUNDS.hitLight;

describe('voice limiter', () => {
  it('allows at most 4 hits in any 60 ms window', () => {
    const l = new VoiceLimiter();
    const ok: number[] = [];
    for (let t = 0; t < 60; t += 1) if (l.check('hitLight', 'hit', { caps: [{ max: 4, ms: 60 }] }, 0, t, 100) === null) ok.push(t);
    expect(ok).toHaveLength(4);
    // the window slides: once the first play is 60 ms old there is room again
    expect(l.check('hitLight', 'hit', { caps: [{ max: 4, ms: 60 }] }, 0, ok[0]! + 60, 100)).toBeNull();
  });

  it('enforces the minimum retrigger interval per sound, not per group', () => {
    const l = new VoiceLimiter();
    expect(l.check('hitLight', 'hit', { minGapMs: 12 }, 0, 0, 50)).toBeNull();
    expect(l.check('hitLight', 'hit', { minGapMs: 12 }, 0, 5, 50)).toBe('gap');
    expect(l.check('hitPebble', 'hit', { minGapMs: 12 }, 0, 5, 50)).toBeNull();
    expect(l.check('hitLight', 'hit', { minGapMs: 12 }, 0, 12, 50)).toBeNull();
  });

  it('shares cap windows across a group (all hit kinds count as hits)', () => {
    const l = new VoiceLimiter();
    const ids = ['hitLight', 'hitHeavy', 'hitPebble', 'hitArmor', 'hitLight'];
    const res = ids.map((id, i) => l.check(id, 'hit', HIT, 0, i * 13, 100));
    expect(res.slice(0, 4).every((r) => r === null)).toBe(true);
    expect(res[4]).toBe('cap');
  });

  it('a flood of hits from one frame (x2 speed, big battle) stays bounded', () => {
    const l = new VoiceLimiter();
    let played = 0;
    // 30 v 30 at x2: ~120 hits/s for 3 s, several arriving in the same millisecond
    for (let t = 0; t < 3000; t += 8) for (let k = 0; k < 2; k++) if (l.check('hitLight', 'hit', HIT, 0, t, HIT.len * 1000) === null) played++;
    expect(played).toBeLessThanOrEqual(Math.ceil((3000 / 300) * 8) + 4);
    expect(played).toBeGreaterThan(30); // still lively
  });

  it('the polyphony budget drops chatter first and never stings', () => {
    const l = new VoiceLimiter(10);
    for (let i = 0; i < 6; i++) expect(l.check(`a${i}`, `g${i}`, {}, 1, 0, 1000)).toBeNull();
    expect(l.check('chatter', 'c', {}, 0, 1, 1000)).toBe('budget');
    for (let i = 0; i < 4; i++) expect(l.check(`b${i}`, `h${i}`, {}, 1, 1, 1000)).toBeNull();
    expect(l.check('normal', 'n', {}, 1, 2, 1000)).toBe('budget');
    expect(l.check('sting', 's', {}, 2, 2, 1000)).toBeNull();
    // voices end, room comes back
    expect(l.check('chatter', 'c', {}, 0, 1500, 1000)).toBeNull();
  });

  it('busy groups play each voice quieter', () => {
    expect(densityGain(0)).toBe(1);
    expect(densityGain(8)).toBeLessThan(densityGain(2));
    expect(densityGain(20)).toBeGreaterThan(0.3);
  });
});

describe('mix helpers', () => {
  it('pans gently across the lane', () => {
    expect(panFor(500)).toBeCloseTo(0);
    expect(panFor(0)).toBeCloseTo(-0.55);
    expect(panFor(1000)).toBeCloseTo(0.55);
    expect(panFor(-500)).toBeCloseTo(-0.55);
    expect(panFor(5000)).toBeCloseTo(0.55);
  });

  it('variation stays inside its bounds', () => {
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 500; i++) {
      const v = variation(rng, { pitch: 1.5, db: 2 });
      expect(v.k).toBeGreaterThanOrEqual(Math.pow(2, -1.5 / 12) - 1e-9);
      expect(v.k).toBeLessThanOrEqual(Math.pow(2, 1.5 / 12) + 1e-9);
      expect(v.g).toBeGreaterThanOrEqual(Math.pow(10, -2 / 20) - 1e-9);
      expect(v.g).toBeLessThanOrEqual(Math.pow(10, 2 / 20) + 1e-9);
    }
    expect(variation(rng, undefined)).toEqual({ k: 1, g: 1 });
  });

  it('the safety clipper is transparent below the knee and can never exceed 0.92', () => {
    const c = softClipCurve(4097);
    let max = 0;
    for (let i = 0; i < c.length; i++) {
      const x = (i / (c.length - 1)) * 2 - 1;
      max = Math.max(max, Math.abs(c[i]!));
      if (Math.abs(x) <= 0.7) expect(c[i]).toBeCloseTo(x, 6);
      if (i > 0) expect(c[i]!).toBeGreaterThanOrEqual(c[i - 1]!); // monotonic
    }
    expect(max).toBeLessThanOrEqual(0.92);
  });
});

describe('mixer', () => {
  const make = (now = { t: 0 }) => {
    const { fake, ctx } = fakeCtx();
    const m = new Mixer({ create: () => ctx, now: () => now.t, rng: () => 0.5 });
    return { m, fake, now };
  };

  it('is a silent no-op without Web Audio', () => {
    const m = new Mixer({ create: () => null });
    m.unlock();
    expect(m.ctx).toBeNull();
    expect(m.play('hitLight')).toBe(false);
    m.duck(0.5, 1, 1);
    m.setMusicTone(1000, 0.5);
    m.suspend();
    m.resume();
    expect(m.stats.dropped.locked).toBe(1);
  });

  it('creates nothing before the first gesture and drops sounds instead of queueing them', () => {
    const { m, fake } = make();
    expect(m.play('tap')).toBe(false);
    expect(fake.total()).toBe(0);
    m.unlock();
    expect(m.play('tap')).toBe(true);
  });

  it('builds a limiter and soft clipper on the master bus', () => {
    const { m, fake } = make();
    m.unlock();
    expect(fake.created.compressor).toBe(1);
    expect(fake.created.waveShaper).toBe(1);
  });

  it('the Sound setting gates every sound effect', () => {
    const { m, fake, now } = make();
    m.unlock();
    m.setSoundEnabled(false);
    const before = fake.total();
    for (const id of ['hitLight', 'victory', 'tap', 'thunder'] as const) {
      now.t += 1000;
      expect(m.play(id)).toBe(false);
    }
    expect(fake.total()).toBe(before);
    expect(m.stats.dropped.muted).toBe(4);
    m.setSoundEnabled(true);
    now.t += 1000;
    expect(m.play('tap')).toBe(true);
    expect(fake.total()).toBeGreaterThan(before);
  });

  it('pans cues that carry a lane position', () => {
    const { m, fake } = make();
    m.unlock();
    m.play('tap');
    expect(fake.created.panner ?? 0).toBe(0);
    m.play('poof', { x: 900 });
    expect(fake.created.panner).toBe(1);
  });

  it('a suspended context drops sounds (no burst of stale sounds on resume)', () => {
    const { m, fake } = make();
    m.unlock();
    fake.state = 'suspended';
    expect(m.play('hitLight')).toBe(false);
  });

  it('ducks the music under big moments, keeping the deepest overlapping duck', () => {
    const { m, fake } = make();
    m.unlock();
    const duckGain = () => {
      // master ← duck ← level ← tone ← music: the duck is the 4th gain created (master, sfx, music, level, duck)
      return (m as unknown as { nodes: { duck: { gain: { events: { type: string; v: number }[] } } } }).nodes.duck.gain;
    };
    m.play('thunder');
    const ev1 = duckGain().events.filter((e) => e.type === 'target');
    expect(ev1[0]!.v).toBeCloseTo(SOUNDS.thunder.duck!.depth);
    (fake as FakeAudioContext).currentTime = 0.2;
    m.duck(0.8, 0.1, 0.5); // a shallower duck inside the first keeps the first's depth
    const ev2 = duckGain().events.filter((e) => e.type === 'target');
    expect(ev2[ev2.length - 2]!.v).toBeCloseTo(SOUNDS.thunder.duck!.depth);
    expect(ev2[ev2.length - 1]!.v).toBe(1);
  });

  it('suspends with the page and resumes after', () => {
    const { m, fake } = make();
    m.unlock();
    m.suspend();
    expect(fake.state).toBe('suspended');
    m.resume();
    expect(fake.state).toBe('running');
  });
});
