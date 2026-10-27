import type { Role, Side, SimEvent, Tick } from '../contracts';
import { TICK_MS } from '../contracts';
import { unitDef } from '../data/units';
import type { PlayOpts } from './mixer';
import type { SoundId } from './sounds';

/**
 * What each SimEvent sounds like (ART_BIBLE polish checklist: every SimEvent kind has SFX, enforced by an exhaustive
 * switch and a unit test). Pure: an event plus a read-only view of the world gives a list of cues, or an explicit,
 * reasoned silence. Adding a SimEvent kind breaks the build here until it gets a sound.
 */

export interface Cue extends PlayOpts {
  id: SoundId;
}

/** A deliberate silence, with the reason (shown by the coverage test). */
export interface Silence {
  silent: string;
}

export type Sfx = readonly Cue[] | Silence;

export interface UnitInfo {
  x: number;
  role: Role;
  side: Side;
}

/** The presentation's view of the battle at the tick the events came from. */
export interface SfxWorld {
  unit(id: number): UnitInfo | undefined;
  /** Tick the events belong to. */
  tick: Tick;
  /** Battle speed (×1 / ×2): sim time to real time. */
  speed: number;
}

export const isSilence = (s: Sfx): s is Silence => !Array.isArray(s);
const silence = (why: string): Silence => ({ silent: why });

/** Player gate / enemy gate, where base sounds sit in the stereo field. */
const BASE_X: Record<Side, number> = { player: -40, enemy: 1040 };
/** Enemy-side sounds sit a little lower (semitones). */
const ENEMY_PITCH = -2;

function roleOf(def: string): Role {
  try {
    return unitDef(def).role;
  } catch {
    return 'melee';
  }
}

/** Seconds of real time from now until `tick` at the current battle speed. */
export function untilTick(w: SfxWorld, tick: Tick): number {
  return Math.max(0, ((tick - w.tick) * TICK_MS) / 1000 / Math.max(1, w.speed));
}

type E<K extends SimEvent['kind']> = Extract<SimEvent, { kind: K }>;

export function onSpawn(e: E<'spawn'>, _w: SfxWorld): Sfx {
  const role = roleOf(e.def);
  if (e.side === 'player') {
    const id: SoundId = role === 'tank' ? 'deployTank' : role === 'ranged' ? 'deployRanged' : 'deployMelee';
    return [{ id, x: e.x }];
  }
  if (role === 'warlord') return silence('the Warlord arrives with its own warlordIntro sting');
  if (e.rally) return [{ id: 'rallyStomp', x: e.x }];
  return [{ id: 'enemySpawn', x: e.x, param: role === 'tank' ? 1 : 0 }];
}

export function onAttackStart(e: E<'attackStart'>, w: SfxWorld): Sfx {
  if (e.area) return silence('area attacks (Warlord slam) are voiced by slamTelegraph');
  const u = w.unit(e.id);
  const role = u?.role ?? 'melee';
  const pitch = u?.side === 'enemy' ? ENEMY_PITCH : 0;
  if (role === 'ranged') return [{ id: 'slingWhirl', x: u?.x, pitch }];
  // the swing lands just before the impact
  const lead = role === 'melee' ? 0.12 : 0.2;
  const delay = Math.max(0, untilTick(w, e.impactTick) - lead);
  if (role === 'tank' || role === 'warlord') return [{ id: 'swingHeavy', x: u?.x, delay, pitch: pitch + (role === 'warlord' ? -4 : 0) }];
  return [{ id: 'swing', x: u?.x, delay, pitch }];
}

export function onProjectile(e: E<'projectile'>, w: SfxWorld): Sfx {
  const side = w.unit(e.id)?.side;
  return [{ id: 'slingTwang', x: e.from, dur: untilTick(w, e.arriveTick), pitch: side === 'enemy' ? ENEMY_PITCH : 0 }];
}

export function onProjectileEnd(e: E<'projectileEnd'>, _w: SfxWorld): Sfx {
  if (e.result === 'hit') return silence('the matching hit event plays the impact');
  if (e.result === 'explode') return [{ id: 'projExplode', x: e.x }];
  return [{ id: 'projFizzle', x: e.x }];
}

export function onHit(e: E<'hit'>, w: SfxWorld): Sfx {
  const pitch = e.targetSide === 'player' ? ENEMY_PITCH : 0;
  if (e.blocked === 'ward') return [{ id: 'wardTing', x: BASE_X.enemy }];
  if (e.sourceId === 0) return silence('Stormcall damage is covered by the thunder strike');
  if (e.targetId === 'base') return [{ id: 'baseHit', x: BASE_X[e.targetSide], param: e.heavy ? 1 : 0, pitch }];
  const x = w.unit(e.targetId)?.x;
  if (e.armored) return [{ id: 'hitArmor', x, pitch }];
  if (e.heavy) return [{ id: 'hitHeavy', x, pitch }];
  if (e.projId !== undefined) return [{ id: 'hitPebble', x, pitch }];
  return [{ id: 'hitLight', x, pitch }];
}

export function onWhiff(e: E<'whiff'>, w: SfxWorld): Sfx {
  return [{ id: 'whiff', x: w.unit(e.id)?.x }];
}

