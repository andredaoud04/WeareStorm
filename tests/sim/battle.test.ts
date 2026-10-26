import { describe, expect, it } from 'vitest';
import type { SimCommand, SimEvent, SimInput } from '../../src/contracts';
import { buildSchedule, cloneState, createBattle, snapshot, step, stepMut, stormcallAim, tokenDef, type BattleState, type Unit } from '../../src/sim/battle';
import { STAGES, stageDef } from '../../src/data/stages';
import { STORM, TRICKLE_SHARE } from '../../src/data/economy';
import { ageDef } from '../../src/data/ages';

const input = (over: Partial<SimInput> = {}): SimInput => ({
  seed: 1, stageId: 1, armyAge: 'stone', timeline: 1, owned: { ranged: false, tank: false },
  levels: { food: 1, walls: 1, melee: 1, ranged: 1, tank: 1 }, stormcall: false, assist: 0, ...over,
});

function run(inp: SimInput, policy: (s: BattleState) => SimCommand[], maxTicks = 20 * 600) {
  const s = createBattle(inp).state;
  const events: SimEvent[] = [];
  while (!s.result && s.tick < maxTicks) events.push(...stepMut(s, policy(s)));
  return { s, events };
}
const spamMelee = (s: BattleState): SimCommand[] => (s.food >= 5000 ? [{ kind: 'deploy', slot: 'melee' }] : []);
const hash = (s: BattleState) => JSON.stringify({ t: s.tick, u: s.units, p: s.projectiles, b: [s.playerBase, s.enemyBase], g: s.goldEarned, r: s.result });

