import { describe, expect, it } from 'vitest';
import { AGE_ORDER } from '../../src/contracts';
import { Mixer } from '../../src/audio/mixer';
import {
  activeTracks, compile, compileTrack, INSTRUMENTS, musicPlan, MusicDirector, noteMidi, parseChord, Sequencer, STEPS_PER_BAR, stepSeconds, swingOffset,
  tokens, barOf, type Timer,
} from '../../src/audio/music';
import { SONGS, songFor, STONE_SONG } from '../../src/audio/songs';
import { fakeCtx } from './fakeAudio';

const manualTimer = () => {
  const fns = new Map<number, () => void>();
  let id = 0;
  const timer: Timer = {
    every: (fn) => {
      fns.set(++id, fn);
      return id;
    },
    cancel: (h) => fns.delete(h as number),
  };
  return { timer, fire: () => fns.forEach((f) => f()), count: () => fns.size };
};

describe('music data (every song is well-formed)', () => {
  const songs = Object.values(SONGS);

  it('parses note names', () => {
    expect(noteMidi('C4')).toBe(60);
    expect(noteMidi('A4')).toBe(69);
    expect(noteMidi('F#4')).toBe(66);
    expect(noteMidi('Bb3')).toBe(58);
    expect(noteMidi('H2')).toBeNull();
    expect(parseChord('Am')).toEqual({ root: 9, minor: true });
    expect(() => parseChord('Q7')).toThrow();
  });

  it.each(songs.map((s) => [s.id, s] as const))('%s: bars, steps, ranges and key', (_id, song) => {
    expect(song.bpm).toBeGreaterThanOrEqual(60);
    expect(song.bpm).toBeLessThanOrEqual(180);
    expect(song.bars).toBeGreaterThanOrEqual(8);
    expect(song.bars).toBeLessThanOrEqual(16);
    expect(song.chords).toHaveLength(song.bars);
    for (const c of song.chords) {
      const ch = parseChord(c);
      // diatonic triads only: root, third and fifth all in the scale
      for (const pc of [ch.root, ch.root + (ch.minor ? 3 : 4), ch.root + 7]) expect(song.scale, `${song.id} chord ${c}`).toContain((pc - song.key + 12) % 12);
    }
    const ids = new Set<string>();
    for (const tr of song.tracks) {
      expect(ids.has(tr.id), `duplicate track ${tr.id}`).toBe(false);
      ids.add(tr.id);
      expect(tr.gain).toBeGreaterThan(0);
      expect(tr.gain).toBeLessThanOrEqual(1);
      expect(tr.levels[0]).toBeLessThanOrEqual(tr.levels[1]);
      expect(!!tr.bars !== !!tr.loop, `${tr.id}: exactly one of bars/loop`).toBe(true);
      if (tr.bars) expect(tr.bars, tr.id).toHaveLength(song.bars);
      if (tr.loop) expect(song.bars % tr.loop.length, `${tr.id} loop divides the song`).toBe(0);
      for (const k of Object.keys(tr.fills ?? {})) expect(Number(k)).toBeLessThan(song.bars);
      for (let b = 0; b < song.bars; b++) expect(tokens(barOf(tr, b)), `${tr.id} bar ${b + 1}`).toHaveLength(STEPS_PER_BAR);
      const evs = compileTrack(song, tr);
      expect(evs.length, `${tr.id} has notes`).toBeGreaterThan(0);
      const range = INSTRUMENTS[tr.inst].range;
      for (const e of evs) {
        expect(e.step).toBeLessThan(song.bars * STEPS_PER_BAR);
        expect(e.vel).toBeGreaterThan(0);
        expect(e.vel).toBeLessThanOrEqual(1);
        if (range === null) {
          expect(e.midi).toHaveLength(0);
          continue;
        }
        for (const m of e.midi) {
          const played = m + song.transpose;
          expect(played, `${tr.id} note ${m} in ${tr.inst} range`).toBeGreaterThanOrEqual(range[0]);
          expect(played).toBeLessThanOrEqual(range[1]);
          expect(song.scale, `${tr.id} note ${m} is in the key`).toContain((m - song.key + 120) % 12);
        }
      }
    }
  });

  it('rejects malformed bars', () => {
    const bad = { ...STONE_SONG, tracks: [{ id: 'x', inst: 'marimba' as const, gain: 0.5, levels: [0, 2] as const, loop: ['C5 . . .'] }] };
    expect(() => compileTrack(bad, bad.tracks[0]!)).toThrow(/steps/);
    const bad2 = { ...STONE_SONG, tracks: [{ id: 'x', inst: 'kick' as const, gain: 0.5, levels: [0, 2] as const, loop: ['C5 . . . . . . . . . . . . . . .'] }] };
    expect(() => compileTrack(bad2, bad2.tracks[0]!)).toThrow(/drum/);
  });

  it('Stone is the GDD mood: 112 bpm, major, marimba lead, log drums from battle on', () => {
    expect(STONE_SONG.bpm).toBe(112);
    expect(STONE_SONG.scale).toEqual([0, 2, 4, 5, 7, 9, 11]);
    const lead = STONE_SONG.tracks.find((t) => t.id === 'lead')!;
    expect(lead.inst).toBe('marimba');
    expect(activeTracks(STONE_SONG, 0)).toEqual(expect.arrayContaining(['lead', 'bass']));
    expect(activeTracks(STONE_SONG, 0)).not.toContain('logs');
    expect(activeTracks(STONE_SONG, 1)).toEqual(expect.arrayContaining(['lead', 'bass', 'logs', 'kick']));
    expect(activeTracks(STONE_SONG, 2).length).toBeGreaterThan(activeTracks(STONE_SONG, 1).length);
    // the hub variant is thinner than battle, which is thinner than the storm
    expect(activeTracks(STONE_SONG, 0).length).toBeLessThan(activeTracks(STONE_SONG, 1).length);
  });

  it('the loop has no seam: the last bar is the dominant, leading back to the tonic', () => {
    expect(STONE_SONG.chords[STONE_SONG.chords.length - 1]).toBe('G');
    expect(STONE_SONG.chords[0]).toBe('C');
  });

  it('every Age has a song (Ages without their own fall back to Stone)', () => {
    for (const a of AGE_ORDER) expect(songFor(a).bars).toBeGreaterThan(0);
  });
});

