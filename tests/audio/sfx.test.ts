import { describe, expect, it } from 'vitest';
import type { SimEvent, SimEventKind } from '../../src/contracts';
import { Mixer } from '../../src/audio/mixer';
import { isSilence, sfxFor, untilTick, type SfxWorld, type UnitInfo } from '../../src/audio/sfx';
import { SOUNDS, SOUND_IDS } from '../../src/audio/sounds';
import { fakeCtx } from './fakeAudio';

/**
 * ART_BIBLE polish checklist: every SimEvent kind has SFX, enforced by an exhaustive switch and a unit test.
 * The sample table is typed by kind, so a new SimEvent kind fails to compile here until it gets samples.
 */
type Samples = { [K in SimEventKind]: Extract<SimEvent, { kind: K }>[] };

const stats = { kills: 3, tankKills: 0, warlordKills: 0, baseChunks: 4, deployed: 9, durationTicks: 900 };

const SAMPLES: Samples = {
  spawn: [
    { kind: 'spawn', id: 1, side: 'player', def: 'stone.clubber', x: -20, rally: false },
    { kind: 'spawn', id: 2, side: 'player', def: 'stone.slinger', x: -20, rally: false },
    { kind: 'spawn', id: 3, side: 'player', def: 'stone.rockhide', x: -20, rally: false },
    { kind: 'spawn', id: 10, side: 'enemy', def: 'stone.clubber', x: 1020, rally: false },
    { kind: 'spawn', id: 11, side: 'enemy', def: 'stone.rockhide', x: 1020, rally: true },
    { kind: 'spawn', id: 12, side: 'enemy', def: 'stone.grumbo', x: 1020, rally: false },
  ],
  attackStart: [
    { kind: 'attackStart', id: 1, targetId: 10, impactTick: 107 },
    { kind: 'attackStart', id: 2, targetId: 'base', impactTick: 108 },
    { kind: 'attackStart', id: 3, targetId: 10, impactTick: 110 },
    { kind: 'attackStart', id: 12, targetId: 1, impactTick: 118, area: { x: 600, r: 150 } },
  ],
  projectile: [{ kind: 'projectile', projId: 50, id: 2, from: 300, to: 10, toX: 560, arriveTick: 112, style: 'pebble' }],
  projectileEnd: [
    { kind: 'projectileEnd', projId: 50, x: 560, result: 'hit' },
    { kind: 'projectileEnd', projId: 51, x: 560, result: 'fizzle' },
    { kind: 'projectileEnd', projId: 52, x: 560, result: 'explode', r: 40 },
  ],
  hit: [
    { kind: 'hit', targetId: 10, targetSide: 'enemy', sourceId: 1, amount: 12, heavy: false, armored: false },
    { kind: 'hit', targetId: 10, targetSide: 'enemy', sourceId: 2, projId: 50, amount: 18, heavy: false, armored: false },
    { kind: 'hit', targetId: 1, targetSide: 'player', sourceId: 11, amount: 22, heavy: true, armored: false },
    { kind: 'hit', targetId: 11, targetSide: 'enemy', sourceId: 1, amount: 8, heavy: false, armored: true },
    { kind: 'hit', targetId: 'base', targetSide: 'enemy', sourceId: 1, amount: 0, heavy: false, armored: false, blocked: 'ward' },
    { kind: 'hit', targetId: 'base', targetSide: 'player', sourceId: 10, amount: 12, heavy: false, armored: false },
    { kind: 'hit', targetId: 'base', targetSide: 'enemy', sourceId: 3, amount: 22, heavy: true, armored: false },
    { kind: 'hit', targetId: 10, targetSide: 'enemy', sourceId: 0, amount: 90, heavy: true, armored: false },
  ],
  whiff: [{ kind: 'whiff', id: 1 }],
  death: [
    { kind: 'death', id: 10, side: 'enemy', def: 'stone.clubber', x: 520, gold: 1 },
    { kind: 'death', id: 1, side: 'player', def: 'stone.clubber', x: 480, gold: 0 },
    { kind: 'death', id: 11, side: 'enemy', def: 'stone.rockhide', x: 600, gold: 5 },
    { kind: 'death', id: 12, side: 'enemy', def: 'stone.grumbo', x: 700, gold: 10 },
  ],
  baseChunk: [
    { kind: 'baseChunk', side: 'enemy', source: 'base', pct: 5, gold: 1 },
    { kind: 'baseChunk', side: 'enemy', source: 'warlord', pct: 10, gold: 1 },
  ],
  rally: [{ kind: 'rally', size: 4 }],
  wardUp: [{ kind: 'wardUp' }],
  wardBroken: [{ kind: 'wardBroken' }],
  warlordIntro: [{ kind: 'warlordIntro', id: 12 }],
  slamTelegraph: [{ kind: 'slamTelegraph', id: 12, x: 640, radius: 160, impactTick: 118 }],
  stormRising: [
    { kind: 'stormRising', level: 1 },
    { kind: 'stormRising', level: 3 },
  ],
  stormcallCharged: [{ kind: 'stormcallCharged' }],
  stormcallCast: [{ kind: 'stormcallCast', x: 600, radius: 104, strikeTick: 116 }],
  stormcallNoTarget: [{ kind: 'stormcallNoTarget' }],
  stormcallStrike: [{ kind: 'stormcallStrike', x: 600, radius: 104 }],
  deployQueued: [
    { kind: 'deployQueued', slot: 'melee', foodSpent: 5, queue: 1 },
    { kind: 'deployQueued', slot: 'tank', foodSpent: 12, queue: 4 },
  ],
  deployRejected: [
    { kind: 'deployRejected', slot: 'melee', reason: 'food' },
    { kind: 'deployRejected', slot: 'ranged', reason: 'queue' },
    { kind: 'deployRejected', slot: 'tank', reason: 'cap' },
    { kind: 'deployRejected', slot: 'tank', reason: 'locked' },
  ],
  end: [
    { kind: 'end', result: 'victory', goldEarned: 40, stats },
    { kind: 'end', result: 'defeat', goldEarned: 12, stats },
    { kind: 'end', result: 'retreat', goldEarned: 8, stats },
  ],
};

