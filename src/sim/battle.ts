/**
 * Deterministic battle simulation (GDD §2, TECH §3). 20 Hz fixed ticks, integer state, no randomness needed:
 * ties break by id. Tick order follows GDD §2.7 exactly and all damage in a tick is applied simultaneously.
 *
 * Units: positions in milli-world-units (mu, 1 wu = 1000 mu), food in milli-food, HP integers.
 */
import type {
  BattleResult, BattleSnapshot, BattleStats, ProjStyle, Side, SimCommand, SimEvent, SimInput, Slot, UnitDefId, UnitView,
  Role,
} from '../contracts';
import { TICKS_PER_SECOND } from '../contracts';
import { ageDef } from '../data/ages';
import {
  ASSIST, BASE_CHUNK_MAX, FIELD_CAP, QUEUE_CAP, QUEUE_RELEASE_TICKS, STORM, STORMCALL, TRICKLE_SHARE, enemyBaseHp, foodPerTick,
  playerBaseHp, stormcallDamage, trainingMult,
} from '../data/economy';
import { stageDef, type SpawnToken, type StageDef } from '../data/stages';
import { rosterOf, warlordOf, type Trait, type UnitDef } from '../data/units';

const MU = 1000;
const PLAYER_GATE = 0;
const ENEMY_GATE = 1000 * MU;
const PLAYER_SPAWN = -20 * MU;
const ENEMY_SPAWN = 1020 * MU;
const RECHECK_SLACK = 13 * MU;
const PIERCE_DEPTH = 140 * MU;
const sec = (s: number) => Math.round(s * TICKS_PER_SECOND);
const STORM_START = sec(STORM.risingSec);
const STORM_STEP = sec(STORM.stepSec);
const BASE_DOUBLE = sec(STORM.baseDoubleSec);
const HARD_LIMIT = sec(STORM.hardLimitSec);

type Phase = 'idle' | 'windup' | 'recover';
const BASE = -1; // target id for "the hostile base"

export interface Unit {
  id: number;
  side: Side;
  def: UnitDefId;
  role: Role;
  x: number;
  hp: number;
  maxHp: number;
  dmg: number;
  armor: number; // 0..1
  width: number; // mu
  range: number; // mu edge gap
  speed: number; // mu per tick
  interval: number; // ticks
  windup: number; // ticks
  proj: ProjStyle | null;
  projSpeed: number; // mu per tick
  trait: Trait | null;
  killGold: number;
  phase: Phase;
  moving: boolean; // moved this tick (idle units that are blocked stand still)
  phaseEnd: number; // tick when the current phase ends (impact tick during windup)
  target: number; // unit id or BASE; meaningful during windup
  charged: boolean; // charge trait: first hit still pending
  rapidLeft: number; // remaining rapid shots this cycle
  nextShot: number; // tick of the next rapid shot
}

interface Projectile {
  id: number;
  shooter: number;
  side: Side;
  target: number; // unit id or BASE
  lastX: number;
  arrive: number;
  dmg: number;
  style: ProjStyle;
  trait: Trait | null;
  shooterX: number;
}

interface Spawn {
  tick: number;
  kind: SpawnToken | 'W';
}

export interface BattleState {
  input: SimInput;
  stage: StageDef;
  tick: number;
  nextId: number;
  food: number; // milli-food
  foodPerTick: number;
  queue: Slot[];
  releaseIn: number;
  units: Unit[];
  projectiles: Projectile[];
  playerBase: { hp: number; max: number };
  enemyBase: { hp: number; max: number; warded: boolean };
  chunksPaid: number;
  schedule: Spawn[]; // enemy spawns, sorted by tick
  scheduleIdx: number;
  trickleNext: number;
  trickleIdx: number;
  trickleEvery: number; // ticks between trickle units
  trickle: SpawnToken[]; // trickle cycle: the stage pattern without tanks
  rallyDone: boolean;
  warlordId: number; // 0 until spawned
  warlordChunksPaid: number;
  stormcall: { unlocked: boolean; chargeFrom: number; readyAt: number; strikeAt: number; strikeX: number; announced: boolean };
  stormLevel: number;
  goldEarned: number;
  stats: BattleStats;
  result: BattleResult | null;
}

export interface Battle {
  readonly state: BattleState;
}

// ---------------------------------------------------------------------------------------------------------------
// Construction

/** Unit definition behind a spawn token on a stage. */
export function tokenDef(stage: StageDef, kind: SpawnToken | 'W'): UnitDef {
  if (kind === 'W') return warlordOf(stage.age);
  if (kind === 'M') return rosterOf(stage.age).melee;
  const roster = rosterOf(stage.enemyAge);
  return kind === 'm' ? roster.melee : kind === 'r' ? roster.ranged : roster.tank;
}

