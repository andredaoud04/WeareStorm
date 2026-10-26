import { signal } from '@preact/signals';
import type { BattleSnapshot, SimCommand, SimEvent, Slot } from '../contracts';
import { TICK_MS, TICKS_PER_SECOND } from '../contracts';
import { stageDef, type StageDef } from '../data/stages';
import { rosterOf } from '../data/units';
import { battleInput } from '../meta/progress';
import { createBattle, snapshot, stepMut, type BattleState } from '../sim/battle';
import { finishBattle, markPending, save } from './store';

/**
 * Runs one battle (TECH §4): a fixed 20 Hz sim behind a real-time accumulator. Speed (×1/×2) scales sim time;
 * hit-stop and slow-motion only slow the PRESENTATION clock, and time spent in them is not owed back to the sim, so
 * the outcome never depends on frame rate or effects. Render reads prev/curr snapshots plus `alpha`.
 */

export interface HudState {
  food: number;
  foodRate: number;
  pBase: number;
  pMax: number;
  eBase: number;
  eMax: number;
  warded: boolean;
  warlord: { hp: number; max: number } | null;
  queue: Record<Slot, number>;
  stormcall: BattleSnapshot['stormcall'];
  gold: number;
  stormLevel: number;
  seconds: number;
}

type EventSink = (events: readonly SimEvent[], tick: number) => void;
type FrameSink = (c: BattleSession) => void;

const MAX_TICKS_PER_FRAME = 4;

let battleSeq = 0;

export class BattleSession {
  readonly id: string;
  readonly stage: StageDef;
  readonly state: BattleState;
  prev: BattleSnapshot;
  curr: BattleSnapshot;
  alpha = 0;
  speed = 1;
  paused = false;
  private acc = 0;
  private freezeMs = 0;
  private slowMs = 0;
  private slowScale = 1;
  private queued: SimCommand[] = [];
  private eventSinks = new Set<EventSink>();
  private frameSinks = new Set<FrameSink>();
  private ended = false;
  private lastHud = -1;
  readonly hud = signal<HudState>(null as unknown as HudState);
  readonly ended$ = signal(false);

  constructor(stageId: number, seed: number) {
    battleSeq += 1;
    this.id = `b${Date.now().toString(36)}${battleSeq}`;
    this.stage = stageDef(stageId);
    this.state = createBattle(battleInput(save.value, stageId, seed)).state;
    this.prev = snapshot({ state: this.state });
    this.curr = this.prev;
    this.hud.value = this.makeHud();
    markPending(this.id, stageId, 0);
  }

  onEvents(fn: EventSink) {
    this.eventSinks.add(fn);
    return () => this.eventSinks.delete(fn);
  }

  onFrame(fn: FrameSink) {
    this.frameSinks.add(fn);
    return () => this.frameSinks.delete(fn);
  }

  /** Player input: applied at the start of the next sim tick, in arrival order. */
  command(c: SimCommand) {
    if (!this.ended && !this.paused) this.queued.push(c);
  }

  deploy(slot: Slot) {
    this.command({ kind: 'deploy', slot });
  }

  retreat() {
    if (this.ended) return;
    this.paused = false;
    this.queued.push({ kind: 'retreat' });
    this.tick(); // settle immediately; no need to wait for the next frame
  }

  /** Freeze presentation for `ms` (hit-stop). Overlapping requests keep the longest, never stack. */
  hitStop(ms: number) {
    this.freezeMs = Math.max(this.freezeMs, ms);
  }

  slowMo(ms: number, scale: number) {
    this.slowMs = ms;
    this.slowScale = scale;
  }

  /** Whole Food with sub-tick interpolation, for smooth card fills. */
  foodNow(): number {
    const per = this.state.foodPerTick;
    return (this.state.food + (this.state.result ? 0 : per * this.alpha)) / 1000;
  }

  cost(slot: Slot) {
    return rosterOf(this.state.input.armyAge)[slot].cost;
  }

  /** Advance by a real frame delta in ms. */
  frame(dtMs: number) {
    const dt = Math.min(dtMs, 250); // a backgrounded tab must not dump seconds of sim at once
    if (this.paused) {
      this.acc = 0;
    } else if (this.freezeMs > 0) {
      this.freezeMs -= dt;
    } else {
      let scale = this.speed;
      if (this.slowMs > 0) {
        this.slowMs -= dt;
        scale *= this.slowScale;
      }
      this.acc += dt * scale;
      let n = 0;
      while (this.acc >= TICK_MS && n < MAX_TICKS_PER_FRAME * this.speed && !this.ended) {
        this.acc -= TICK_MS;
        this.tick();
        n++;
      }
      if (n >= MAX_TICKS_PER_FRAME * this.speed) this.acc = Math.min(this.acc, TICK_MS); // slow down, never skip
      if (this.ended) this.acc = 0;
    }
    this.alpha = Math.max(0, Math.min(1, this.acc / TICK_MS));
    for (const f of this.frameSinks) f(this);
  }

  private tick() {
    if (this.ended) return;
    const cmds = this.queued;
    this.queued = [];
    const events = stepMut(this.state, cmds);
    this.prev = this.curr;
    this.curr = snapshot({ state: this.state });
    if (events.length) for (const s of this.eventSinks) s(events, this.state.tick);
    // HUD numbers refresh at 10 Hz (TECH §4), or immediately when something the player acts on changes.
    const urgent = events.some((e) => e.kind === 'deployQueued' || e.kind === 'stormcallCharged' || e.kind === 'stormcallCast' || e.kind === 'end');
    if (urgent || this.state.tick - this.lastHud >= 2) {
      this.lastHud = this.state.tick;
      this.hud.value = this.makeHud();
    }
    if (events.some((e) => e.kind === 'death' || e.kind === 'baseChunk')) {
      if (this.state.tick % 20 === 0 || events.some((e) => e.kind === 'baseChunk')) markPending(this.id, this.stage.id, this.state.goldEarned);
    }
    const end = events.find((e) => e.kind === 'end');
    if (end && end.kind === 'end') {
      this.ended = true;
      finishBattle({
        battleId: this.id,
        stageId: this.stage.id,
        result: end.result,
        goldEarned: end.goldEarned,
        kills: end.stats.kills,
        baseGold: end.stats.baseChunks,
        seconds: end.stats.durationTicks / TICKS_PER_SECOND,
      });
      this.ended$.value = true;
    }
  }

  private makeHud(): HudState {
    const c = this.curr;
    const w = this.state.warlordId ? this.state.units.find((u) => u.id === this.state.warlordId) : undefined;
    return {
      food: c.food,
      foodRate: c.foodRate,
      pBase: c.playerBase.hp,
      pMax: c.playerBase.maxHp,
      eBase: c.enemyBase.hp,
      eMax: c.enemyBase.maxHp,
      warded: c.enemyBase.warded,
      warlord: w ? { hp: Math.max(0, w.hp), max: w.maxHp } : this.state.warlordId ? { hp: 0, max: 1 } : null,
      queue: { ...c.queue },
      stormcall: c.stormcall,
      gold: c.goldEarned,
      stormLevel: c.stormLevel,
      seconds: c.tick / TICKS_PER_SECOND,
    };
  }
}

/** The running battle, if any. */
export const session = signal<BattleSession | null>(null);

export function startBattle(stageId: number): BattleSession {
  const s = new BattleSession(stageId, (Date.now() & 0x7fffffff) ^ (stageId * 7919));
  session.value = s;
  return s;
}

export function endSession() {
  session.value = null;
}