const UNITS: Record<number, UnitInfo> = {
  1: { x: 480, role: 'melee', side: 'player' },
  2: { x: 300, role: 'ranged', side: 'player' },
  3: { x: 420, role: 'tank', side: 'player' },
  10: { x: 520, role: 'melee', side: 'enemy' },
  11: { x: 600, role: 'tank', side: 'enemy' },
  12: { x: 700, role: 'warlord', side: 'enemy' },
};
const world = (speed = 1): SfxWorld => ({ unit: (id) => UNITS[id], tick: 100, speed });

describe('SFX coverage (every SimEvent kind)', () => {
  const all = Object.values(SAMPLES).flat() as SimEvent[];

  it('has samples for every kind of the contract', () => {
    const kinds = new Set(all.map((e) => e.kind));
    expect([...kinds].sort()).toEqual((Object.keys(SAMPLES) as SimEventKind[]).sort());
  });

  it.each(Object.keys(SAMPLES) as SimEventKind[])('%s maps to named sounds or a reasoned silence', (kind) => {
    const loud: string[] = [];
    for (const e of SAMPLES[kind] as SimEvent[]) {
      const out = sfxFor(e, world());
      if (isSilence(out)) {
        expect(out.silent.length).toBeGreaterThan(10);
        continue;
      }
      expect(out.length).toBeGreaterThan(0);
      for (const c of out) {
        expect(SOUNDS[c.id], `${kind} → ${c.id}`).toBeDefined();
        if (c.delay !== undefined) expect(c.delay).toBeGreaterThanOrEqual(0);
        if (c.x !== undefined) expect(Number.isFinite(c.x)).toBe(true);
        loud.push(c.id);
      }
    }
    // every kind makes a sound in at least one of its cases (silences are only for covered sub-cases)
    expect(loud.length, `${kind} is silent in every case`).toBeGreaterThan(0);
  });

  it('plays every mapped cue through the mixer without throwing', () => {
    const { fake, ctx } = fakeCtx();
    let t = 0;
    const m = new Mixer({ create: () => ctx, now: () => (t += 500), rng: () => 0.5 });
    m.unlock();
    for (const e of all) {
      const out = sfxFor(e, world(2));
      if (isSilence(out)) continue;
      for (const c of out) expect(m.play(c.id, c), c.id).toBe(true);
    }
    expect(fake.sources.length).toBeGreaterThan(50);
    expect(fake.sources.every((s) => s.started !== null && s.stopped !== null && s.stopped > s.started)).toBe(true);
  });

  it('every sound recipe renders on a fake context, with sane table entries', () => {
    for (const id of SOUND_IDS) {
      const { fake, ctx } = fakeCtx();
      const def = SOUNDS[id];
      expect(def.gain, id).toBeGreaterThan(0);
      // gains are calibrated per sound to a target level (see mixer.ts); voices peak well below 1, so > 1 is fine
      expect(def.gain, id).toBeLessThanOrEqual(1.5);
      expect(def.len, id).toBeGreaterThan(0);
      for (const param of [0, 1, 5]) def.play({ ctx, dest: ctx.destination }, 0.01, { k: 1, param, dur: 0.6 });
      expect(fake.sources.length, id).toBeGreaterThan(0);
    }
  });

  it('distinguishes the readable cases', () => {
    const ids = (e: SimEvent, w = world()) => {
      const o = sfxFor(e, w);
      return isSilence(o) ? [] : o.map((c) => c.id);
    };
    const [clubber, slinger, rockhide, enemy, rally, warlord] = SAMPLES.spawn;
    expect(ids(clubber!)).toEqual(['deployMelee']);
    expect(ids(slinger!)).toEqual(['deployRanged']);
    expect(ids(rockhide!)).toEqual(['deployTank']);
    expect(ids(enemy!)).toEqual(['enemySpawn']);
    expect(ids(rally!)).toEqual(['rallyStomp']);
    expect(isSilence(sfxFor(warlord!, world()))).toBe(true);
    const [light, pebble, heavy, armor, ward, pBase, eBaseHeavy, storm] = SAMPLES.hit;
    expect(ids(light!)).toEqual(['hitLight']);
    expect(ids(pebble!)).toEqual(['hitPebble']);
    expect(ids(heavy!)).toEqual(['hitHeavy']);
    expect(ids(armor!)).toEqual(['hitArmor']);
    expect(ids(ward!)).toEqual(['wardTing']);
    expect(ids(pBase!)).toEqual(['baseHit']);
    expect(ids(eBaseHeavy!)).toEqual(['baseHit']);
    expect(isSilence(sfxFor(storm!, world()))).toBe(true);
    expect(ids(SAMPLES.death[0]!)).toEqual(['poof', 'coin']);
    expect(ids(SAMPLES.death[1]!)).toEqual(['poof']);
    expect(ids(SAMPLES.death[2]!)).toEqual(['poofBig', 'coin']);
    expect(ids(SAMPLES.death[3]!)).toEqual(['warlordDown', 'coin']);
    expect(ids(SAMPLES.end[0]!)).toContain('victory');
    expect(ids(SAMPLES.end[1]!)).toContain('defeat');
    expect(ids(SAMPLES.end[2]!)).toEqual(['retreat']);
    for (const r of SAMPLES.deployRejected) expect(ids(r)).toEqual(['nope']);
  });

  it('enemy-side sounds sit lower than the player side', () => {
    const pitch = (e: SimEvent) => {
      const o = sfxFor(e, world());
      return isSilence(o) ? 0 : (o[0]!.pitch ?? 0);
    };
    expect(pitch(SAMPLES.death[0]!)).toBeLessThan(pitch(SAMPLES.death[1]!));
    expect(pitch(SAMPLES.hit[2]!)).toBeLessThan(pitch(SAMPLES.hit[0]!)); // our troop hit vs theirs
  });

  it('times swings, slams and charges to the sim, scaled by battle speed', () => {
    expect(untilTick(world(1), 120)).toBeCloseTo(1.0);
    expect(untilTick(world(2), 120)).toBeCloseTo(0.5);
    expect(untilTick(world(1), 90)).toBe(0);
    const slam = sfxFor(SAMPLES.slamTelegraph[0]!, world(1));
    expect(isSilence(slam)).toBe(false);
    if (!isSilence(slam)) {
      expect(slam.map((c) => c.id)).toEqual(['slamRumble', 'slamBoom']);
      expect(slam[1]!.delay).toBeCloseTo(0.9);
    }
    const swing = sfxFor(SAMPLES.attackStart[0]!, world(1));
    if (!isSilence(swing)) expect(swing[0]!.delay).toBeCloseTo(0.35 - 0.12);
    const swing2 = sfxFor(SAMPLES.attackStart[0]!, world(2));
    if (!isSilence(swing2)) expect(swing2[0]!.delay).toBeCloseTo(0.175 - 0.12);
  });

  it('the deploy tick climbs with the queue', () => {
    const p = (e: SimEvent) => {
      const o = sfxFor(e, world());
      return isSilence(o) ? 0 : (o[0]!.pitch ?? 0);
    };
    expect(p(SAMPLES.deployQueued[1]!)).toBeGreaterThan(p(SAMPLES.deployQueued[0]!));
  });
});