describe('sequencer', () => {
  const setup = () => {
    const { fake, ctx } = fakeCtx();
    const m = new Mixer({ create: () => ctx, rng: () => 0.5 });
    m.unlock();
    const t = manualTimer();
    const seq = new Sequencer(() => m.ctx, () => m.musicInput(), { timer: t.timer, rng: () => 0.5, lookahead: 0.15 });
    return { fake, m, t, seq };
  };

  it('schedules on the audio clock without drift: step n sounds at start + n × step + swing', () => {
    const { fake, seq } = setup();
    seq.play(STONE_SONG, 1);
    const dt = stepSeconds(112);
    // run 40 s of audio clock with a jittery timer
    let lastStep = 0;
    for (let i = 0; i < 1600; i++) {
      fake.currentTime += 0.025 + ((i * 7) % 5) * 0.001;
      seq.pump();
      lastStep = (seq as unknown as { step: number }).step;
    }
    const nextTime = (seq as unknown as { nextTime: number }).nextTime;
    expect(nextTime).toBeCloseTo(0.08 + lastStep * dt, 9);
    expect(nextTime - fake.currentTime).toBeLessThanOrEqual(0.15 + dt);
    expect(nextTime).toBeGreaterThan(fake.currentTime);
  });

  it('swing delays only the off-beats', () => {
    expect(swingOffset(STONE_SONG, 0)).toBe(0);
    expect(swingOffset(STONE_SONG, 4)).toBe(0);
    expect(swingOffset(STONE_SONG, 2)).toBeGreaterThan(swingOffset(STONE_SONG, 1));
  });

  it('changes intensity on the next bar line, not mid-bar', () => {
    const { fake, seq } = setup();
    seq.play(STONE_SONG, 0);
    fake.currentTime = 0.5;
    seq.pump();
    seq.setLevel(1);
    expect(seq.currentLevel).toBe(1);
    expect((seq as unknown as { level: number }).level).toBe(0);
    const bar = stepSeconds(112) * 16;
    while (fake.currentTime < bar - 0.3) {
      fake.currentTime += 0.025;
      seq.pump();
    }
    expect((seq as unknown as { level: number }).level).toBe(0);
    while (fake.currentTime < bar + 0.2) {
      fake.currentTime += 0.025;
      seq.pump();
    }
    expect((seq as unknown as { level: number }).level).toBe(1);
  });

  it('a pending intensity change survives a scheduler stall across the bar line', () => {
    const { fake, seq } = setup();
    seq.play(STONE_SONG, 0);
    seq.setLevel(2);
    fake.currentTime = stepSeconds(112) * 16 * 3; // starved for three bars
    seq.pump();
    expect((seq as unknown as { level: number }).level).toBe(2);
  });

  it('battle intensity schedules more notes than the hub', () => {
    const count = (level: 0 | 1 | 2) => {
      const { fake, seq } = setup();
      seq.play(STONE_SONG, level);
      for (let i = 0; i < 400; i++) {
        fake.currentTime += 0.05;
        seq.pump();
      }
      return seq.scheduled;
    };
    expect(count(1)).toBeGreaterThan(count(0));
    expect(count(2)).toBeGreaterThan(count(1));
  });

  it('skips missed steps after a stall instead of bursting', () => {
    const { fake, seq } = setup();
    seq.play(STONE_SONG, 1);
    seq.pump();
    const before = seq.scheduled;
    fake.currentTime = 30; // the timer was starved for 30 s
    seq.pump();
    expect(seq.scheduled - before).toBeLessThan(20);
  });

  it('stops its timer and detaches', () => {
    const { seq, t } = setup();
    seq.play(STONE_SONG, 1);
    expect(t.count()).toBe(1);
    seq.stop();
    expect(t.count()).toBe(0);
    expect(seq.playing).toBe(false);
  });

  it('compiles once per song', () => {
    expect(compile(STONE_SONG)).toBe(compile(STONE_SONG));
  });
});

