import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { BattleSnapshot, Role, Side, SimEvent, UnitView } from '../../contracts';
import { TICKS_PER_SECOND } from '../../contracts';
import type { BattleSession } from '../../app/battleController';
import { font } from '../../ui/style/tokens';
import { makeCamera, rankSpread, type Camera } from '../pixi/camera';
import type { PixiHost } from '../pixi/app';
import { HEIGHT, INK, STONE, drawBase, drawFigure, drawLeg, sideColors } from './stoneArt';

/**
 * The lane: background, both bases, troops, projectiles and effects (slice 1C placeholders). It reads snapshots and
 * events from a BattleSession and never writes to the sim. Without a session it is the Hub diorama: the same
 * world with a few of your troops idling by your base.
 */

interface UnitSprite {
  id: number;
  side: Side;
  role: Role;
  root: Container;
  body: Container;
  flash: Graphics;
  legA: Graphics;
  legB: Graphics;
  hp: Graphics;
  phase: number;
  attackFrom: number; // tick the current windup began
  impactTick: number;
  flashUntil: number; // ms
  lungeUntil: number; // ms
  dying: number; // ms since death, -1 alive
  lastX: number;
  /** Eased rank offset and depth, so a unit never jumps sideways when the crowd around it changes. */
  sdx: number;
  sdepth: number;
  hpFrac: number;
}

interface Proj {
  g: Graphics;
  fromX: number;
  toX: number;
  target: number | 'base';
  fire: number; // tick
  arrive: number;
  arc: number;
  side: Side;
}

interface Particle {
  g: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  gravity: number;
  spin: number;
  fade: boolean;
}

interface Num {
  t: Text;
  x: number;
  y: number;
  age: number;
  target: number | 'base';
  value: number;
  bornAt: number;
}

const SPEED_BOB = 1.7; // walk cycles per second

export interface SceneOptions {
  /** Screen y (CSS px) where the bottom UI begins; the ground sits a band above it. */
  uiTop: () => number;
  reduceMotion: () => boolean;
  damageNumbers: () => boolean;
}

export class BattleScene {
  readonly root = new Container();
  private sky = new Sprite();
  private far = new Graphics();
  private mid = new Graphics();
  private ground = new Graphics();
  private bases = { player: new Container(), enemy: new Container() };
  private baseArt = { player: new Graphics(), enemy: new Graphics() };
  private baseFlash = { player: 0, enemy: 0 };
  private ward = new Graphics();
  private lane = new Container();
  private unitsLayer = new Container();
  private fxLayer = new Container();
  private overlay = new Graphics();
  private units = new Map<number, UnitSprite>();
  private projs = new Map<number, Proj>();
  private particles: Particle[] = [];
  private numbers: Num[] = [];
  private markers: { g: Graphics; until: number; kind: 'slam' | 'storm'; born: number }[] = [];
  private cam: Camera;
  private session: BattleSession | null = null;
  private off: (() => void)[] = [];
  private time = 0; // ms, presentation clock
  private trauma = 0;
  private flashWhite = 0;
  private stormLevel = 0;
  private warded = false;
  private bolts: { g: Graphics; until: number }[] = [];
  private idle: UnitSprite[] = [];
  private animDt = 0; // seconds of animation this frame (0 while paused)
  private ease = 1; // per-frame easing factor for rank offsets

  constructor(private host: PixiHost, private opts: SceneOptions) {
    this.cam = makeCamera({ w: host.width, h: host.height, uiTop: opts.uiTop() });
    this.unitsLayer.sortableChildren = true;
    this.root.addChild(this.sky, this.far, this.mid, this.ground, this.lane);
    this.lane.addChild(this.bases.player, this.bases.enemy, this.ward, this.unitsLayer, this.fxLayer);
    this.root.addChild(this.overlay);
    this.bases.player.addChild(this.baseArt.player);
    this.bases.enemy.addChild(this.baseArt.enemy);
    drawBase(this.baseArt.player, 'player');
    drawBase(this.baseArt.enemy, 'enemy');
    host.world.addChild(this.root);
    this.off.push(host.onResize(() => this.layout()));
    this.layout();
  }