describe('battle sim', () => {
  it('is deterministic: identical inputs and commands give identical battles', () => {
    expect(hash(run(input(), spamMelee).s)).toBe(hash(run(input(), spamMelee).s));
  });

  it('step() never mutates its input state', () => {
    let b = createBattle(input());
    for (let i = 0; i < 300; i++) b = step(b, spamMelee(b.state)).battle;
    const before = JSON.stringify(b.state);
    const frozen = cloneState(b.state);
    step({ state: frozen }, [{ kind: 'deploy', slot: 'melee' }]);
    expect(JSON.stringify(frozen)).toBe(before);
  });

  it('starts at 0 Food and affords the 5-Food Clubber at exactly 5.0 s', () => {
    const s = createBattle(input()).state;
    expect(s.food).toBe(0);
    for (let i = 0; i < 99; i++) stepMut(s, []);
    expect(stepMut(s, [{ kind: 'deploy', slot: 'melee' }]).some((e) => e.kind === 'deployRejected')).toBe(true);
    expect(stepMut(s, [{ kind: 'deploy', slot: 'melee' }]).some((e) => e.kind === 'deployQueued')).toBe(true);
    expect(s.tick).toBe(101);
  });

  it('rejects unowned slots and a full queue', () => {
    const s = createBattle(input()).state;
    s.food = 1_000_000;
    expect(stepMut(s, [{ kind: 'deploy', slot: 'ranged' }]).some((e) => e.kind === 'deployQueued')).toBe(false);
    const ev = stepMut(s, Array.from({ length: 6 }, () => ({ kind: 'deploy' as const, slot: 'melee' as const })));
    expect(ev.filter((e) => e.kind === 'deployRejected' && e.reason === 'queue').length).toBeGreaterThan(0);
  });

  it('wins Battle 1 by deploying and loses it when idle', () => {
    expect(run(input(), spamMelee).s.result).toBe('victory');
    expect(run(input(), () => []).s.result).toBe('defeat');
  });

  it('resolves simultaneous trades regardless of array order (both equal fighters fall together)', () => {
    for (const order of [0, 1]) {
      const s = createBattle(input()).state;
      s.food = 1_000_000;
      stepMut(s, [{ kind: 'deploy', slot: 'melee' }]);
      s.schedule = [];
      s.trickleNext = Infinity;
      const p = s.units[0]!;
      const e = { ...p, id: 999, side: 'enemy' as const, x: p.x + 50_000 };
      p.x = 400_000;
      e.x = 452_000;
      s.units = order ? [e, p] : [p, e];
      for (let i = 0; i < 400 && s.units.length === 2; i++) stepMut(s, []);
      expect(s.units.length).toBe(0);
    }
  });

  it('keeps the enemy base warded until the Warlord dies', () => {
    const warlordStage = STAGES.find((x) => x.warlord)!;
    const { s, events } = run(
      input({ stageId: warlordStage.id, owned: { ranged: true, tank: true }, levels: { food: 10, walls: 10, melee: 10, ranged: 10, tank: 10 } }),
      (st) => (st.food >= 12000 ? [{ kind: 'deploy', slot: (['melee', 'ranged', 'tank'] as const)[st.tick % 3]! }] : []),
    );
    const broken = events.findIndex((e) => e.kind === 'wardBroken');
    const firstBaseDamage = events.findIndex((e) => e.kind === 'hit' && e.targetId === 'base' && e.targetSide === 'enemy' && e.amount > 0);
    expect(events.some((e) => e.kind === 'wardUp')).toBe(true);
    if (firstBaseDamage >= 0) expect(broken).toBeGreaterThanOrEqual(0);
    if (firstBaseDamage >= 0) expect(firstBaseDamage).toBeGreaterThan(broken);
    expect(s.result).not.toBeNull();
  });

  it('announces Storm Rising exactly at its start time and always ends battles', () => {
    const s = createBattle(input({ stageId: 2 })).state;
    s.schedule = [];
    s.trickleNext = Infinity;
    const events: SimEvent[] = [];
    while (s.tick < STORM.risingSec * 20) events.push(...stepMut(s, []));
    const first = events.find((e) => e.kind === 'stormRising');
    expect(first && first.kind === 'stormRising' && first.level).toBe(1);
    expect(s.tick).toBe(STORM.risingSec * 20);
    expect(run(input({ stageId: 2 }), spamMelee).s.result).not.toBeNull();
  });

  it('retreat ends the battle as a retreat and keeps earned Gold', () => {
    const s = createBattle(input()).state;
    for (let i = 0; i < 50; i++) stepMut(s, []);
    s.goldEarned = 7;
    const ev = stepMut(s, [{ kind: 'retreat' }]);
    const end = ev.find((e) => e.kind === 'end');
    expect(end && end.kind === 'end' && end.result).toBe('retreat');
    expect(end && end.kind === 'end' && end.goldEarned).toBe(7);
  });

  it('reports a locked slot instead of silently ignoring the tap', () => {
    const s = createBattle(input()).state;
    s.food = 50_000;
    expect(stepMut(s, [{ kind: 'deploy', slot: 'tank' }])).toContainEqual({ kind: 'deployRejected', slot: 'tank', reason: 'locked' });
  });

  it('tags every hit with its source and pairs projectiles with their end', () => {
    const { events } = run(input({ stageId: 2, owned: { ranged: true, tank: false } }), (st) =>
      st.food >= 8000 ? [{ kind: 'deploy', slot: st.tick % 2 ? 'ranged' : 'melee' }] : []);
    const shots = events.filter((e) => e.kind === 'projectile');
    const ends = new Set(events.flatMap((e) => (e.kind === 'projectileEnd' ? [e.projId] : [])));
    expect(shots.length).toBeGreaterThan(0);
    // Every projectile that had time to land reported how it ended.
    const landed = shots.filter((p) => p.kind === 'projectile' && ends.has(p.projId));
    expect(landed.length).toBeGreaterThan(shots.length * 0.8);
    const hits = events.filter((e) => e.kind === 'hit');
    expect(hits.every((h) => h.kind === 'hit' && h.sourceId > 0)).toBe(true);
    expect(hits.some((h) => h.kind === 'hit' && h.projId !== undefined)).toBe(true);
  });

  it('exposes a render snapshot with whole Food and the Food rate', () => {
    const b = createBattle(input());
    for (let i = 0; i < 30; i++) stepMut(b.state, []);
    const snap = snapshot(b);
    expect(snap.food).toBe(1);
    expect(snap.foodRate).toBeCloseTo(1);
  });
});