const tokens = (pattern: string) => [...pattern] as SpawnToken[];
const clampAssist = (a: number) => Math.max(0, Math.min(ASSIST.max, a || 0));

/**
 * Assault generator (GDD §2.9). Virtual Food accrues at E × the Age's Lv-1 Food rate across the assault window and
 * buys the pattern in order. It starts holding the first unit's cost, so the first enemy lands exactly at the
 * window start and every battle opens with contact. Authored inserts and the Warlord are added on top.
 */
export function buildSchedule(stage: StageDef, assist = 0): Spawn[] {
  const out: Spawn[] = [];
  const pattern = tokens(stage.pattern);
  const budget = stage.budget * (1 - clampAssist(assist));
  const perTick = Math.round((budget * ageDef(stage.age).foodFactor * 1000) / TICKS_PER_SECOND);
  const start = sec(stage.assaultStartSec);
  const end = sec(stage.assaultEndSec);
  let p = 0;
  let vfood = tokenDef(stage, pattern[0]!).cost * 1000 - perTick;
  for (let t = start; t <= end; t++) {
    vfood += perTick;
    const kind = pattern[p % pattern.length]!;
    const cost = tokenDef(stage, kind).cost * 1000;
    if (vfood >= cost) {
      vfood -= cost;
      out.push({ tick: t, kind });
      p++;
    }
  }
  for (const ins of stage.inserts) for (const k of ins.units) out.push({ tick: sec(ins.atSec), kind: k });
  if (stage.warlord) out.push({ tick: sec(stage.warlordAtSec), kind: 'W' });
  out.sort((a, b) => a.tick - b.tick);
  return out;
}

/** Trickle cycle and cadence: the pattern without tanks, spending TRICKLE_SHARE of the Age's Lv-1 Food rate. */
function trickleOf(stage: StageDef): { cycle: SpawnToken[]; every: number } {
  const cycle = tokens(stage.pattern).filter((k) => k !== 't');
  if (!cycle.length) cycle.push('m');
  if (stage.trickleSec > 0) return { cycle, every: sec(stage.trickleSec) };
  const avgCost = cycle.reduce((a, k) => a + tokenDef(stage, k).cost, 0) / cycle.length;
  const foodPerSec = TRICKLE_SHARE * ageDef(stage.age).foodFactor;
  return { cycle, every: Math.max(sec(4), sec(avgCost / Math.max(0.01, foodPerSec))) };
}

export function createBattle(input: SimInput): Battle {
  const stage = stageDef(input.stageId);
  const pmax = playerBaseHp(input.armyAge, input.levels.walls);
  const emax = Math.round(enemyBaseHp(stage.age, stage.idx, stage.warlord) * timelineMult(input.timeline));
  const trickle = trickleOf(stage);
  const schedule = buildSchedule(stage, input.assist);
  const state: BattleState = {
    input,
    stage,
    tick: 0,
    nextId: 1,
    food: 0,
    foodPerTick: foodPerTick(input.armyAge, input.levels.food),
    queue: [],
    releaseIn: 0,
    units: [],
    projectiles: [],
    playerBase: { hp: pmax, max: pmax },
    enemyBase: { hp: emax, max: emax, warded: stage.warlord },
    chunksPaid: 0,
    schedule,
    scheduleIdx: 0,
    trickleNext: sec(stage.assaultEndSec) + trickle.every,
    trickleIdx: 0,
    trickleEvery: trickle.every,
    trickle: trickle.cycle,
    rallyDone: stage.rally === 0,
    warlordId: 0,
    warlordChunksPaid: 0,
    stormcall: {
      unlocked: input.stormcall,
      chargeFrom: 0,
      readyAt: sec(STORMCALL.firstChargeSec),
      strikeAt: -1,
      strikeX: 0,
      announced: false,
    },
    stormLevel: 0,
    goldEarned: 0,
    stats: { kills: 0, tankKills: 0, warlordKills: 0, baseChunks: 0, deployed: 0, durationTicks: 0 },
    result: null,
  };
  return { state };
}

const timelineMult = (t: number) => Math.pow(1.35, Math.max(0, t - 1));