  attach(session: BattleSession | null) {
    for (const f of this.off.splice(1)) f();
    this.clearUnits();
    this.session = session;
    this.warded = !!session?.curr.enemyBase.warded;
    this.stormLevel = 0;
    if (session) {
      this.off.push(session.onEvents((ev, tick) => this.onEvents(ev, tick)));
    } else {
      this.spawnIdle();
    }
    this.redrawWard();
  }

  destroy() {
    for (const f of this.off) f();
    this.root.destroy({ children: true, context: true });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Layout

  layout() {
    const w = this.host.width;
    const h = this.host.height;
    this.cam = makeCamera({ w, h, uiTop: this.opts.uiTop() });
    const k = this.cam.ptPerWu;
    const gy = this.cam.groundY;
    this.sky.texture = skyTexture(STONE.skyTop, STONE.skyHorizon, STONE.sunGlow);
    this.sky.width = w;
    this.sky.height = gy + 4;
    // far hills, mid hills and the ground band are drawn in screen space and tile across any width
    this.far.clear();
    const farY = gy - 210 * k;
    this.far.moveTo(0, gy);
    for (let x = 0; x <= w + 40; x += 40) this.far.lineTo(x, farY - Math.sin(x * 0.012 + 1.3) * 34 * k - Math.sin(x * 0.031) * 14 * k);
    this.far.lineTo(w, gy).fill(STONE.far);
    this.mid.clear();
    const midY = gy - 96 * k;
    this.mid.moveTo(0, gy);
    for (let x = 0; x <= w + 30; x += 30) this.mid.lineTo(x, midY - Math.sin(x * 0.02 + 0.4) * 26 * k - Math.cos(x * 0.047) * 9 * k);
    this.mid.lineTo(w, gy).fill(STONE.mid);
    this.ground.clear();
    this.ground.rect(0, gy - 8 * k, w, h - gy + 8 * k).fill(STONE.near);
    this.ground.rect(0, gy - 34 * k, w, 48 * k).fill(STONE.lane);
    this.ground.rect(0, gy + 6 * k, w, 8 * k).fill(STONE.laneDark);
    // tufts along the lane edge
    for (let x = 6; x < w; x += 58) this.ground.poly([x, gy + 14 * k, x + 8, gy - 8 * k + 14 * k, x + 16, gy + 14 * k]).fill(STONE.fgProp);
    this.bases.player.position.set(this.cam.sx(0), gy);
    this.bases.player.scale.set(k);
    this.bases.enemy.position.set(this.cam.sx(1000), gy);
    this.bases.enemy.scale.set(-k, k);
    this.redrawWard();
  }

  private redrawWard() {
    this.ward.clear();
    if (!this.warded) return;
    const k = this.cam.ptPerWu;
    const cx = this.cam.sx(1130);
    const gy = this.cam.groundY;
    this.ward.ellipse(cx, gy - 10 * k, 170 * k, 330 * k).fill({ color: 0x8b5cf6, alpha: 0.16 });
    this.ward.ellipse(cx, gy - 10 * k, 170 * k, 330 * k).stroke({ width: 3, color: 0xb79cff, alpha: 0.85 });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Units

  private makeUnit(id: number, side: Side, role: Role): UnitSprite {
    const root = new Container();
    const body = new Container();
    const legA = new Graphics();
    const legB = new Graphics();
    const hpH = role === 'warlord' ? 0 : 1;
    drawLeg(legA, role);
    drawLeg(legB, role);
    const fig = new Graphics();
    drawFigure(fig, { side, role, variant: id });
    const flash = new Graphics();
    drawFigure(flash, { side, role, variant: id, white: true });
    flash.alpha = 0;
    const shadow = new Graphics().ellipse(0, 0, role === 'warlord' ? 160 : role === 'tank' ? 54 : 40, 10).fill({ color: STONE.shadow, alpha: 0.28 });
    const legOff = role === 'warlord' ? 60 : role === 'tank' ? 16 : 11;
    const legY = role === 'warlord' ? -70 : role === 'tank' ? -34 : -30;
    legA.position.set(-legOff, legY);
    legB.position.set(legOff, legY);
    if (role !== 'warlord') body.addChild(legB);
    body.addChild(fig);
    if (role !== 'warlord') body.addChild(legA);
    body.addChild(flash);
    const hp = new Graphics();
    hp.visible = !!hpH;
    root.addChild(shadow, body, hp);
    this.unitsLayer.addChild(root);
    return { id, side, role, root, body, flash, legA, legB, hp, phase: 0, attackFrom: -1, impactTick: -1, flashUntil: 0, lungeUntil: 0, dying: -1, lastX: 0, hpFrac: 1, sdx: Number.NaN, sdepth: 0 };
  }

  private clearUnits() {
    for (const u of this.units.values()) u.root.destroy({ children: true, context: true });
    for (const u of this.idle) u.root.destroy({ children: true, context: true });
    for (const p of this.projs.values()) p.g.destroy({ context: true });
    for (const p of this.particles) p.g.destroy({ context: true });
    for (const n of this.numbers) n.t.destroy();
    for (const m of this.markers) m.g.destroy({ context: true });
    for (const b of this.bolts) b.g.destroy({ context: true });
    this.units.clear();
    this.projs.clear();
    this.idle = [];
    this.particles = [];
    this.numbers = [];
    this.markers = [];
    this.bolts = [];
  }

  private spawnIdle() {
    const roles: Role[] = ['melee', 'ranged', 'melee'];
    roles.forEach((r, i) => {
      const u = this.makeUnit(9000 + i, 'player', r);
      u.lastX = 90 + i * 70;
      this.idle.push(u);
    });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Events

  private onEvents(events: readonly SimEvent[], tick: number) {
    const rm = this.opts.reduceMotion();
    for (const e of events) {
      switch (e.kind) {
        case 'spawn': {
          const u = this.makeUnit(e.id, e.side, this.session?.curr.units.find((x) => x.id === e.id)?.role ?? 'melee');
          u.lastX = e.x;
          this.units.set(e.id, u);
          this.ring(e.x, e.side === 'player' ? 0x7db8ff : 0xff9a84);
          break;
        }
        case 'attackStart': {
          const u = this.units.get(e.id);
          if (u) {
            u.attackFrom = tick;
            u.impactTick = e.impactTick;
          }
          break;
        }
        case 'slamTelegraph': {
          const g = new Graphics();
          this.fxLayer.addChild(g);
          this.markers.push({ g, until: e.impactTick, kind: 'slam', born: tick });
          (g as Graphics & { wx?: number; wr?: number }).wx = e.x;
          (g as Graphics & { wx?: number; wr?: number }).wr = e.radius;
          break;
        }
        case 'projectile': {
          const g = new Graphics();
          const pebble = e.style === 'pebble';
          g.circle(0, 0, pebble ? 9 : 7).fill(pebble ? 0x9aa3b5 : 0xf7f9fc).stroke({ width: 4, color: INK });
          this.fxLayer.addChild(g);
          const side: Side = this.session?.curr.units.find((x) => x.id === e.id)?.side ?? 'player';
          this.projs.set(e.projId, { g, fromX: e.from, toX: e.toX, target: e.to, fire: tick, arrive: e.arriveTick, arc: pebble ? 70 : 30, side });
          break;
        }
        case 'projectileEnd': {
          const p = this.projs.get(e.projId);
          if (p) {
            p.g.destroy({ context: true });
            this.projs.delete(e.projId);
          }
          if (e.result === 'fizzle') this.puff(e.x, 8, 0xdce3ef, 3);
          if (e.result === 'explode') this.puff(e.x, 26, 0xffcf3d, 10);
          break;
        }
        case 'hit': {
          if (e.targetId === 'base') {
            this.baseFlash[e.targetSide] = this.time + 90;
            if (e.blocked === 'ward') {
              this.spark(1000, 120, 0xb79cff, 5);
              break;
            }
            const x = e.targetSide === 'enemy' ? 1000 + 40 : -40;
            this.spark(x, 90 + ((e.sourceId * 37) % 80), 0xffffff, 4);
            if (e.targetSide === 'player') this.shake(e.heavy ? 0.22 : 0.08);
            if (e.targetSide === 'enemy') this.number('base', x, 200, e.amount);
            break;
          }
          const u = this.units.get(e.targetId);
          if (!u) break;
          u.flashUntil = this.time + 80;
          const src = this.units.get(e.sourceId);
          if (src && e.projId === undefined) src.lungeUntil = this.time + 110;
          this.spark(u.lastX, HEIGHT[u.role] * 0.55, e.heavy ? 0xffcf3d : 0xffffff, e.heavy ? 7 : 4);
          if (e.heavy && !rm) this.shake(u.role === 'warlord' ? 0.12 : 0.05);
          if (e.targetSide === 'enemy') this.number(e.targetId, u.lastX, HEIGHT[u.role] + 20, e.amount);
          break;
        }
        case 'death': {
          const u = this.units.get(e.id);
          if (u) {
            u.dying = 0;
            u.hp.visible = false;
          }
          this.puff(e.x, 30, 0xf7f9fc, 9);
          if (e.gold > 0) this.coins(e.x, Math.min(5, e.gold));
          if (u?.role === 'warlord' || u?.role === 'tank') this.shake(0.3);
          break;
        }
        case 'baseChunk':
          if (e.source === 'base') this.coins(1000 + 60, Math.min(3, e.gold));
          break;
        case 'wardBroken':
          this.warded = false;
          this.redrawWard();
          this.puff(1130, 200, 0xb79cff, 18);
          this.shake(0.4);
          if (!rm) this.session?.hitStop(80);
          break;
        case 'warlordIntro':
          this.shake(0.35);
          break;
        case 'stormRising':
          this.stormLevel = e.level;
          break;
        case 'stormcallCast': {
          const g = new Graphics();
          this.fxLayer.addChild(g);
          this.markers.push({ g, until: e.strikeTick, kind: 'storm', born: tick });
          (g as Graphics & { wx?: number; wr?: number }).wx = e.x;
          (g as Graphics & { wx?: number; wr?: number }).wr = e.radius;
          break;
        }
        case 'stormcallStrike':
          this.bolt(e.x);
          this.flashWhite = rm ? 0 : 0.55;
          this.shake(0.55);
          if (!rm) this.session?.hitStop(70);
          this.puff(e.x, 40, 0xc9b6ff, 16);
          break;
        case 'end': {
          const loser: Side = e.result === 'victory' ? 'enemy' : 'player';
          const x = loser === 'enemy' ? 1130 : -130;
          for (let i = 0; i < 4; i++) this.puff(x + (i - 1.5) * 60, 60 + i * 40, 0xdce3ef, 10);
          this.shake(0.7);
          if (!rm && e.result === 'victory') {
            this.session?.hitStop(120);
            this.session?.slowMo(900, 0.3);
          }
          break;
        }
        default:
          break;
      }
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Per-frame draw

  draw(dtMs: number) {
    const s = this.session;
    if (s?.paused) dtMs = 0; // the whole world holds still under the pause sheet
    this.time += dtMs;
    this.ease = 1 - Math.exp(-(dtMs / 1000) * 9);
    this.animDt = (dtMs / 1000) * (s?.speed ?? 1);
    const k = this.cam.ptPerWu;
    const gy = this.cam.groundY;
    const sx = (x: number) => this.cam.sx(x);
    const rm = this.opts.reduceMotion();

    if (s) {
      const tickTime = s.curr.tick - 1 + s.alpha;
      const prevById = new Map(s.prev.units.map((u) => [u.id, u] as const));
      const spread = rankSpread(s.curr.units);
      for (const v of s.curr.units) {
        let u = this.units.get(v.id);
        if (!u) {
          u = this.makeUnit(v.id, v.side, v.role);
          this.units.set(v.id, u);
        }
        const p = prevById.get(v.id);
        const x = p ? p.x + (v.x - p.x) * s.alpha : v.x;
        u.lastX = x;
        this.placeUnit(u, v, x, spread.get(v.id), tickTime);
      }
      // units the sim no longer has: play out their death, then remove
      for (const [id, u] of this.units) {
        if (s.curr.units.some((v) => v.id === id)) continue;
        if (u.dying < 0) u.dying = 0;
        u.dying += dtMs;
        const t = Math.min(1, u.dying / 420);
        u.body.rotation = (u.side === 'player' ? -1 : 1) * t * 1.35;
        u.root.alpha = 1 - t;
        if (t >= 1) {
          u.root.destroy({ children: true, context: true });
          this.units.delete(id);
        }
      }
      // projectiles
      for (const p of this.projs.values()) {
        const f = Math.max(0, Math.min(1, (tickTime - p.fire) / Math.max(1, p.arrive - p.fire)));
        let toX = p.toX;
        if (typeof p.target === 'number') {
          const t = this.units.get(p.target);
          if (t && t.dying < 0) toX = t.lastX;
        }
        const x = p.fromX + (toX - p.fromX) * f;
        const y = 70 + Math.sin(f * Math.PI) * p.arc;
        p.g.position.set(sx(x), gy - y * k);
        p.g.scale.set(Math.max(0.6, k * 2.2));
      }
      // markers (slam telegraph, Stormcall gather)
      this.markers = this.markers.filter((m) => {
        const wx = (m.g as Graphics & { wx?: number }).wx ?? 0;
        const wr = (m.g as Graphics & { wr?: number }).wr ?? 60;
        const f = Math.max(0, Math.min(1, (tickTime - m.born) / Math.max(1, m.until - m.born)));
        m.g.clear();
        const col = m.kind === 'slam' ? 0xf0533c : 0xb79cff;
        m.g.ellipse(sx(wx), gy, wr * k * (0.4 + 0.6 * f), 14 * k + 6).fill({ color: col, alpha: 0.18 + 0.2 * f });
        m.g.ellipse(sx(wx), gy, wr * k, 14 * k + 6).stroke({ width: 2.5, color: col, alpha: 0.9 });
        if (tickTime >= m.until) {
          m.g.destroy({ context: true });
          return false;
        }
        return true;
      });
      this.drawBaseState(s.curr);
    } else {
      // Hub diorama: troops idle and bob near your base
      this.idle.forEach((u, i) => {
        u.root.position.set(sx(u.lastX), gy + (i % 2 ? 6 : -4) * k);
        u.root.scale.set(k);
        u.root.zIndex = gy;
        u.body.y = -Math.abs(Math.sin(this.time / 900 + i)) * 4;
      });
    }

    // particles, numbers, bolts, shake, flash
    const dt = dtMs / 1000;
    this.particles = this.particles.filter((p) => {
      p.life += dtMs;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.g.position.set(sx(p.x), gy - p.y * k);
      p.g.rotation += p.spin * dt;
      p.g.scale.set(k * 2 * (p.fade ? 1 - p.life / p.max : 1) + 0.2);
      if (p.fade) p.g.alpha = Math.max(0, 1 - p.life / p.max);
      if (p.life >= p.max) {
        p.g.destroy({ context: true });
        return false;
      }
      return true;
    });
    this.numbers = this.numbers.filter((n) => {
      n.age += dtMs;
      const f = n.age / 750;
      n.t.position.set(sx(n.x), gy - (n.y + f * 60) * k);
      n.t.alpha = f < 0.7 ? 1 : Math.max(0, 1 - (f - 0.7) / 0.3);
      const pop = n.age < 120 ? 1.35 - (n.age / 120) * 0.35 : 1;
      n.t.scale.set(pop);
      if (f >= 1) {
        n.t.destroy();
        return false;
      }
      return true;
    });
    this.bolts = this.bolts.filter((b) => {
      b.g.alpha = Math.max(0, (b.until - this.time) / 180);
      if (this.time >= b.until) {
        b.g.destroy({ context: true });
        return false;
      }
      return true;
    });
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const shake = rm ? 0 : this.trauma * this.trauma * 14;
    this.lane.position.set((Math.sin(this.time * 0.09) + Math.sin(this.time * 0.053)) * shake * 0.5, Math.cos(this.time * 0.077) * shake * 0.5);
    this.overlay.clear();
    const dark = Math.min(0.32, this.stormLevel * 0.08);
    if (dark > 0) this.overlay.rect(0, 0, this.host.width, this.host.height).fill({ color: 0x141b33, alpha: dark });
    if (this.flashWhite > 0) {
      this.overlay.rect(0, 0, this.host.width, this.host.height).fill({ color: 0xffffff, alpha: this.flashWhite });
      this.flashWhite = Math.max(0, this.flashWhite - dt * 6);
    }
  }

  private placeUnit(u: UnitSprite, v: UnitView, x: number, spread: { dx: number; depth: number } | undefined, tickTime: number) {
    const k = this.cam.ptPerWu;
    const tdx = spread?.dx ?? 0;
    const depth = spread?.depth ?? 0;
    if (Number.isNaN(u.sdx)) {
      u.sdx = tdx;
      u.sdepth = depth;
    } else {
      u.sdx += (tdx - u.sdx) * this.ease;
      u.sdepth += (depth - u.sdepth) * this.ease;
    }
    const dx = u.sdx;
    const facing = u.side === 'player' ? 1 : -1;
    const lunge = this.time < u.lungeUntil ? 10 * facing : 0;
    u.root.position.set(this.cam.sx(x + dx + lunge), this.cam.groundY + u.sdepth * k * 0.35);
    u.root.scale.set(k * facing, k);
    u.root.zIndex = depth;
    // walk cycle vs windup lean
    if (v.state === 'walk') {
      u.phase += this.animDt * SPEED_BOB * Math.PI * 2;
      const swing = Math.sin(u.phase) * 0.45;
      u.legA.rotation = swing;
      u.legB.rotation = -swing;
      u.body.y = -Math.abs(Math.sin(u.phase)) * 7;
      u.body.rotation = 0;
    } else {
      u.legA.rotation *= 0.8;
      u.legB.rotation *= 0.8;
      u.body.y *= 0.7;
      if (v.state === 'windup' && u.impactTick > u.attackFrom) {
        const f = Math.max(0, Math.min(1, (tickTime - u.attackFrom) / (u.impactTick - u.attackFrom)));
        u.body.rotation = -0.22 * Math.sin(f * Math.PI * 0.5);
      } else u.body.rotation *= 0.6;
    }
    u.flash.alpha = this.time < u.flashUntil ? 0.85 : 0;
    // HP bar only once damaged
    const frac = v.hp / v.maxHp;
    if (u.role !== 'warlord' && frac < 0.999) {
      if (Math.abs(frac - u.hpFrac) > 0.001 || !u.hp.visible) {
        const c = sideColors(u.side);
        const w = u.role === 'tank' ? 78 : 60;
        const y = -HEIGHT[u.role] - 26;
        u.hp.clear();
        u.hp.roundRect(-w / 2, y, w, 13, 6.5).fill(0x2b3b66).stroke({ width: 4, color: INK });
        u.hp.roundRect(-w / 2 + 2, y + 2, Math.max(0, (w - 4) * frac), 9, 4.5).fill(c.base);
        u.hp.visible = true;
        u.hpFrac = frac;
      }
      u.hp.scale.x = 1; // the bar is not mirrored for the enemy: root is, so counter-flip
      u.hp.scale.x = u.side === 'enemy' ? -1 : 1;
    }
  }

  private drawBaseState(c: BattleSnapshot) {
    for (const side of ['player', 'enemy'] as const) {
      const b = side === 'player' ? c.playerBase : c.enemyBase;
      const frac = b.hp / b.maxHp;
      const root = this.bases[side];
      const k = this.cam.ptPerWu;
      root.rotation = frac < 0.33 ? (side === 'player' ? -0.03 : 0.03) : 0;
      root.y = this.cam.groundY + (frac <= 0 ? 40 * k : 0);
      this.baseArt[side].tint = this.time < this.baseFlash[side] ? 0xffd2c4 : frac < 0.15 ? 0xd9b0a0 : 0xffffff;
    }
    if (this.warded !== c.enemyBase.warded) {
      this.warded = c.enemyBase.warded;
      this.redrawWard();
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Effects (placeholder recipes; slice 1D replaces them with ART_BIBLE §5.11)

  private ring(x: number, color: number) {
    const g = new Graphics().ellipse(0, 0, 40, 10).stroke({ width: 5, color, alpha: 0.9 });
    this.fxLayer.addChild(g);
    this.particles.push({ g, x, y: 0, vx: 0, vy: 0, life: 0, max: 380, gravity: 0, spin: 0, fade: true });
  }

  private spark(x: number, y: number, color: number, n: number) {
    for (let i = 0; i < n; i++) {
      const g = new Graphics().poly([0, -6, 2, -2, 6, 0, 2, 2, 0, 6, -2, 2, -6, 0, -2, -2]).fill(color);
      this.fxLayer.addChild(g);
      const a = (i / n) * Math.PI * 2 + this.time;
      this.particles.push({ g, x, y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160 + 60, life: 0, max: 220, gravity: -300, spin: 8, fade: true });
    }
  }

  private puff(x: number, y: number, color: number, n: number) {
    for (let i = 0; i < n; i++) {
      const g = new Graphics().circle(0, 0, 9 + (i % 3) * 3).fill(color).stroke({ width: 3, color: INK, alpha: 0.5 });
      this.fxLayer.addChild(g);
      const a = (i / n) * Math.PI * 2;
      this.particles.push({ g, x, y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 60 + 40, life: 0, max: 480, gravity: -40, spin: 0, fade: true });
    }
  }

  private coins(x: number, n: number) {
    for (let i = 0; i < n; i++) {
      const g = new Graphics().circle(0, 0, 8).fill(0xffcf3d).stroke({ width: 3, color: INK });
      this.fxLayer.addChild(g);
      this.particles.push({ g, x: x + (i - n / 2) * 12, y: 80, vx: (i - n / 2) * 30, vy: 420 + i * 40, life: 0, max: 700, gravity: -1300, spin: 0, fade: false });
    }
  }

  private number(target: number | 'base', x: number, y: number, amount: number) {
    if (!this.opts.damageNumbers() || amount <= 0) return;
    // merge hits on the same target within 150 ms (GDD §2.14) and keep at most 12 alive
    const recent = this.numbers.find((n) => n.target === target && this.time - n.bornAt < 150);
    if (recent) {
      recent.value += amount;
      recent.t.text = String(recent.value);
      return;
    }
    if (this.numbers.length >= 12) {
      const old = this.numbers.shift()!;
      old.t.destroy();
    }
    const t = new Text({
      text: String(amount),
      style: { fontFamily: font.display, fontSize: 20, fill: 0xffffff, stroke: { color: INK, width: 5, join: 'round' } },
    });
    t.anchor.set(0.5);
    this.fxLayer.addChild(t);
    this.numbers.push({ t, x, y, age: 0, target, value: amount, bornAt: this.time });
  }

  private bolt(x: number) {
    const g = new Graphics();
    const sx = this.cam.sx(x);
    const gy = this.cam.groundY;
    const pts: number[] = [sx, 0];
    let cx = sx;
    for (let y = 40; y < gy; y += 46) {
      cx = sx + Math.sin(y * 0.37 + this.time) * 26;
      pts.push(cx, y);
    }
    pts.push(sx, gy);
    g.poly(pts, false).stroke({ width: 14, color: 0xb79cff, alpha: 0.6, join: 'round', cap: 'round' });
    g.poly(pts, false).stroke({ width: 5, color: 0xffffff, join: 'round', cap: 'round' });
    this.root.addChild(g);
    this.bolts.push({ g, until: this.time + 180 });
  }

  private shake(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Screen position of a world point, for DOM overlays (coin flights, coach marks). */
  toScreen(x: number, heightWu = 0) {
    return { x: this.cam.sx(x), y: this.cam.groundY - heightWu * this.cam.ptPerWu };
  }

  get seconds() {
    return this.session ? this.session.curr.tick / TICKS_PER_SECOND : 0;
  }
}

const skyCache = new Map<string, Texture>();
function skyTexture(top: string, horizon: string, glow: string): Texture {
  const key = top + horizon + glow;
  let t = skyCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(0.72, horizon);
  g.addColorStop(1, glow);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  t = Texture.from(c);
  skyCache.set(key, t);
  return t;
}
