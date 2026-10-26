import { Container, Sprite } from 'pixi.js';
import type { Side } from '../../contracts';
import { bakeParts, type BakedPart } from './painter';
import { AGE_PALETTE, FACTION } from './palette';
import { FACES, STONE_RIGS, type FaceKind, type RigNode, type RigSpec } from './rigs';

/**
 * Baked rig library + a live unit (ART_BIBLE §5.7–5.8). Each unit is two parallel container trees built from one
 * RigSpec: every ink sprite sits in the back tree and every fill sprite in the front tree, so one outline wraps the
 * whole silhouette. Animation is procedural and slaved to sim events (attackStart → impact, hit, death).
 */

interface Baked {
  spec: RigSpec;
  parts: Record<string, BakedPart>;
}

export class RigLibrary {
  private cache = new Map<string, Baked>();
  private scale = 0;

  /** Rebakes when the bake scale (px per wu) changes by more than 15 % (rotation, a much bigger screen). */
  setScale(s: number) {
    if (this.scale && Math.abs(s - this.scale) / this.scale < 0.15) return;
    this.scale = s;
    this.cache.clear(); // old textures stay alive for the units still using them; they are freed with the atlas GC
  }

  has(defId: string) {
    return defId in STONE_RIGS;
  }

  get(defId: string, side: Side): Baked | null {
    const make = STONE_RIGS[defId];
    if (!make) return null;
    const key = `${defId}|${side}|${this.scale}`;
    let b = this.cache.get(key);
    if (!b) {
      const spec = make(side);
      const parts = bakeParts(spec.defs, { scale: this.scale || 0.6, faction: FACTION[side], shadowTint: AGE_PALETTE.stone.shadowTint });
      b = { spec, parts };
      this.cache.set(key, b);
    }
    return b;
  }
}

interface Node {
  ink: Container;
  fill: Container;
  fillSprite: Sprite | null;
  part: BakedPart | null;
  rest: { x: number; y: number };
}