function makeUnit(s: BattleState, side: Side, def: UnitDef, hpMult: number, dmgMult = hpMult): Unit {
  return {
    id: s.nextId++,
    side,
    def: def.id,
    role: def.role,
    // spawn fully behind the gate so a new unit never overlaps a hostile standing at it
    x: side === 'player' ? Math.min(PLAYER_SPAWN, PLAYER_GATE - (def.width * MU) / 2) : Math.max(ENEMY_SPAWN, ENEMY_GATE + (def.width * MU) / 2),
    hp: Math.max(1, Math.round(def.hp * hpMult)),
    maxHp: Math.max(1, Math.round(def.hp * hpMult)),
    dmg: Math.max(1, Math.round(def.dmg * dmgMult)),
    armor: def.trait?.kind === 'armor' ? def.trait.pct : 0,
    width: def.width * MU,
    range: def.range * MU,
    speed: Math.round((def.speed * MU) / TICKS_PER_SECOND),
    interval: sec(def.interval),
    windup: sec(def.windup),
    proj: def.proj,
    projSpeed: Math.round((def.projSpeed * MU) / TICKS_PER_SECOND),
    trait: def.trait,
    killGold: def.killGold,
    phase: 'idle',
    moving: false,
    phaseEnd: 0,
    target: 0,
    charged: def.trait?.kind === 'charge',
    rapidLeft: 0,
    nextShot: 0,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Geometry helpers

const dir = (side: Side) => (side === 'player' ? 1 : -1);
const gap = (a: Unit, b: Unit) => Math.abs(a.x - b.x) - (a.width + b.width) / 2;
const baseGap = (u: Unit) => (u.side === 'player' ? ENEMY_GATE - (u.x + u.width / 2) : u.x - u.width / 2 - PLAYER_GATE);

function nearestHostileInRange(units: Unit[], u: Unit, slack = 0): Unit | null {
  let best: Unit | null = null;
  let bestGap = Infinity;
  for (const v of units) {
    if (v.side === u.side || v.hp <= 0) continue;
    const g = gap(u, v);
    if (g <= u.range + slack && (g < bestGap || (g === bestGap && best && v.id < best.id))) {
      best = v;
      bestGap = g;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------------------
// Stepping

interface Hit {
  target: number; // unit id, or BASE
  side: Side; // side that receives the hit
  source: number; // attacking unit id, 0 = Stormcall
  proj?: number;
  amount: number;
  heavy: boolean;
}

/** Advances exactly one tick, returning a new battle (input is not mutated). */
export function step(battle: Battle, commands: readonly SimCommand[]): { battle: Battle; events: SimEvent[] } {
  const s = cloneState(battle.state);
  const events = stepMut(s, commands);
  return { battle: { state: s }, events };
}

export function cloneState(s: BattleState): BattleState {
  return {
    ...s,
    queue: s.queue.slice(),
    units: s.units.map((u) => ({ ...u })),
    projectiles: s.projectiles.map((p) => ({ ...p })),
    playerBase: { ...s.playerBase },
    enemyBase: { ...s.enemyBase },
    stormcall: { ...s.stormcall },
    stats: { ...s.stats },
    // schedule and trickle are immutable after creation and are shared.
  };
}

/** In-place step used by the harness for speed. */
export function stepMut(s: BattleState, commands: readonly SimCommand[]): SimEvent[] {
  const ev: SimEvent[] = [];
  if (s.result) return ev;
  if (s.tick === 0 && s.enemyBase.warded) ev.push({ kind: 'wardUp' });
  s.tick += 1;
  const t = s.tick;

  // 1. Commands
  for (const c of commands) {
    applyCommand(s, c, ev);
    if (s.result) return finish(s, ev); // nothing after a retreat in the same tick takes effect
  }

  // 2. Release the player's spawn queue
  if (s.releaseIn > 0) s.releaseIn -= 1;
  if (s.queue.length && s.releaseIn === 0) {
    const slot = s.queue.shift()!;
    const def = rosterOf(s.input.armyAge)[slot];
    const u = makeUnit(s, 'player', def, trainingMult(s.input.levels[slot]));
    s.units.push(u);
    s.stats.deployed += 1;
    s.releaseIn = QUEUE_RELEASE_TICKS;
    ev.push({ kind: 'spawn', id: u.id, side: 'player', def: def.id, x: u.x / MU, rally: false });
  }

  // 3. Enemy script
  enemySpawns(s, ev);

  // 4. Food
  s.food += s.foodPerTick;

  // Storm Rising announcements and Stormcall charge
  if (t >= STORM_START && (t - STORM_START) % STORM_STEP === 0) {
    s.stormLevel = 1 + (t - STORM_START) / STORM_STEP;
    ev.push({ kind: 'stormRising', level: s.stormLevel });
  }
  if (s.stormcall.unlocked && !s.stormcall.announced && t >= s.stormcall.readyAt && s.stormcall.strikeAt < 0) {
    s.stormcall.announced = true;
    ev.push({ kind: 'stormcallCharged' });
  }

  // 5. SENSE (start-of-tick positions)
  const targets = new Map<number, number>(); // unit id → target id / BASE / 0 none
  for (const u of s.units) {
    if (u.phase !== 'idle') continue;
    const v = nearestHostileInRange(s.units, u);
    targets.set(u.id, v ? v.id : baseGap(u) <= u.range ? BASE : 0);
  }
  const startX = new Map(s.units.map((u) => [u.id, u.x]));

  // 6–8. ACT. Pass A resolves every impact and attack start against START-of-tick positions (nobody has moved
  // yet), pass B moves the units that are free to walk. Splitting the passes makes the outcome independent of the
  // order of s.units (QA found slams hitting or missing depending on whether the target had already moved).
  const hits: Hit[] = [];
  const walkers: Unit[] = [];
  for (const u of s.units) {
    u.moving = false;
    if (u.phase === 'windup' && t >= u.phaseEnd) {
      impact(s, u, hits, ev);
      u.phase = 'recover';
      u.phaseEnd = t - u.windup + u.interval; // cycle ends interval ticks after it started
      if (u.trait?.kind === 'rapid' && u.trait.shots > 1) {
        u.rapidLeft = u.trait.shots - 1;
        u.nextShot = t + Math.max(1, Math.floor((u.interval - u.windup) / u.trait.shots));
      }
      continue;
    }
    if (u.phase === 'windup') continue; // committed: no movement or retargeting until impact
    if (u.phase === 'recover') {
      if (u.rapidLeft > 0 && t >= u.nextShot) {
        impact(s, u, hits, ev);
        u.rapidLeft -= 1;
        u.nextShot = t + Math.max(1, Math.floor((u.interval - u.windup) / (u.trait?.kind === 'rapid' ? u.trait.shots : 1)));
      }
      if (t >= u.phaseEnd) u.phase = 'idle';
      continue;
    }
    const target = targets.get(u.id) ?? 0;
    if (target !== 0) {
      u.phase = 'windup';
      u.target = target;
      u.phaseEnd = t + u.windup;
      const slam = u.trait?.kind === 'slam' ? u.trait.radius : 0;
      ev.push({
        kind: 'attackStart', id: u.id, targetId: target === BASE ? 'base' : target, impactTick: u.phaseEnd,
        ...(slam ? { area: { x: u.x / MU, r: slam + u.width / MU / 2 } } : {}),
      });
      if (slam) ev.push({ kind: 'slamTelegraph', id: u.id, x: u.x / MU, radius: slam + u.width / MU / 2, impactTick: u.phaseEnd });
    } else {
      walkers.push(u);
    }
  }
  for (const u of walkers) move(s, u, startX);
  arriveProjectiles(s, hits, ev);
  strikeStormcall(s, hits, ev);

  // 9. APPLY all damage at once
  applyHits(s, hits, ev);

  // 10. Deaths and rewards
  resolveDeaths(s, ev);

  // 11. Base state: chunks, ward, rally
  baseRewards(s, ev);
  if (!s.rallyDone && s.enemyBase.hp > 0 && s.enemyBase.hp * 2 < s.enemyBase.max) {
    s.rallyDone = true;
    const room = FIELD_CAP - s.units.filter((u) => u.side === 'enemy').length;
    const size = Math.max(0, Math.min(s.stage.rally, room));
    ev.push({ kind: 'rally', size });
    const pattern = tokens(s.stage.pattern);
    for (let i = 0; i < size; i++) spawnEnemy(s, pattern[i % pattern.length]!, ev, i);
  }

  // 12. Win/lose (if both bases fall on the same tick, the player wins)
  if (s.enemyBase.hp <= 0) s.result = 'victory';
  else if (s.playerBase.hp <= 0) s.result = 'defeat';
  else if (t >= HARD_LIMIT) s.result = 'defeat';
  return finish(s, ev);
}

function finish(s: BattleState, ev: SimEvent[]): SimEvent[] {
  if (s.result) {
    s.stats.durationTicks = s.tick;
    ev.push({ kind: 'end', result: s.result, goldEarned: s.goldEarned, stats: { ...s.stats } });
  }
  return ev;
}

function applyCommand(s: BattleState, c: SimCommand, ev: SimEvent[]) {
  if (c.kind === 'retreat') {
    s.result = 'retreat';
    return;
  }
  if (c.kind === 'stormcall') {
    const sc = s.stormcall;
    if (!sc.unlocked || s.tick < sc.readyAt || sc.strikeAt >= 0) return;
    const aim = stormcallAim(s.units);
    if (!aim) {
      ev.push({ kind: 'stormcallNoTarget' }); // stays charged; the UI shakes the ring
      return;
    }
    sc.strikeAt = s.tick + sec(STORMCALL.gatherSec);
    sc.strikeX = aim.x;
    ev.push({ kind: 'stormcallCast', x: aim.x / MU, radius: STORMCALL.radius, strikeTick: sc.strikeAt });
    return;
  }
  const slot = c.slot;
  const owned = slot === 'melee' || (slot === 'ranged' ? s.input.owned.ranged : s.input.owned.tank);
  if (!owned) {
    ev.push({ kind: 'deployRejected', slot, reason: 'locked' });
    return;
  }
  const cost = rosterOf(s.input.armyAge)[slot].cost * 1000;
  const field = s.units.filter((u) => u.side === 'player').length + s.queue.length;
  if (s.food < cost) ev.push({ kind: 'deployRejected', slot, reason: 'food' });
  else if (s.queue.length >= QUEUE_CAP) ev.push({ kind: 'deployRejected', slot, reason: 'queue' });
  else if (field >= FIELD_CAP) ev.push({ kind: 'deployRejected', slot, reason: 'cap' });
  else {
    s.food -= cost;
    s.queue.push(slot);
    ev.push({ kind: 'deployQueued', slot, foodSpent: cost / 1000, queue: s.queue.length });
  }
}

/**
 * Stormcall aim (GDD §2.12): the x that catches the most hostiles in the strike radius (a Warlord counts as 3);
 * ties go to the point nearer the player's base. Candidate centres are each hostile's x and x + radius, so the
 * strike can be centred on a clump rather than on its lead unit. Returns null when there are no hostiles.
 */
export function stormcallAim(units: readonly Unit[]): { x: number; weight: number } | null {
  const r = STORMCALL.radius * MU;
  let best: { x: number; weight: number } | null = null;
  for (const c of units) {
    if (c.side !== 'enemy' || c.hp <= 0) continue;
    for (const x of [c.x, c.x + r]) {
      let w = 0;
      for (const v of units) if (v.side === 'enemy' && v.hp > 0 && Math.abs(v.x - x) <= r + v.width / 2) w += v.role === 'warlord' ? 3 : 1;
      if (!best || w > best.weight || (w === best.weight && x < best.x)) best = { x, weight: w };
    }
  }
  return best;
}

function enemySpawns(s: BattleState, ev: SimEvent[]) {
  const enemies = () => s.units.filter((u) => u.side === 'enemy').length;
  while (s.scheduleIdx < s.schedule.length && s.schedule[s.scheduleIdx]!.tick <= s.tick) {
    const sp = s.schedule[s.scheduleIdx]!;
    if (sp.kind !== 'W' && enemies() >= FIELD_CAP) break; // hold until there is room
    s.scheduleIdx += 1;
    spawnEnemy(s, sp.kind, ev, false);
  }
  // After the assault, a light trickle (half the assault's spend rate, no tanks) keeps the lane alive. It stops once
  // bases take double damage, so a player who keeps deploying always breaks through.
  if (s.tick >= s.trickleNext && s.scheduleIdx >= s.schedule.length && s.tick < BASE_DOUBLE) {
    if (enemies() < FIELD_CAP) {
      const kind = s.trickle[s.trickleIdx % s.trickle.length]!;
      s.trickleIdx += 1;
      spawnEnemy(s, kind, ev, false);
    }
    s.trickleNext = s.tick + s.trickleEvery;
  }
}

/** `rally` is the unit's index in a rally pack (staggered outward, behind the gate), or false for a normal spawn. */
function spawnEnemy(s: BattleState, kind: SpawnToken | 'W', ev: SimEvent[], rally: number | false) {
  const def = tokenDef(s.stage, kind);
  const assist = 1 - clampAssist(s.input.assist);
  // The Warlord's calibrated multiplier scales HP only: its slam damage stays at the designed value so the
  // "Lv-2 ranged troops survive one slam" breakpoint never moves with calibration.
  const common = timelineMult(s.input.timeline) * assist;
  const u = kind === 'W'
    ? makeUnit(s, 'enemy', def, s.stage.bossMult * common, common)
    : makeUnit(s, 'enemy', def, s.stage.enemyStatMult * common);
  if (rally !== false) u.x += (rally % 3) * 30 * MU; // stagger outward so a pack reads as a group
  s.units.push(u);
  ev.push({ kind: 'spawn', id: u.id, side: 'enemy', def: def.id, x: u.x / MU, rally: rally !== false });
  if (kind === 'W') {
    s.warlordId = u.id;
    ev.push({ kind: 'warlordIntro', id: u.id });
  }
}

function move(s: BattleState, u: Unit, startX: Map<number, number>) {
  const d = dir(u.side);
  const speed = u.charged && u.trait?.kind === 'charge' ? Math.round(u.speed * u.trait.speedMult) : u.speed;
  let nx = u.x + d * speed;
  // Never pass the hostile base front or a hostile unit (keep edge gap ≥ 0 against start-of-tick positions).
  if (u.side === 'player') nx = Math.min(nx, ENEMY_GATE - u.width / 2);
  else nx = Math.max(nx, PLAYER_GATE + u.width / 2);
  for (const v of s.units) {
    if (v.side === u.side || v.hp <= 0) continue;
    const vx = startX.get(v.id) ?? v.x;
    if (d > 0 && vx >= u.x) nx = Math.min(nx, vx - (u.width + v.width) / 2);
    if (d < 0 && vx <= u.x) nx = Math.max(nx, vx + (u.width + v.width) / 2);
  }
  if ((d > 0 && nx > u.x) || (d < 0 && nx < u.x)) {
    u.x = nx;
    u.moving = true;
  }
}

function impact(s: BattleState, u: Unit, hits: Hit[], ev: SimEvent[]) {
  const hostile: Side = u.side === 'player' ? 'enemy' : 'player';
  // Re-check: keep the original target if still alive and close, else the nearest valid target, else the base.
  let target: Unit | null = null;
  if (u.target !== BASE) {
    const orig = s.units.find((v) => v.id === u.target && v.hp > 0);
    if (orig && gap(u, orig) <= u.range + RECHECK_SLACK) target = orig;
  }
  if (!target) target = nearestHostileInRange(s.units, u);
  const baseInRange = baseGap(u) <= u.range + RECHECK_SLACK;
  if (!target && !baseInRange) {
    ev.push({ kind: 'whiff', id: u.id });
    return;
  }
  let dmg = u.dmg;
  let heavy = u.role === 'tank' || u.role === 'warlord';
  if (u.charged && u.trait?.kind === 'charge') {
    dmg = Math.round(dmg * u.trait.mult);
    u.charged = false;
    heavy = true;
  }
  if (u.proj) {
    const toX = target ? target.x : u.side === 'player' ? ENEMY_GATE : PLAYER_GATE;
    const flight = Math.max(2, Math.round(Math.abs(toX - u.x) / Math.max(1, u.projSpeed)));
    const projId = s.nextId++;
    s.projectiles.push({
      id: projId,
      shooter: u.id,
      side: u.side,
      target: target ? target.id : BASE,
      lastX: toX,
      arrive: s.tick + flight,
      dmg,
      style: u.proj,
      trait: u.trait,
      shooterX: u.x,
    });
    ev.push({
      kind: 'projectile', projId, id: u.id, from: u.x / MU, to: target ? target.id : 'base', toX: toX / MU,
      arriveTick: s.tick + flight, style: u.proj,
    });
    return;
  }
  const source = u.id;
  if (u.trait?.kind === 'slam') {
    const r = u.trait.radius * MU;
    for (const v of s.units) if (v.side === hostile && v.hp > 0 && gap(u, v) <= r) hits.push({ target: v.id, side: hostile, source, amount: dmg, heavy: true });
    if (baseGap(u) <= r) hits.push({ target: BASE, side: hostile, source, amount: dmg, heavy: true });
    return;
  }
  if (target) {
    hits.push({ target: target.id, side: hostile, source, amount: dmg, heavy });
    if (u.trait?.kind === 'cleave') {
      const r = u.trait.radius * MU;
      for (const v of s.units) {
        if (v.side === hostile && v.hp > 0 && v.id !== target.id && Math.abs(v.x - target.x) <= r) {
          hits.push({ target: v.id, side: hostile, source, amount: Math.round(dmg * u.trait.mult), heavy: false });
        }
      }
    }
  } else {
    hits.push({ target: BASE, side: hostile, source, amount: dmg, heavy });
  }
}

function arriveProjectiles(s: BattleState, hits: Hit[], ev: SimEvent[]) {
  const flying: Projectile[] = [];
  for (const p of s.projectiles) {
    const t = p.target === BASE ? null : s.units.find((v) => v.id === p.target);
    if (t && t.hp > 0) p.lastX = t.x;
    if (s.tick < p.arrive) {
      flying.push(p);
      continue;
    }
    const hostile: Side = p.side === 'player' ? 'enemy' : 'player';
    const src = { source: p.shooter, proj: p.id };
    if (p.trait?.kind === 'splash') {
      const r = p.trait.radius * MU;
      const amount = Math.round(p.dmg * p.trait.mult);
      for (const v of s.units) if (v.side === hostile && v.hp > 0 && Math.abs(v.x - p.lastX) <= r) hits.push({ target: v.id, side: hostile, ...src, amount, heavy: true });
      const gateX = hostile === 'enemy' ? ENEMY_GATE : PLAYER_GATE;
      if (Math.abs(gateX - p.lastX) <= r) hits.push({ target: BASE, side: hostile, ...src, amount, heavy: true });
      ev.push({ kind: 'projectileEnd', projId: p.id, x: p.lastX / MU, result: 'explode', r: p.trait.radius });
      continue;
    }
    if (p.target === BASE) {
      hits.push({ target: BASE, side: hostile, ...src, amount: p.dmg, heavy: false });
      ev.push({ kind: 'projectileEnd', projId: p.id, x: p.lastX / MU, result: 'hit' });
      continue;
    }
    if (!t || t.hp <= 0) {
      ev.push({ kind: 'projectileEnd', projId: p.id, x: p.lastX / MU, result: 'fizzle' }); // target died mid-flight
      continue;
    }
    hits.push({ target: t.id, side: hostile, ...src, amount: p.dmg, heavy: false });
    ev.push({ kind: 'projectileEnd', projId: p.id, x: t.x / MU, result: 'hit' });
    if (p.trait?.kind === 'pierce' && p.trait.count > 1) {
      const d = dir(p.side);
      const behind = s.units
        .filter((v) => v.side === hostile && v.hp > 0 && v.id !== t.id && (v.x - t.x) * d >= 0 && Math.abs(v.x - t.x) <= PIERCE_DEPTH)
        .sort((a, b) => Math.abs(a.x - t.x) - Math.abs(b.x - t.x) || a.id - b.id)
        .slice(0, p.trait.count - 1);
      for (const v of behind) hits.push({ target: v.id, side: hostile, ...src, amount: Math.round(p.dmg * p.trait.mult), heavy: false });
    }
  }
  s.projectiles = flying;
}

function strikeStormcall(s: BattleState, hits: Hit[], ev: SimEvent[]) {
  const sc = s.stormcall;
  if (sc.strikeAt < 0 || s.tick < sc.strikeAt) return;
  const r = STORMCALL.radius * MU;
  const dmg = stormcallDamage(s.input.armyAge);
  for (const v of s.units) {
    if (v.side !== 'enemy' || v.hp <= 0 || Math.abs(v.x - sc.strikeX) > r + v.width / 2) continue;
    hits.push({ target: v.id, side: 'enemy', source: 0, amount: v.role === 'warlord' ? Math.round(dmg * STORMCALL.warlordShare) : dmg, heavy: true });
  }
  ev.push({ kind: 'stormcallStrike', x: sc.strikeX / MU, radius: STORMCALL.radius });
  sc.strikeAt = -1;
  sc.chargeFrom = s.tick;
  sc.readyAt = s.tick + sec(STORMCALL.cooldownSec);
  sc.announced = false;
}

function stormMult(tick: number) {
  if (tick < STORM_START) return 1;
  return 1 + STORM.stepBonus * (1 + Math.floor((tick - STORM_START) / STORM_STEP));
}

function applyHits(s: BattleState, hits: Hit[], ev: SimEvent[]) {
  const m = stormMult(s.tick);
  const baseM = s.tick >= BASE_DOUBLE ? 2 : 1;
  for (const h of hits) {
    if (h.target === BASE) {
      const base = h.side === 'player' ? s.playerBase : s.enemyBase;
      const warded = h.side === 'enemy' && s.enemyBase.warded;
      const amount = warded ? 0 : Math.max(1, Math.round(h.amount * m * baseM));
      base.hp = Math.max(0, base.hp - amount);
      ev.push({
        kind: 'hit', targetId: 'base', targetSide: h.side, sourceId: h.source, ...(h.proj ? { projId: h.proj } : {}),
        amount, heavy: h.heavy, armored: false, ...(warded ? { blocked: 'ward' as const } : {}),
      });
      continue;
    }
    const v = s.units.find((u) => u.id === h.target);
    if (!v) continue;
    const amount = Math.max(1, Math.round(h.amount * m * (1 - v.armor)));
    v.hp -= amount;
    ev.push({
      kind: 'hit', targetId: v.id, targetSide: v.side, sourceId: h.source, ...(h.proj ? { projId: h.proj } : {}),
      amount, heavy: h.heavy, armored: v.armor > 0,
    });
  }
}

function resolveDeaths(s: BattleState, ev: SimEvent[]) {
  const alive: Unit[] = [];
  for (const u of s.units) {
    if (u.hp > 0) {
      alive.push(u);
      continue;
    }
    let gold = 0;
    if (u.side === 'enemy') {
      gold = u.killGold;
      s.goldEarned += gold;
      if (u.role === 'warlord') s.stats.warlordKills += 1;
      else if (u.role === 'tank') s.stats.tankKills += 1;
      s.stats.kills += 1;
    }
    ev.push({ kind: 'death', id: u.id, side: u.side, def: u.def, x: u.x / MU, gold });
    if (u.id === s.warlordId && s.enemyBase.warded) {
      s.enemyBase.warded = false;
      ev.push({ kind: 'wardBroken' });
    }
  }
  s.units = alive;
}

/**
 * Base-damage Gold (GDD §2.11): +1 per full 5% of the enemy base's max HP removed (max 20). While a Warlord wards
 * the base, damage to the Warlord pays the same way (max 20), so a lost boss fight still funds the next attempt.
 */
function baseRewards(s: BattleState, ev: SimEvent[]) {
  const removed = s.enemyBase.max - s.enemyBase.hp;
  const chunks = Math.min(BASE_CHUNK_MAX, Math.floor((removed * 20) / s.enemyBase.max));
  if (chunks > s.chunksPaid) {
    const gold = chunks - s.chunksPaid;
    s.chunksPaid = chunks;
    s.goldEarned += gold;
    s.stats.baseChunks = chunks;
    ev.push({ kind: 'baseChunk', side: 'enemy', source: 'base', pct: chunks * 5, gold });
  }
  if (s.warlordId) {
    const w = s.units.find((u) => u.id === s.warlordId);
    const wChunks = w ? Math.min(BASE_CHUNK_MAX, Math.floor(((w.maxHp - Math.max(0, w.hp)) * 20) / w.maxHp)) : BASE_CHUNK_MAX;
    if (wChunks > s.warlordChunksPaid) {
      const gold = wChunks - s.warlordChunksPaid;
      s.warlordChunksPaid = wChunks;
      s.goldEarned += gold;
      ev.push({ kind: 'baseChunk', side: 'enemy', source: 'warlord', pct: wChunks * 5, gold });
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Render-facing snapshot

export function snapshot(b: Battle): BattleSnapshot {
  const s = b.state;
  const units: UnitView[] = s.units.map((u) => ({
    id: u.id,
    side: u.side,
    def: u.def,
    role: u.role,
    x: u.x / MU,
    hp: u.hp,
    maxHp: u.maxHp,
    state: u.phase === 'windup' ? 'windup' : u.phase === 'recover' ? 'recover' : u.moving ? 'walk' : 'idle',
    phaseEnd: u.phase === 'idle' ? 0 : u.phaseEnd,
  }));
  const sc = s.stormcall;
  const casting = sc.strikeAt >= 0;
  const charge = !sc.unlocked || casting ? 0 : Math.max(0, Math.min(1, (s.tick - sc.chargeFrom) / Math.max(1, sc.readyAt - sc.chargeFrom)));
  return {
    tick: s.tick,
    food: Math.floor(s.food / 1000),
    foodRate: (s.foodPerTick * TICKS_PER_SECOND) / 1000,
    playerBase: { hp: s.playerBase.hp, maxHp: s.playerBase.max },
    enemyBase: { hp: s.enemyBase.hp, maxHp: s.enemyBase.max, warded: s.enemyBase.warded },
    units,
    queue: {
      melee: s.queue.filter((q) => q === 'melee').length,
      ranged: s.queue.filter((q) => q === 'ranged').length,
      tank: s.queue.filter((q) => q === 'tank').length,
    },
    stormcall: { unlocked: sc.unlocked, charge, ready: sc.unlocked && !casting && s.tick >= sc.readyAt, casting },
    stormLevel: s.stormLevel,
    goldEarned: s.goldEarned,
    result: s.result,
  };
}

/** Exact food in milli-food, for deploy-affordability checks in the UI. */
export const exactFood = (b: Battle) => b.state.food;