describe('stage scripts (golden)', () => {
  const kinds = (id: number) => buildSchedule(stageDef(id)).map((x) => tokenDef(stageDef(id), x.kind).id);

  it('Battle 1 opens with contact at exactly 10 s and only ever fields Clubbers', () => {
    const sched = buildSchedule(stageDef(1));
    expect(sched[0]!.tick).toBe(200);
    expect(new Set(kinds(1))).toEqual(new Set(['stone.clubber']));
    const s = createBattle(input()).state;
    expect(new Set(s.trickle.map((k) => tokenDef(s.stage, k).id))).toEqual(new Set(['stone.clubber']));
  });

  it('every stage opens with contact at its assault start', () => {
    for (const st of STAGES) expect(buildSchedule(st)[0]!.tick).toBe(Math.round(st.assaultStartSec * 20));
  });

  it('Sling Ridge introduces the enemy Slinger and Rockhide Rumble the enemy Rockhide', () => {
    expect(kinds(2)).toContain('stone.slinger');
    expect(kinds(4)).toContain('stone.rockhide');
  });

  it('stage 1 of each later Age fields the previous Age plus one new-Age melee per cycle', () => {
    for (const id of [6, 11, 16, 21, 26]) {
      const st = stageDef(id);
      const prev = STAGES[id - 2]!.age;
      const ids = kinds(id);
      expect(st.enemyAge).toBe(prev);
      expect(ids.some((x) => x.startsWith(`${prev}.`))).toBe(true);
      expect(ids).toContain(`${st.age}.${tokenDef(st, 'M').id.split('.')[1]}`);
    }
  });

  it('the trickle spends at most TRICKLE_SHARE of the Lv-1 Food rate and never fields tanks', () => {
    for (const st of STAGES) {
      if (st.id === 1) continue;
      const s = createBattle(input({ stageId: st.id, armyAge: st.age })).state;
      expect(s.trickle).not.toContain('t');
      const avg = s.trickle.reduce((a, k) => a + tokenDef(st, k).cost, 0) / s.trickle.length;
      const rate = avg / (s.trickleEvery / 20);
      expect(rate).toBeLessThanOrEqual(TRICKLE_SHARE * ageDef(st.age).foodFactor * 1.05);
    }
  });

  it('the lose-forward assist thins the assault as well as weakening it', () => {
    const st = stageDef(9);
    expect(buildSchedule(st, 0.3).length).toBeLessThan(buildSchedule(st, 0).length);
  });
});

describe('Warlord fights', () => {
  const warlordBattle = () => {
    const s = createBattle(input({ stageId: 5, owned: { ranged: true, tank: true } })).state;
    s.schedule = s.schedule.filter((x) => x.kind === 'W');
    s.trickleNext = Infinity;
    return s;
  };

  it('pays Gold for damaging the warded Warlord, up to 20, and blocks base hits with a ward flag', () => {
    const s = warlordBattle();
    const events: SimEvent[] = [];
    while (!s.warlordId) events.push(...stepMut(s, []));
    const w = s.units.find((u) => u.id === s.warlordId)!;
    w.hp = Math.floor(w.maxHp * 0.74); // 26% removed → 5 chunks
    events.push(...stepMut(s, []));
    const chunk = events.find((e) => e.kind === 'baseChunk' && e.source === 'warlord');
    expect(chunk && chunk.kind === 'baseChunk' && chunk.gold).toBe(5);
    expect(s.goldEarned).toBe(5);
    // A hit on the warded base reports the ward and deals nothing (Warlord moved away so the attacker hits the base).
    w.x = 200_000;
    const p = { ...w, id: 4242, side: 'player' as const, x: 900_000, width: 60_000, phase: 'idle' as const, hp: 1000, maxHp: 1000, dmg: 50, range: 80_000, trait: null, proj: null, role: 'melee' as const };
    s.units.push(p);
    const ev: SimEvent[] = [];
    for (let i = 0; i < 60; i++) ev.push(...stepMut(s, []));
    const wardHits = ev.filter((e) => e.kind === 'hit' && e.targetId === 'base' && e.targetSide === 'enemy');
    expect(wardHits.length).toBeGreaterThan(0);
    for (const h of wardHits) expect(h.kind === 'hit' && h.blocked === 'ward' && h.amount === 0).toBe(true);
    expect(s.enemyBase.hp).toBe(s.enemyBase.max);
  });

  it('keeps slam damage fixed when calibration raises Warlord HP', () => {
    const s = warlordBattle();
    while (!s.warlordId) stepMut(s, []);
    const w = s.units.find((u) => u.id === s.warlordId)!;
    expect(w.maxHp).toBe(Math.round(1040 * s.stage.bossMult));
    expect(w.dmg).toBe(42); // 1.92 × Stone tank DMG: a Lv-2 Slinger (44 HP) survives one slam
  });
});

describe('Stormcall', () => {
  const enemy = (id: number, x: number, role: Unit['role'] = 'melee'): Unit => ({
    id, side: 'enemy', def: 'stone.clubber', role, x: x * 1000, hp: 60, maxHp: 60, dmg: 12, armor: 0, width: 60_000,
    range: 12_000, speed: 5000, interval: 20, windup: 7, proj: null, projSpeed: 0, trait: null, killGold: 1,
    phase: 'idle', moving: false, phaseEnd: 0, target: 0, charged: false, rapidLeft: 0, nextShot: 0,
  });

  it('aims at the biggest clump, not at the lead unit', () => {
    const aim = stormcallAim([enemy(1, 200), enemy(2, 600), enemy(3, 640), enemy(4, 690)]);
    expect(aim!.weight).toBe(3);
    expect(aim!.x).toBeGreaterThanOrEqual(600_000);
  });

  it('counts a Warlord as three and prefers the point nearer the player base on ties', () => {
    expect(stormcallAim([enemy(1, 300), enemy(2, 800, 'warlord')])!.x).toBe(800_000);
    expect(stormcallAim([enemy(1, 300), enemy(2, 800)])!.x).toBe(300_000);
    expect(stormcallAim([])).toBeNull();
  });

  it('announces the cast with its strike tick, then strikes', () => {
    const s = createBattle(input({ stageId: 4, stormcall: true })).state;
    s.units.push(enemy(900, 500));
    s.tick = s.stormcall.readyAt;
    const cast = stepMut(s, [{ kind: 'stormcall' }]).find((e) => e.kind === 'stormcallCast');
    expect(cast && cast.kind === 'stormcallCast' && cast.strikeTick).toBe(s.tick + 10);
    const ev: SimEvent[] = [];
    for (let i = 0; i < 10; i++) ev.push(...stepMut(s, []));
    expect(ev.some((e) => e.kind === 'stormcallStrike')).toBe(true);
  });
});