export function onDeath(e: E<'death'>, _w: SfxWorld): Sfx {
  const role = roleOf(e.def);
  const pitch = e.side === 'enemy' ? ENEMY_PITCH - 1 : 0;
  const cues: Cue[] = [];
  if (role === 'warlord') cues.push({ id: 'warlordDown', x: e.x });
  else cues.push({ id: role === 'tank' ? 'poofBig' : 'poof', x: e.x, pitch });
  if (e.gold > 0) cues.push({ id: 'coin', x: e.x, delay: 0.07, param: e.gold });
  return cues;
}

export function onBaseChunk(e: E<'baseChunk'>, _w: SfxWorld): Sfx {
  if (e.source === 'warlord') return [{ id: 'chunkCoins', x: 900 }];
  return [
    { id: 'baseChunk', x: BASE_X[e.side] },
    { id: 'chunkCoins', x: BASE_X[e.side], delay: 0.08 },
  ];
}

export function onRally(_e: E<'rally'>, _w: SfxWorld): Sfx {
  return [{ id: 'rallyHorn', x: BASE_X.enemy }];
}

export function onWardUp(_e: E<'wardUp'>, _w: SfxWorld): Sfx {
  return [{ id: 'wardUp', x: BASE_X.enemy }];
}

export function onWardBroken(_e: E<'wardBroken'>, _w: SfxWorld): Sfx {
  return [{ id: 'wardBreak', x: BASE_X.enemy }];
}

export function onWarlordIntro(e: E<'warlordIntro'>, w: SfxWorld): Sfx {
  return [{ id: 'warlordSting', x: w.unit(e.id)?.x ?? BASE_X.enemy }];
}

export function onSlamTelegraph(e: E<'slamTelegraph'>, w: SfxWorld): Sfx {
  const dur = untilTick(w, e.impactTick);
  return [
    { id: 'slamRumble', x: e.x, dur },
    { id: 'slamBoom', x: e.x, delay: dur },
  ];
}

export function onStormRising(e: E<'stormRising'>, _w: SfxWorld): Sfx {
  return [{ id: e.level <= 1 ? 'stormRising' : 'stormStep' }];
}

export function onStormcallCharged(_e: E<'stormcallCharged'>, _w: SfxWorld): Sfx {
  return [{ id: 'stormReady' }];
}

export function onStormcallCast(e: E<'stormcallCast'>, w: SfxWorld): Sfx {
  return [{ id: 'stormCharge', x: e.x, dur: untilTick(w, e.strikeTick) }];
}

export function onStormcallNoTarget(_e: E<'stormcallNoTarget'>, _w: SfxWorld): Sfx {
  return [{ id: 'nope', gain: 0.7 }];
}

export function onStormcallStrike(e: E<'stormcallStrike'>, _w: SfxWorld): Sfx {
  return [{ id: 'thunder', x: e.x }];
}

export function onDeployQueued(e: E<'deployQueued'>, _w: SfxWorld): Sfx {
  // climbs a major-scale step per queued troop: 1, 2, 3, 4 → 0, +2, +4, +5 semitones
  const steps = [0, 0, 2, 4, 5];
  return [{ id: 'deployTick', x: BASE_X.player, pitch: steps[Math.min(4, e.queue)] ?? 0 }];
}

export function onDeployRejected(_e: E<'deployRejected'>, _w: SfxWorld): Sfx {
  return [{ id: 'nope' }];
}

export function onEnd(e: E<'end'>, _w: SfxWorld): Sfx {
  if (e.result === 'victory') return [{ id: 'baseCollapse', x: BASE_X.enemy }, { id: 'victory', delay: 0.35 }];
  if (e.result === 'defeat') return [{ id: 'baseCollapse', x: BASE_X.player }, { id: 'defeat', delay: 0.5 }];
  return [{ id: 'retreat' }];
}

function never(e: never): never {
  throw new Error(`no sound for SimEvent ${(e as { kind: string }).kind}`);
}

/** The exhaustive dispatch: every SimEvent kind maps to its function above. */
export function sfxFor(e: SimEvent, w: SfxWorld): Sfx {
  switch (e.kind) {
    case 'spawn':
      return onSpawn(e, w);
    case 'attackStart':
      return onAttackStart(e, w);
    case 'projectile':
      return onProjectile(e, w);
    case 'projectileEnd':
      return onProjectileEnd(e, w);
    case 'hit':
      return onHit(e, w);
    case 'whiff':
      return onWhiff(e, w);
    case 'death':
      return onDeath(e, w);
    case 'baseChunk':
      return onBaseChunk(e, w);
    case 'rally':
      return onRally(e, w);
    case 'wardUp':
      return onWardUp(e, w);
    case 'wardBroken':
      return onWardBroken(e, w);
    case 'warlordIntro':
      return onWarlordIntro(e, w);
    case 'slamTelegraph':
      return onSlamTelegraph(e, w);
    case 'stormRising':
      return onStormRising(e, w);
    case 'stormcallCharged':
      return onStormcallCharged(e, w);
    case 'stormcallCast':
      return onStormcallCast(e, w);
    case 'stormcallNoTarget':
      return onStormcallNoTarget(e, w);
    case 'stormcallStrike':
      return onStormcallStrike(e, w);
    case 'deployQueued':
      return onDeployQueued(e, w);
    case 'deployRejected':
      return onDeployRejected(e, w);
    case 'end':
      return onEnd(e, w);
    default:
      return never(e);
  }
}