const TAU = Math.PI * 2;
const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
const easeIn = (t: number) => Math.pow(Math.max(0, Math.min(1, t)), 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Arm and weapon angles for the melee swing (radians; arm 0 = hanging down, + = hand goes back). */
// rest: arm a little forward, weapon tilted forward-up beside the face (never across it)
const MELEE = { rest: [-0.4, 1.0], up: [2.5, 2.45], hit: [5.25, 3.05] } as const;
const RANGED = { rest: [-1.05, 1.05], up: [-0.25, -0.35], hit: [-1.4, 1.45] } as const;

export type DeathKind = 'launch' | 'topple' | 'break';

export class UnitArt {
  readonly root = new Container(); // positioned by the scene (world → screen), mirrored for the enemy
  private body = new Container(); // render scale/offset of the rig (bosses)
  private inkTree = new Container();
  private fillTree = new Container();
  private nodes = new Map<string, Node>();
  private face: FaceKind = 'neutral';
  private faceUntil = 0;
  private nextBlink: number;
  private t = 0; // ms
  private walkPhase: number;
  private flashUntil = 0;
  private whiteOn = false;
  private kick = 0; // torso spring angle
  private kickV = 0;
  private squash = 0; // 0..1 hit squash
  private recoil = 0; // wu pushed back (visual)
  private attack: { start: number; impact: number; struck: boolean; strikeAt: number } | null = null;
  private spawnAt = -1;
  dying = -1; // ms since death, -1 alive
  private deathKind: DeathKind = 'topple';
  private cheering = false;
  private readonly spec: RigSpec;

  constructor(lib: RigLibrary, defId: string, readonly side: Side, readonly seed: number) {
    const baked = lib.get(defId, side)!;
    this.spec = baked.spec;
    this.walkPhase = (seed * 0.618) % 1;
    this.nextBlink = 1500 + ((seed * 977) % 3000);
    this.body.addChild(this.inkTree, this.fillTree);
    this.root.addChild(this.body);
    this.build(this.spec.root, this.inkTree, this.fillTree, baked.parts);
    const k = this.spec.scale ?? 1;
    const variety = 0.97 + ((seed * 31) % 7) / 100; // render-only size variety 0.97–1.03 (§5.6)
    this.body.scale.set(k * variety);
    this.body.x = this.spec.offsetX ?? 0;
    this.setFace('neutral');
  }

  private build(n: RigNode, ink: Container, fill: Container, parts: Record<string, BakedPart>) {
    const ci = new Container();
    const cf = new Container();
    ci.position.set(n.at[0], n.at[1]);
    cf.position.set(n.at[0], n.at[1]);
    const part = parts[n.name] ?? null;
    let fillSprite: Sprite | null = null;
    if (part) {
      if (part.ink && !n.fillOnly) {
        const s = new Sprite(part.ink);
        s.anchor.set(part.anchor.x, part.anchor.y);
        s.scale.set(1 / part.scale);
        ci.addChild(s);
      }
      fillSprite = new Sprite(part.fill);
      fillSprite.anchor.set(part.anchor.x, part.anchor.y);
      fillSprite.scale.set(1 / part.scale);
      cf.addChild(fillSprite);
    }
    ink.addChild(ci);
    fill.addChild(cf);
    this.nodes.set(n.name, { ink: ci, fill: cf, fillSprite, part, rest: { x: n.at[0], y: n.at[1] } });
    for (const c of n.children ?? []) this.build(c, ci, cf, parts);
  }

  private set(name: string, x: number | null, y: number | null, rot: number, sx = 1, sy = 1) {
    const n = this.nodes.get(name);
    if (!n) return;
    for (const c of [n.ink, n.fill]) {
      c.position.set(x ?? n.rest.x, y ?? n.rest.y);
      c.rotation = rot;
      c.scale.set(sx, sy);
    }
  }

  private setFace(f: FaceKind) {
    this.face = f;
    for (const k of FACES) {
      const n = this.nodes.get(`face_${k}`);
      if (n) n.fill.visible = k === f && !this.whiteOn;
    }
  }

  // ---------------------------------------------------------------------------------------------------- events
  onSpawn() {
    this.spawnAt = this.t;
  }

  onAttackStart(tick: number, impactTick: number) {
    this.attack = { start: tick, impact: impactTick, struck: false, strikeAt: 0 };
  }

  onHit(heavy: boolean) {
    this.flashUntil = this.t + 80;
    this.kickV -= heavy ? 9 : 6;
    this.squash = 1;
    if (heavy) this.recoil = 6;
    if (this.dying < 0) {
      this.setFace('ouch');
      this.faceUntil = this.t + 150;
    }
  }

  onDeath(kind: DeathKind) {
    this.dying = 0;
    this.deathKind = kind;
    this.setFace('ko');
    this.faceUntil = Infinity;
  }

  cheer() {
    this.cheering = true;
    this.setFace('cheer');
    this.faceUntil = Infinity;
  }

  // ---------------------------------------------------------------------------------------------------- frame
  /**
   * @param dt     ms of animation time this frame (0 while paused)
   * @param state  the unit's sim state this frame
   * @param tick   continuous sim time in ticks (curr.tick − 1 + alpha)
   * @param speed  world units per second when walking
   */
  update(dt: number, state: 'walk' | 'windup' | 'recover' | 'idle', tick: number, speed: number) {
    this.t += dt;
    const sp = this.spec;
    // hit flash: swap fill textures to the baked white versions (no extra sprites, §5.8)
    const white = this.t < this.flashUntil;
    if (white !== this.whiteOn) {
      this.whiteOn = white;
      for (const n of this.nodes.values()) if (n.fillSprite && n.part) n.fillSprite.texture = white ? n.part.white : n.part.fill;
      this.setFace(this.face);
    }
    if (this.t > this.faceUntil && this.face !== 'neutral' && this.face !== 'blink' && this.dying < 0 && !this.cheering) this.setFace('neutral');
    // blink every 2–5 s
    if (this.face === 'neutral' && this.t > this.nextBlink) {
      this.setFace('blink');
      this.faceUntil = this.t + 90;
      this.nextBlink = this.t + 2000 + ((this.seed * 7919 + this.t) % 3000);
    } else if (this.face === 'blink' && this.t > this.faceUntil) this.setFace('neutral');

    // torso spring (k 180, d 14) and decays
    const s = dt / 1000;
    this.kickV += (-180 * this.kick - 14 * this.kickV) * s;
    this.kick += this.kickV * s;
    this.squash = Math.max(0, this.squash - s * 7);
    this.recoil = Math.max(0, this.recoil - s * 24);

    if (sp.kind === 'quad') this.updateQuad(dt, state, tick, speed);
    else this.updateBiped(dt, state, tick, speed);

    // spawn drop (24 wu, squash on landing)
    let dropY = 0;
    let sq = 1;
    if (this.spawnAt >= 0) {
      const f = (this.t - this.spawnAt) / 250;
      if (f < 1) dropY = -24 * (1 - easeIn(f));
      else if (f < 1.8) sq = 1 + 0.18 * Math.sin(((f - 1) / 0.8) * Math.PI) * (1 - (f - 1) / 0.8);
      else this.spawnAt = -1;
    }
    const hitSq = this.squash * 0.08;
    this.inkTree.position.set(-this.recoil, dropY);
    this.fillTree.position.set(-this.recoil, dropY);
    for (const tr of [this.inkTree, this.fillTree]) tr.scale.set(sq * (1 - hitSq), (2 - sq) * (1 + hitSq));

    if (this.dying >= 0) this.updateDeath(dt);
  }

  private updateBiped(dt: number, state: string, tick: number, speed: number) {
    const sp = this.spec;
    const ranged = !!sp.ranged;
    const theta = Math.asin(Math.min(0.95, sp.stride / (2 * sp.legLen))); // feet stay planted: 17.7° (biped)
    let walk = 0;
    if (state === 'walk' && this.dying < 0) {
      this.walkPhase += (dt / 1000) * (speed / (2 * sp.stride)); // one cycle per two strides
      walk = 1;
    }
    const ph = this.walkPhase * TAU;
    const legA = Math.sin(ph) * theta * walk;
    this.set('legBack', null, null, -legA);
    this.set('legFront', null, null, legA);
    const bob = walk ? -Math.abs(Math.sin(ph)) * 3 : 0;
    const breath = walk ? 0 : Math.sin((this.t / 1200) * TAU) * 0.015;
    const lean = walk ? 0.07 : 0;
    const legLen = sp.legLen;
    // arm/weapon pose
    const pose = this.weaponPose(tick, ranged ? RANGED : MELEE);
    const armSwing = walk ? Math.sin(ph) * 0.31 : Math.sin((this.t / 1200) * TAU) * 0.04;
    const torsoRot = lean + pose.lean + this.kick * 0.017;
    this.set('torsoPivot', null, -legLen + bob, torsoRot, 1, 1 + breath);
    this.set('armBack', null, null, -armSwing * 0.8 + (pose.active ? 0.3 : 0));
    this.set(sp.weaponArm, null, null, pose.active ? pose.arm : (ranged ? RANGED.rest[0] : MELEE.rest[0]) + armSwing * (ranged ? 0.25 : 0.6));
    this.set('weapon', null, null, pose.weapon);
    this.set(sp.head, null, null, -torsoRot * 0.5 + (walk ? Math.sin(ph * 2) * 0.035 : 0));
    if (this.cheering) {
      const j = Math.abs(Math.sin((this.t / 600) * Math.PI));
      this.set('torsoPivot', null, -legLen - j * 10, 0);
      this.set(sp.weaponArm, null, null, 2.9 + Math.sin(this.t / 120) * 0.2);
      this.set('weapon', null, null, 2.9);
    }
  }

  private updateQuad(dt: number, state: string, tick: number, speed: number) {
    const sp = this.spec;
    const theta = Math.asin(Math.min(0.95, sp.stride / (2 * sp.legLen)));
    let walk = 0;
    if (state === 'walk' && this.dying < 0) {
      this.walkPhase += (dt / 1000) * (speed / (2 * sp.stride));
      walk = 1;
    }
    const ph = this.walkPhase * TAU;
    const legs: [string, number][] = [['qLegBackFar', 0.5], ['qLegFrontFar', 0], ['qLegBack', 0], ['qLegFront', 0.5]];
    for (const [name, off] of legs) this.set(name, null, null, Math.sin(ph + off * TAU) * theta * walk);
    const pose = this.weaponPose(tick, MELEE);
    // the mammoth rears its head during the windup and slams it down on impact
    const headLift = pose.active ? pose.lean * -2.2 : 0;
    const bob = walk ? -Math.abs(Math.sin(ph)) * 5 : Math.sin((this.t / 1400) * TAU) * 2;
    this.set('bodyPivot', null, -104 + bob, (walk ? Math.sin(ph) * 0.02 : 0) + this.kick * 0.01);
    this.set('qHead', null, null, headLift + (walk ? Math.sin(ph * 2) * 0.04 : 0));
    const sway = Math.sin(this.t / 700) * 0.12 + (walk ? Math.sin(ph + 1) * 0.15 : 0);
    this.set('trunk1', null, null, sway * 0.6 + headLift * 0.8);
    this.set('trunk2', null, null, sway * 0.8);
    this.set('trunk3', null, null, sway);
    this.set('ear', null, null, Math.sin(this.t / 500) * 0.1 + (walk ? Math.sin(ph) * 0.1 : 0));
    this.set('riderPivot', null, null, this.kick * 0.02 + (walk ? Math.sin(ph * 2) * 0.03 : 0), 1.3, 1.3);
    this.set(sp.weaponArm, null, null, pose.active ? pose.arm : MELEE.rest[0] + Math.sin(this.t / 900) * 0.08);
    this.set('weapon', null, null, pose.weapon);
    this.set('riderArmBack', null, null, 0.4 + Math.sin(this.t / 900) * 0.05);
  }

  /** Windup → strike (60 ms) → hold (40 ms) → recover (250 ms), keyed to the sim's impact tick (§5.8). */
  private weaponPose(tick: number, keys: typeof MELEE | typeof RANGED) {
    const a = this.attack;
    const rest = { active: false, arm: keys.rest[0], weapon: keys.rest[1], lean: 0 };
    if (!a || this.dying >= 0) return rest;
    const winTicks = Math.max(1, a.impact - a.start);
    if (tick < a.impact) {
      const f = ease((tick - a.start) / winTicks);
      return { active: true, arm: lerp(keys.rest[0], keys.up[0], f), weapon: lerp(keys.rest[1], keys.up[1], f), lean: -0.12 * f };
    }
    if (!a.struck) {
      a.struck = true;
      a.strikeAt = this.t;
      if (this.face !== 'ouch') {
        this.setFace('fierce');
        this.faceUntil = this.t + 260;
      }
    }
    const since = this.t - a.strikeAt;
    if (since < 60) {
      const f = ease(since / 60);
      return { active: true, arm: lerp(keys.up[0], keys.hit[0], f), weapon: lerp(keys.up[1], keys.hit[1], f), lean: lerp(-0.12, 0.12, f) };
    }
    if (since < 100) return { active: true, arm: keys.hit[0], weapon: keys.hit[1], lean: 0.12 };
    if (since < 350) {
      const f = ease((since - 100) / 250);
      const restArm = keys === MELEE ? keys.rest[0] + TAU : keys.rest[0];
      return { active: true, arm: lerp(keys.hit[0], restArm, f), weapon: lerp(keys.hit[1], keys.rest[1], f), lean: lerp(0.12, 0, f) };
    }
    this.attack = null;
    return rest;
  }

  private updateDeath(dt: number) {
    this.dying += dt;
    const t = this.dying;
    const r = this.body;
    if (this.deathKind === 'launch') {
      const f = Math.min(1, t / 800);
      r.y = -Math.sin(Math.min(1, t / 500) * Math.PI) * 40;
      r.x = (this.spec.offsetX ?? 0) - f * 30;
      r.rotation = -f * TAU;
      this.root.alpha = t < 500 ? 1 : Math.max(0, 1 - (t - 500) / 300);
    } else if (this.deathKind === 'topple') {
      const f = Math.min(1, t / 350);
      const bounce = t > 350 && t < 500 ? Math.sin(((t - 350) / 150) * Math.PI) * 0.12 : 0;
      r.rotation = -(Math.PI / 2) * easeIn(f) + bounce;
      r.y = t > 500 ? (t - 500) * 0.06 : 0;
      this.root.alpha = t < 450 ? 1 : Math.max(0, 1 - (t - 450) / 250);
    } else {
      // break: tilt and sink while the listed parts fly off with seeded spins
      const f = Math.min(1, t / 900);
      r.rotation = -0.5 * ease(f);
      r.y = f * 30;
      for (const [i, name] of (this.spec.breakParts ?? []).entries()) {
        const n = this.nodes.get(name);
        if (!n) continue;
        const dir = i % 2 ? 1 : -1;
        const vx = dir * (30 + ((this.seed + i * 13) % 40));
        const ft = t / 1000;
        for (const c of [n.ink, n.fill]) {
          c.x = n.rest.x + vx * ft;
          c.y = n.rest.y - 160 * ft + 400 * ft * ft;
          c.rotation += dir * dt * 0.012;
        }
      }
      this.root.alpha = t < 600 ? 1 : Math.max(0, 1 - (t - 600) / 300);
    }
  }

  get done() {
    return this.dying > 950;
  }

  destroy() {
    this.root.destroy({ children: true });
  }
}
