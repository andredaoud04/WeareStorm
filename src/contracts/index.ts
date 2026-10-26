/**
 * Frozen contracts between the deterministic core (sim/meta/data) and presentation (render/ui/audio).
 * Changes need lead sign-off (PR label `contract-change`). See docs/TECH.md §3.
 */
export type AgeId = 'stone' | 'ancient' | 'medieval' | 'gunpowder' | 'industrial' | 'future';
export const AGE_ORDER: readonly AgeId[] = ['stone', 'ancient', 'medieval', 'gunpowder', 'industrial', 'future'];

export type Side = 'player' | 'enemy';
export type Slot = 'melee' | 'ranged' | 'tank';
export type Role = Slot | 'warlord';
export type UnitDefId = string; // e.g. 'stone.clubber'
export type StageId = number; // 1..30
export type Tick = number; // 20 Hz → 50 ms per tick
export const TICK_MS = 50;
export const TICKS_PER_SECOND = 20;

export type TraitId = 'cleave' | 'charge' | 'splash' | 'armor' | 'rapid' | 'pierce' | 'slam';
export type ProjStyle = 'pebble' | 'javelin' | 'bolt' | 'bomb' | 'bullet' | 'shell' | 'beam';

export interface SimInput {
  seed: number;
  stageId: StageId;
  armyAge: AgeId;
  timeline: number;
  owned: { ranged: boolean; tank: boolean };
  levels: { food: number; walls: number; melee: number; ranged: number; tank: number };
  stormcall: boolean;
  /** Lose-forward assist 0..0.3: enemy HP/DMG and assault-budget reduction after consecutive losses (GDD P3). */
  assist: number;
}

export type SimCommand =
  | { kind: 'deploy'; slot: Slot }
  | { kind: 'stormcall' }
  | { kind: 'retreat' };

export interface BattleStats {
  kills: number;
  tankKills: number;
  warlordKills: number;
  baseChunks: number;
  deployed: number;
  durationTicks: number;
}

export type BattleResult = 'victory' | 'defeat' | 'retreat';

/**
 * Everything the presentation layer needs to animate a tick. Positions are world units (wu), ticks are absolute.
 * `id` is always a unit id except where noted; projectiles carry their own `projId`.
 */
export type SimEvent =
  | { kind: 'spawn'; id: number; side: Side; def: UnitDefId; x: number; rally: boolean }
  | { kind: 'attackStart'; id: number; targetId: number | 'base'; impactTick: Tick; area?: { x: number; r: number } }
  | { kind: 'projectile'; projId: number; id: number; from: number; to: number | 'base'; toX: number; arriveTick: Tick; style: ProjStyle }
  | { kind: 'projectileEnd'; projId: number; x: number; result: 'hit' | 'fizzle' | 'explode'; r?: number }
  | {
      kind: 'hit';
      targetId: number | 'base';
      targetSide: Side;
      /** Attacking unit id; 0 for the Stormcall strike. */
      sourceId: number;
      projId?: number;
      amount: number;
      heavy: boolean;
      armored: boolean;
      /** Set when a ward absorbed the hit (amount is 0): play a "ting", no number. */
      blocked?: 'ward';
    }
  | { kind: 'whiff'; id: number }
  | { kind: 'death'; id: number; side: Side; def: UnitDefId; x: number; gold: number }
  | { kind: 'baseChunk'; side: Side; source: 'base' | 'warlord'; pct: number; gold: number }
  | { kind: 'rally'; size: number }
  | { kind: 'wardUp' }
  | { kind: 'wardBroken' }
  | { kind: 'warlordIntro'; id: number }
  | { kind: 'slamTelegraph'; id: number; x: number; radius: number; impactTick: Tick }
  | { kind: 'stormRising'; level: number }
  | { kind: 'stormcallCharged' }
  | { kind: 'stormcallCast'; x: number; radius: number; strikeTick: Tick }
  | { kind: 'stormcallNoTarget' }
  | { kind: 'stormcallStrike'; x: number; radius: number }
  | { kind: 'deployQueued'; slot: Slot; foodSpent: number; queue: number }
  | { kind: 'deployRejected'; slot: Slot; reason: 'food' | 'queue' | 'cap' | 'locked' }
  | { kind: 'end'; result: BattleResult; goldEarned: number; stats: BattleStats };

export type SimEventKind = SimEvent['kind'];

/** Render-facing view of one unit for one tick (positions in world units). */
export interface UnitView {
  id: number;
  side: Side;
  def: UnitDefId;
  role: Role;
  x: number;
  hp: number;
  maxHp: number;
  state: 'walk' | 'windup' | 'recover' | 'idle';
  /** Impact tick while winding up, end of recovery while recovering; 0 otherwise. */
  phaseEnd: Tick;
}

export interface BattleSnapshot {
  tick: Tick;
  food: number; // whole Food for display (floor)
  foodRate: number; // Food per second, for display
  playerBase: { hp: number; maxHp: number };
  enemyBase: { hp: number; maxHp: number; warded: boolean };
  units: readonly UnitView[];
  queue: Readonly<Record<Slot, number>>;
  stormcall: { unlocked: boolean; charge: number; ready: boolean; casting: boolean }; // charge 0..1
  stormLevel: number;
  goldEarned: number;
  result: BattleResult | null;
}