describe('music director', () => {
  it('maps game state to intensity and tone', () => {
    expect(musicPlan({ age: 'stone', mode: 'hub', hot: false, paused: false }).level).toBe(0);
    expect(musicPlan({ age: 'stone', mode: 'battle', hot: false, paused: false }).level).toBe(1);
    expect(musicPlan({ age: 'stone', mode: 'battle', hot: true, paused: false }).level).toBe(2);
    const paused = musicPlan({ age: 'stone', mode: 'battle', hot: false, paused: true });
    const live = musicPlan({ age: 'stone', mode: 'battle', hot: false, paused: false });
    expect(paused.cutoff).toBeLessThan(live.cutoff);
    expect(paused.gain).toBeLessThan(live.gain);
    expect(musicPlan({ age: 'stone', mode: 'hub', hot: false, paused: false }).cutoff).toBeLessThan(live.cutoff);
  });

  it('the Music setting gates playback; nothing plays before unlock', () => {
    const { ctx } = fakeCtx();
    const m = new Mixer({ create: () => ctx });
    const t = manualTimer();
    const d = new MusicDirector(m, { timer: t.timer });
    d.set({ mode: 'hub' });
    expect(d.seq.playing).toBe(false); // not started (no gesture yet)
    m.unlock();
    d.start();
    expect(d.seq.playing).toBe(true);
    m.setMusicEnabled(false);
    d.apply();
    expect(d.seq.playing).toBe(false);
    d.set({ mode: 'battle' });
    expect(d.seq.playing).toBe(false);
    m.setMusicEnabled(true);
    d.apply();
    expect(d.seq.playing).toBe(true);
    expect(d.seq.currentLevel).toBe(1);
  });

  it('heats up after Storm Rising and cools on the results screen', () => {
    const { ctx } = fakeCtx();
    const m = new Mixer({ create: () => ctx });
    const d = new MusicDirector(m, { timer: manualTimer().timer });
    m.unlock();
    d.start();
    d.set({ mode: 'battle' });
    d.set({ hot: true });
    expect(d.seq.currentLevel).toBe(2);
    d.set({ mode: 'results', hot: false });
    expect(d.seq.currentLevel).toBe(0);
  });
});
