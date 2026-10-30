import { Container, Graphics, Sprite } from 'pixi.js';
import type { Role, Side } from '../../contracts';
import type { Kit } from './loader';
import { factionOf, unitEntry } from './manifest';
import { ROLE_HEIGHT } from './sizes';

/**
 * One troop drawn from its kit hero sprite, animated procedurally from sim states and events: a stepped walk bob with
 * a forward lean, an anticipation → lunge attack keyed to the sim's impact tick, a cast/recoil for ranged troops, a
 * white hit flash with a knockback nudge, a fall-and-fade death that throws the weapon, a victory hop. The local
 * frame faces +x (right); the scene mirrors the root for the enemy. Units: world units (wu), y down, feet at 0.
 */

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
const easeIn = (t: number) => Math.pow(clamp01(t), 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export type UnitState = 'walk' | 'windup' | 'recover' | 'idle';

interface Debris {
  s: Sprite;
  vx: number;
  vy: number;
  spin: number;
}

/** Per-role motion amplitudes (fractions of the figure height, radians). */
const MOTION = {
  melee: { bob: 0.022, lean: 0.06, back: 0.1, lunge: 0.12, strikeRot: 0.17, steps: 2.6 },
  ranged: { bob: 0.02, lean: 0.05, back: 0.05, lunge: -0.05, strikeRot: -0.06, steps: 2.4 },
  tank: { bob: 0.016, lean: 0.04, back: 0.08, lunge: 0.09, strikeRot: 0.12, steps: 1.8 },
  warlord: { bob: 0.014, lean: 0.02, back: 0.06, lunge: 0.05, strikeRot: 0.08, steps: 1.3 },
} as const;

export class KitUnit {
  readonly root = new Container(); // placed and mirrored by the scene
  readonly height: number; // wu
  private pose = new Container(); // lean / lunge / knockback, pivots at the feet
  private sprite: Sprite;
  private white: Sprite;
  private shadow: Graphics;
  private scale: number; // wu per texture pixel
  private muzzlePx: [number, number] | null;
  private anchorPx: [number, number];
  private t = 0; // ms of animation time
  private walkPhase: number;
  private attack: { start: number; impact: number; struckAt: number } | null = null;
  private flash = 0; // ms left of the hit flash
  private flashAt = -1e9; // when the last flash began (a mobbed unit must not stay white)
  private knock = 0; // wu pushed back, decays
  private knockV = 0;
  private spawnAt = -1;
  private cheering = false;
  private debris: Debris[] = [];
  private debrisNames: string[];
  /** How this troop's close attack looks (a swing, or a point-blank shot from the muzzle). */
  readonly strike: 'swing' | 'shot';
  dying = -1; // ms since death; -1 alive

  constructor(private kit: Kit, readonly role: Role, readonly side: Side, readonly seed: number) {
    const entry = unitEntry(kit.manifest, role, factionOf(side));
    const f = kit.manifest.frames[entry.frame]!;
    const variety = role === 'warlord' ? 1 : 0.97 + ((seed * 31) % 7) / 100; // render-only size variety
    this.height = ROLE_HEIGHT[role] * variety;
    this.scale = this.height / (f.nominalH ?? f.h);
    this.anchorPx = [f.ax, f.ay];
    this.muzzlePx = f.muzzle ?? null;
    this.debrisNames = entry.debris;
    this.strike = entry.strike ?? 'swing';
    this.walkPhase = (seed * 0.618) % 1;

    const halfW = Math.min(f.w * 0.22, f.ax, f.w - f.ax) * this.scale;
    this.shadow = new Graphics().ellipse(0, 0, Math.max(30, halfW * 1.1), this.height * 0.045).fill({ color: 0x05030f, alpha: 0.45 });
    this.sprite = new Sprite(kit.frame(entry.frame));
    this.white = new Sprite(kit.frame(entry.white));
    for (const s of [this.sprite, this.white]) {
      s.anchor.set(f.ax / f.w, f.ay / f.h);
      s.scale.set(this.scale);
    }
    this.white.alpha = 0;
    this.pose.addChild(this.sprite, this.white);
    this.root.addChild(this.shadow, this.pose);
  }

  // ------------------------------------------------------------------------------------------------------- events
  onSpawn() {
    this.spawnAt = this.t;
  }

  onAttackStart(tick: number, impactTick: number) {
    this.attack = { start: tick, impact: impactTick, struckAt: -1 };
  }

  onHit(heavy: boolean) {
    const gap = this.role === 'warlord' || this.role === 'tank' ? 420 : 220; // big units are hit by many: flash less often
    if (this.t - this.flashAt > gap) {
      this.flash = 110;
      this.flashAt = this.t;
    }
    this.knockV -= (heavy ? 0.9 : 0.5) * this.height * (this.role === 'warlord' ? 0.15 : this.role === 'tank' ? 0.4 : 1);
  }

  onDeath() {
    if (this.dying >= 0) return;
    this.dying = 0;
    this.flash = 0;
    // the weapon (and shield) fly off: seeded so a replay looks the same
    this.debrisNames.forEach((name, i) => {
      const f = this.kit.manifest.frames[name]!;
      const s = new Sprite(this.kit.frame(name));
      s.anchor.set(f.ax / f.w, f.ay / f.h);
      s.scale.set(this.scale);
      s.position.set(this.height * (0.15 - i * 0.2), -this.height * 0.5);
      this.root.addChild(s);
      const r = ((this.seed * 7 + i * 13) % 10) / 10;
      this.debris.push({ s, vx: this.height * (0.6 + r * 0.8) * (i % 2 ? -1 : 1), vy: -this.height * (2.2 + r), spin: (i % 2 ? -1 : 1) * (7 + r * 6) });
    });
  }

  cheer() {
    this.cheering = true;
  }

  /** The muzzle / casting point in local wu (x forward, y up negative), for flashes and projectile origins. */
  muzzle(): { x: number; y: number } {
    const m = this.muzzlePx;
    if (!m) return { x: this.height * 0.25, y: -this.height * 0.55 };
    return { x: (m[0] - this.anchorPx[0]) * this.scale, y: (m[1] - this.anchorPx[1]) * this.scale };
  }

  get done() {
    return this.dying > 1000;
  }

  // ------------------------------------------------------------------------------------------------------- frame
  /**
   * @param dt    ms of animation this frame (0 while paused; scaled by the battle speed)
   * @param state the unit's sim state
   * @param tick  continuous sim time in ticks
   * @param speed walk speed in wu/s
   */
  update(dt: number, state: UnitState, tick: number, speed: number) {
    this.t += dt;
    const s = dt / 1000;
    const H = this.height;
    const M = MOTION[this.role];

    // hit flash: full white for 60 ms, then fades
    this.flash = Math.max(0, this.flash - dt);
    const peak = this.role === 'warlord' ? 0.35 : this.role === 'tank' ? 0.6 : 0.9;
    this.white.alpha = this.flash > 50 ? peak : (this.flash / 50) * peak;
    this.white.visible = this.white.alpha > 0; // an invisible overlay still costs a draw
    // knockback spring back to rest
    // (sub-stepped: a slow frame must never make the spring blow up)
    for (let rem = s; rem > 0; rem -= 1 / 60) {
      const h = Math.min(rem, 1 / 60);
      this.knockV += (-160 * this.knock - 16 * this.knockV) * h;
      this.knock += this.knockV * h;
    }

    let x = this.knock;
    let y = 0;
    let rot = 0;
    let sx = 1;
    let sy = 1;

    if (this.dying >= 0) {
      this.updateDeath(dt);
      return;
    }

    if (state === 'walk') {
      // stepped cadence: the bob snaps to 4 poses per step, like a hand-drawn walk
      this.walkPhase += s * Math.max(1.2, Math.min(3, speed / 40)) * (M.steps / 2.4);
      const step = this.walkPhase * 2;
      const q = Math.floor(step * 4) / 4;
      const b = Math.abs(Math.sin(q * Math.PI));
      y -= b * M.bob * H;
      rot += M.lean + Math.sin(q * Math.PI) * 0.025 * (this.role === 'warlord' ? 0.5 : 1);
      const contact = 1 - b;
      sy *= 1 - contact * 0.035;
      sx *= 1 + contact * 0.025;
    } else {
      const br = Math.sin((this.t / 1400) * Math.PI * 2 + this.seed);
      sy *= 1 + br * 0.012;
    }

    // attack: anticipation (lean back) → strike at the impact tick → recover
    const a = this.attack;
    if (a) {
      const win = Math.max(1, a.impact - a.start);
      if (tick < a.impact) {
        const f = easeOut((tick - a.start) / win);
        rot -= M.back * 1.2 * f;
        x -= M.back * 0.35 * H * f;
        if (this.role === 'warlord') y -= 0.03 * H * f; // the beast rears
        if (this.role === 'ranged') sy *= 1 + 0.02 * f;
      } else {
        if (a.struckAt < 0) a.struckAt = this.t;
        const since = this.t - a.struckAt;
        if (since < 70) {
          const f = easeOut(since / 70);
          rot += lerp(-M.back * 1.2, M.strikeRot, f);
          x += lerp(-M.back * 0.35 * H, M.lunge * H, f);
          if (this.role === 'warlord') sy *= 1 - 0.05 * f;
        } else if (since < 330) {
          const f = easeOut((since - 70) / 260);
          rot += lerp(M.strikeRot, 0, f);
          x += lerp(M.lunge * H, 0, f);
          if (this.role === 'warlord') sy *= 1 - 0.05 * (1 - f);
        } else this.attack = null;
      }
    }

    // spawn: drop in and squash on landing
    if (this.spawnAt >= 0) {
      const f = (this.t - this.spawnAt) / 220;
      if (f < 1) y -= 0.14 * H * (1 - easeIn(f));
      else if (f < 2) {
        const g = Math.sin((f - 1) * Math.PI) * (2 - f);
        sy *= 1 - 0.1 * g;
        sx *= 1 + 0.08 * g;
      } else this.spawnAt = -1;
    }

    if (this.cheering) {
      const j = Math.abs(Math.sin((this.t / 520) * Math.PI + this.seed));
      y -= j * 0.12 * H;
      rot = -0.04 + Math.sin(this.t / 260) * 0.03;
    }

    this.pose.position.set(x, y);
    this.pose.rotation = rot;
    this.pose.scale.set(sx, sy);
    this.shadow.scale.set(1 - Math.min(0.4, -y / H));
  }

  private updateDeath(dt: number) {
    this.dying += dt;
    const t = this.dying;
    const H = this.height;
    const big = this.role === 'warlord' || this.role === 'tank';
    // fall backwards around the feet, slide a touch, then fade
    const f = clamp01(t / (big ? 620 : 420));
    this.pose.rotation = -(big ? 0.5 : 1.3) * easeIn(f);
    this.pose.position.set(-0.12 * H * easeOut(f) + this.knock, big ? 0.1 * H * easeIn(f) : 0);
    this.pose.scale.set(1, 1);
    const fade = big ? 650 : 480;
    const a = t < fade ? 1 : Math.max(0, 1 - (t - fade) / 350);
    this.pose.alpha = a;
    this.shadow.alpha = Math.max(0, 1 - t / 500);
    const s = dt / 1000;
    for (const d of this.debris) {
      d.vy += H * 7 * s;
      d.s.x += d.vx * s;
      d.s.y = Math.min(-H * 0.04, d.s.y + d.vy * s);
      d.s.rotation += d.spin * s;
      d.s.alpha = a;
    }
  }

  destroy() {
    this.root.destroy({ children: true });
  }
}