describe('QA regressions', () => {
  const allIn = (stageId: number) =>
    input({ stageId, owned: { ranged: true, tank: true }, levels: { food: 3, walls: 2, melee: 3, ranged: 2, tank: 2 } });
  const mixed = (st: BattleState): SimCommand[] => (st.food >= 12000 ? [{ kind: 'deploy', slot: (['melee', 'ranged', 'tank'] as const)[st.tick % 3]! }] : []);

  it('is independent of the order of units: every tick matches with the unit list reversed', () => {
    const key = (st: BattleState) => JSON.stringify([...st.units].sort((x, y) => x.id - y.id).map((u) => [u.id, u.x, u.hp, u.phase]));
    for (const stageId of [3, 5, 9, 10]) {
      const a = createBattle(allIn(stageId)).state;
      const b = createBattle(allIn(stageId)).state;
      let ticks = 0;
      while (!a.result && a.tick < 20 * 200) {
        const cmds = mixed(a);
        stepMut(a, cmds);
        b.units.reverse(); // worst case for a loop that reads positions other units already moved this tick
        stepMut(b, cmds);
        b.units.sort((x, y) => x.id - y.id);
        if (key(a) !== key(b)) break;
        ticks++;
      }
      expect(key(b)).toBe(key(a));
      expect(ticks).toBeGreaterThan(100);
    }
  });

  it('never spawns a unit overlapping a hostile standing at its gate', () => {
    const { events, s } = run(allIn(9), mixed);
    expect(s.result).not.toBeNull();
    for (const e of events) if (e.kind === 'spawn') expect(e.side === 'enemy' ? e.x >= 1000 : e.x <= 0).toBe(true);
  });

  it('caps the rally at the 30-unit field limit and never rallies on the victory tick', () => {
    const s = createBattle(input({ stageId: 9 })).state;
    s.schedule = [];
    s.trickleNext = Infinity;
    for (let i = 0; i < 30; i++) s.units.push(enemyAt(500 + i * 10, 5000 + i));
    s.enemyBase.hp = Math.floor(s.enemyBase.max * 0.49);
    stepMut(s, []);
    expect(s.units.filter((u) => u.side === 'enemy').length).toBeLessThanOrEqual(30);
    const t = createBattle(input({ stageId: 9 })).state;
    t.enemyBase.hp = 0;
    t.enemyBase.max = 1000;
    const ev = stepMut(t, []);
    expect(ev.some((e) => e.kind === 'rally')).toBe(false);
    expect(t.result).toBe('victory');
  });

  it('ignores commands queued after a retreat in the same tick', () => {
    const s = createBattle(input()).state;
    s.food = 50_000;
    const ev = stepMut(s, [{ kind: 'retreat' }, { kind: 'deploy', slot: 'melee' }]);
    expect(ev.some((e) => e.kind === 'deployQueued')).toBe(false);
    expect(s.food).toBe(50_000);
  });

  it('reports a Stormcall tap with nothing to hit', () => {
    const s = createBattle(input({ stageId: 4, stormcall: true })).state;
    s.schedule = [];
    s.tick = s.stormcall.readyAt;
    expect(stepMut(s, [{ kind: 'stormcall' }])).toContainEqual({ kind: 'stormcallNoTarget' });
  });
});

function enemyAt(x: number, id: number): Unit {
  return {
    id, side: 'enemy', def: 'stone.clubber', role: 'melee', x: x * 1000, hp: 60, maxHp: 60, dmg: 12, armor: 0, width: 60_000,
    range: 12_000, speed: 0, interval: 20, windup: 7, proj: null, projSpeed: 0, trait: null, killGold: 1,
    phase: 'idle', moving: false, phaseEnd: 0, target: 0, charged: false, rapidLeft: 0, nextShot: 0,
  };
}
