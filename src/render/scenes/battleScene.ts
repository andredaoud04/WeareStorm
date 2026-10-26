import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { BattleSnapshot, Role, Side, SimEvent, UnitDefId, UnitView } from '../../contracts';
import { TICKS_PER_SECOND } from '../../contracts';
import type { BattleSession } from '../../app/battleController';
import { unitDef } from '../../data/units';
import { font } from '../../ui/style/tokens';
import { drawBackdrop, drawCloud, drawForeground, drawGround, volcanoOf, type Layout } from '../art/backgrounds';
import { BaseArt } from '../art/bases';
import { AGE_PALETTE } from '../art/palette';
import { RigLibrary, UnitArt, type DeathKind } from '../art/unitArt';
import { vfxInk, vfxTextures, type VfxName } from '../vfx/textures';
import { makeCamera, rankSpread, type Camera } from '../pixi/camera';
import type { PixiHost } from '../pixi/app';
import { HEIGHT, INK, STONE, drawFigure, drawLeg, sideColors } from './stoneArt';

/**
 * The lane: background, both bases, troops, projectiles and effects (slice 1C placeholders). It reads snapshots and
 * events from a BattleSession and never writes to the sim. Without a session it is the Hub diorama: the same
 * world with a few of your troops idling by your base.
 */

interface UnitSprite {
  id: number;
  side: Side;
  role: Role;
  def: UnitDefId;
  /** Final rigged art (Stone Age); null = slice 1C placeholder figure (Ages without art yet). */
  art: UnitArt | null;
  speed: number;
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
  hpFrac: number;
}

interface Proj {
  g: Container;
  fromX: number;
  toX: number;
  target: number | 'base';
  fire: number; // tick
  arrive: number;
  arc: number;
  side: Side;
}

interface Particle {
  g: Container;
  x: number; // wu along the lane
  y: number; // wu above the ground
  vx: number; // wu/s
  vy: number;
  life: number; // ms
  max: number;
  gravity: number; // wu/s² (negative pulls down)
  spin: number; // rad/s
  fade: boolean;
  s0: number; // scale at birth and at death
  s1: number;
  flip?: boolean; // coin spin: scale.x oscillates
  mirror?: number; // 1 or -1
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
  private backdrop = new Sprite();
  private clouds = new Container();
  private cloudSprites: { s: Sprite; v: number }[] = [];
  /** Ambient life behind the bases: volcano smoke and birds (presentation only). */
  private ambient = new Container();
  private smoke: { g: Graphics; age: number; x: number; y: number }[] = [];
  private nextSmoke = 0;
  private crater = { x: 0, y: 0, half: 0 };
  private birds: { g: Graphics; x: number; y: number; v: number; phase: number }[] = [];
  private groundSprite = new Sprite();
  private fore = new Sprite();
  private bases = { player: new Container(), enemy: new Container() };
  private baseArt: { player: BaseArt | null; enemy: BaseArt | null } = { player: null, enemy: null };
  private baseScale = 0;
  private lib = new RigLibrary();
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

  constructor(private host: PixiHost, private opts: SceneOptions) {
    this.cam = makeCamera({ w: host.width, h: host.height, uiTop: opts.uiTop() });
    this.unitsLayer.sortableChildren = true;
    this.root.addChild(this.backdrop, this.ambient, this.clouds, this.groundSprite, this.lane, this.fore);
    this.lane.addChild(this.bases.player, this.bases.enemy, this.ward, this.unitsLayer, this.fxLayer);
    this.root.addChild(this.overlay);
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
    this.root.destroy({ children: true });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Layout

  layout() {
    const w = this.host.width;
    const h = this.host.height;
    this.cam = makeCamera({ w, h, uiTop: this.opts.uiTop() });
    const k = this.cam.ptPerWu;
    const gy = this.cam.groundY;
    const res = Math.min(2, globalThis.devicePixelRatio || 1);
    // painted layers, drawn for this exact screen (ART_BIBLE §5.10: never stretched)
    const L: Layout = { w, h, groundY: gy, k };
    const pal = AGE_PALETTE.stone;
    replaceTexture(this.backdrop, paint(w, gy + 40 * k, res, (c) => drawBackdrop(c, L, pal)), w, gy + 40 * k);
    replaceTexture(this.groundSprite, paint(w, h, res, (c) => drawGround(c, L, pal)), w, h);
    replaceTexture(this.fore, paint(w, h, res, (c) => drawForeground(c, L, pal)), w, h);
    this.layoutClouds(w, gy, k, res);
    const v = volcanoOf(L);
    this.crater = { x: v.x, y: v.craterY, half: v.craterHalf };
    if (!this.birds.length) {
      for (let i = 0; i < 3; i++) {
        const g = new Graphics();
        this.ambient.addChild(g);
        this.birds.push({ g, x: -40 - i * 70, y: gy * (0.18 + i * 0.07), v: 26 + i * 6, phase: i * 1.7 });
      }
    }
    // rigs and bases bake at the exact on-screen scale (px per wu)
    const bake = k * res;
    this.lib.setScale(bake);
    if (!this.baseScale || Math.abs(bake - this.baseScale) / this.baseScale > 0.15) {
      this.baseScale = bake;
      for (const side of ['player', 'enemy'] as const) {
        this.baseArt[side]?.destroy();
        const b = new BaseArt(side, bake);
        this.baseArt[side] = b;
        this.bases[side].addChild(b.root);
      }
    }
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

  private updateAmbient(dtMs: number) {
    const dt = dtMs / 1000;
    // volcano smoke: puffs rise, swell and fade
    this.nextSmoke -= dtMs;
    if (this.nextSmoke <= 0) {
      this.nextSmoke = 520;
      const g = new Graphics().circle(0, 0, 10).fill({ color: 0xe6e1ea });
      this.ambient.addChild(g);
      this.smoke.push({ g, age: 0, x: this.crater.x + (Math.sin(this.time) * this.crater.half) / 2, y: this.crater.y });
    }
    this.smoke = this.smoke.filter((p) => {
      p.age += dt;
      p.y -= dt * 14;
      p.x += dt * 9;
      const s = (0.5 + p.age * 0.45) * Math.max(0.6, this.crater.half / 12);
      p.g.position.set(p.x, p.y);
      p.g.scale.set(s);
      p.g.alpha = Math.max(0, 0.75 - p.age / 6);
      if (p.age > 4.5) {
        p.g.destroy();
        return false;
      }
      return true;
    });
    // birds: a lazy V-formation that crosses the sky now and then
    for (const b of this.birds) {
      b.x += b.v * dt;
      b.phase += dt * 7;
      if (b.x > this.host.width + 60) b.x = -60 - Math.random() * 400;
      const f = Math.sin(b.phase) * 4;
      b.g.clear();
      b.g.moveTo(-7, f).quadraticCurveTo(-3, -2, 0, 1).quadraticCurveTo(3, -2, 7, f).stroke({ width: 2, color: 0x3b3550, alpha: 0.7, cap: 'round', join: 'round' });
      b.g.position.set(b.x, b.y + Math.sin(b.phase * 0.15) * 3);
    }
  }

  private layoutClouds(w: number, gy: number, k: number, res: number) {
    for (const c of this.cloudSprites) c.s.destroy({ texture: true });
    this.cloudSprites = [];
    const n = Math.max(3, Math.round(w / 160));
    for (let i = 0; i < n; i++) {
      const cw = (260 + ((i * 97) % 180)) * k * 1.6;
      const ch = cw * 0.42;
      const s = new Sprite(paint(cw, ch, res, (c) => drawCloud(c, cw, ch, AGE_PALETTE.stone, 300 + i)));
      s.setSize(cw, ch);
      s.position.set((i / n) * (w + cw) - cw * 0.5, gy * (0.08 + ((i * 37) % 30) / 100));
      s.alpha = 0.92;
      this.clouds.addChild(s);
      this.cloudSprites.push({ s, v: 4 + ((i * 13) % 7) });
    }
  }

  private makeUnit(id: number, side: Side, role: Role, def: UnitDefId = ''): UnitSprite {
    if (this.lib.has(def)) {
      const root = new Container();
      const art = new UnitArt(this.lib, def, side, id);
      const r = role === 'warlord' ? 150 : role === 'tank' ? 54 : 40;
      const shadow = new Graphics().ellipse(0, 0, r, r * 0.2).fill({ color: STONE.shadow, alpha: 0.26 });
      const hp = new Graphics();
      hp.visible = false;
      root.addChild(shadow, art.root, hp);
      this.unitsLayer.addChild(root);
      const flash = new Graphics();
      return { id, side, role, def, art, speed: unitDef(def).speed, root, body: art.root, flash, legA: flash, legB: flash, hp, phase: 0, attackFrom: -1, impactTick: -1, flashUntil: 0, lungeUntil: 0, dying: -1, lastX: 0, hpFrac: 1 };
    }
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
    return { id, side, role, def, art: null, speed: 0, root, body, flash, legA, legB, hp, phase: 0, attackFrom: -1, impactTick: -1, flashUntil: 0, lungeUntil: 0, dying: -1, lastX: 0, hpFrac: 1 };
  }

  private clearUnits() {
    for (const u of this.units.values()) u.root.destroy({ children: true });
    for (const u of this.idle) u.root.destroy({ children: true });
    for (const p of this.projs.values()) p.g.destroy();
    for (const p of this.particles) p.g.destroy();
    for (const n of this.numbers) n.t.destroy();
    for (const m of this.markers) m.g.destroy();
    for (const b of this.bolts) b.g.destroy();
    this.units.clear();
    this.projs.clear();
    this.idle = [];
    this.particles = [];
    this.numbers = [];
    this.markers = [];
    this.bolts = [];
  }

  private spawnIdle() {
    const roles: [Role, UnitDefId][] = [['melee', 'stone.clubber'], ['ranged', 'stone.slinger'], ['melee', 'stone.clubber']];
    roles.forEach(([r, def], i) => {
      const u = this.makeUnit(9000 + i, 'player', r, def);
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
          const u = this.makeUnit(e.id, e.side, unitDef(e.def).role, e.def);
          u.lastX = e.x;
          u.art?.onSpawn();
          this.units.set(e.id, u);
          this.ring(e.x, e.side === 'player' ? 0x7db8ff : 0xff9a84);
          break;
        }
        case 'attackStart': {
          const u = this.units.get(e.id);
          if (u) {
            u.attackFrom = tick;
            u.impactTick = e.impactTick;
            u.art?.onAttackStart(tick, e.impactTick);
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
          const pebble = e.style === 'pebble';
          const pp = this.fx('pebble', e.from, 70, { max: 1e9, fade: false, s0: pebble ? 1 : 0.8, s1: pebble ? 1 : 0.8 });
          this.particles.splice(this.particles.indexOf(pp), 1); // driven by the projectile loop instead
          const g = pp.g;
          const side: Side = this.session?.curr.units.find((x) => x.id === e.id)?.side ?? 'player';
          this.projs.set(e.projId, { g, fromX: e.from, toX: e.toX, target: e.to, fire: tick, arrive: e.arriveTick, arc: pebble ? 70 : 30, side });
          break;
        }
        case 'projectileEnd': {
          const p = this.projs.get(e.projId);
          if (p) {
            p.g.destroy();
            this.projs.delete(e.projId);
          }
          if (e.result === 'fizzle') this.puff(e.x, 8, 3, true);
          if (e.result === 'explode') {
            this.spark(e.x, 26, true);
            this.puff(e.x, 26, 10, true);
          }
          break;
        }
        case 'hit': {
          if (e.targetId === 'base') {
            this.baseArt[e.targetSide]?.hit();
            if (e.blocked === 'ward') {
              this.fx('spark', 1000, 120, { tint: 0xb79cff, max: 180, s0: 0.6, s1: 1.1 }); // ward 'ting'
              break;
            }
            const x = e.targetSide === 'enemy' ? 1000 + 40 : -40;
            this.spark(x, 90 + ((e.sourceId * 37) % 80), e.heavy);
            if (e.heavy) this.puff(x, 60, 3, true);
            if (e.targetSide === 'player') this.shake(e.heavy ? 0.22 : 0.08);
            if (e.targetSide === 'enemy') this.number('base', x, 200, e.amount);
            break;
          }
          const u = this.units.get(e.targetId);
          if (!u) break;
          u.flashUntil = this.time + 80;
          u.art?.onHit(e.heavy);
          const src = this.units.get(e.sourceId);
          if (src && e.projId === undefined) src.lungeUntil = this.time + 110;
          this.spark(u.lastX + (u.side === 'player' ? 10 : -10), HEIGHT[u.role] * 0.55, e.heavy);
          if (src && e.projId === undefined && src.art && src.role !== 'ranged') {
            // melee smear arc on the striking side (2 frames)
            const dir = src.side === 'player' ? 1 : -1;
            this.fx('smear', src.lastX + dir * 50, HEIGHT[src.role] * 0.6, { ink: false, max: 90, s0: 1, s1: 1.1, mirror: dir, tint: 0xfffbe8 });
          }
          if (e.heavy && !rm) this.shake(u.role === 'warlord' ? 0.12 : 0.05);
          if (e.targetSide === 'enemy') this.number(e.targetId, u.lastX, HEIGHT[u.role] + 20, e.amount);
          break;
        }
        case 'death': {
          const u = this.units.get(e.id);
          if (u) {
            u.dying = 0;
            u.hp.visible = false;
            const kind: DeathKind = u.role === 'tank' || u.role === 'warlord' ? 'break' : (u.id * 7) % 10 < 6 ? 'launch' : 'topple';
            u.art?.onDeath(kind);
          }
          this.puff(e.x, 30, 7);
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
          for (let i = 0; i < 12; i++) this.fx('spark', 1130 + Math.cos(i) * 120, 200 + Math.sin(i) * 160, { tint: 0xc9b6ff, vy: 120, max: 520, s0: 0.8, s1: 0.2, spin: 6 });
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
          this.puff(e.x, 30, 10, true);
          this.fx('scorch', e.x, 0, { ink: false, max: 2400, s0: 1.4, s1: 1.5 }).g.alpha = 0.6;
          break;
        case 'end': {
          const loser: Side = e.result === 'victory' ? 'enemy' : 'player';
          this.baseArt[loser]?.startCollapse();
          if (e.result === 'victory') for (const u of this.units.values()) if (u.side === 'player' && u.dying < 0) u.art?.cheer();
          const x = loser === 'enemy' ? 1130 : -130;
          for (let i = 0; i < 4; i++) this.puff(x + (i - 1.5) * 60, 60 + i * 40, 8, i % 2 === 0);
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
          u = this.makeUnit(v.id, v.side, v.role, v.def);
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
        if (u.art) {
          if (u.art.dying < 0) u.art.onDeath('topple');
          u.art.update(dtMs, 'idle', tickTime, 0);
          u.root.children[0]!.alpha = Math.max(0, 1 - u.dying / 500); // the ground shadow fades first
          if (u.art.done) {
            u.root.destroy({ children: true });
            this.units.delete(id);
          }
          continue;
        }
        const t = Math.min(1, u.dying / 420);
        u.body.rotation = (u.side === 'player' ? -1 : 1) * t * 1.35;
        u.root.alpha = 1 - t;
        if (t >= 1) {
          u.root.destroy({ children: true });
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
        p.g.scale.set(k);
        p.g.rotation += 0.3;
        // a short fading trail of motion puffs
        if (((this.time / 16) | 0) % 3 === 0) this.fx('puff', x, y, { max: 200, s0: 0.18, s1: 0.05 });
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
          m.g.destroy();
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
        if (u.art) u.art.update(dtMs, 'idle', 0, 0);
        else u.body.y = -Math.abs(Math.sin(this.time / 900 + i)) * 4;
      });
      for (const side of ['player', 'enemy'] as const) this.baseArt[side]?.update(dtMs, 1);
    }
    this.updateAmbient(dtMs);
    // clouds drift and wrap
    for (const c of this.cloudSprites) {
      c.s.x += (c.v * dtMs) / 1000;
      if (c.s.x > this.host.width + 20) c.s.x = -c.s.width - 20;
    }

    // particles, numbers, bolts, shake, flash
    const dt = dtMs / 1000;
    this.particles = this.particles.filter((p) => {
      p.life += dtMs;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const f = Math.min(1, p.life / p.max);
      const sc = k * (p.s0 + (p.s1 - p.s0) * f);
      p.g.position.set(sx(p.x), gy - p.y * k);
      p.g.rotation += p.spin * dt;
      p.g.scale.set(sc * (p.flip ? Math.cos(p.life / 60) : 1) * (p.mirror ?? 1), sc);
      if (p.fade) p.g.alpha = f < 0.5 ? 1 : Math.max(0, 1 - (f - 0.5) * 2);
      if (p.life >= p.max) {
        p.g.destroy({ children: true });
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
        b.g.destroy();
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
    const dx = spread?.dx ?? 0;
    const depth = spread?.depth ?? 0;
    const facing = u.side === 'player' ? 1 : -1;
    const lunge = this.time < u.lungeUntil ? 10 * facing : 0;
    u.root.position.set(this.cam.sx(x + dx + (u.art ? 0 : lunge)), this.cam.groundY + depth * k * 0.35);
    u.root.scale.set(k * facing, k);
    u.root.zIndex = depth;
    if (u.art) {
      u.art.update(this.animDt * 1000, v.state, tickTime, u.speed);
    } else if (v.state === 'walk') {
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
      this.baseArt[side]?.update(this.animDt * 1000, Math.max(0, b.hp / b.maxHp));
    }
    if (this.warded !== c.enemyBase.warded) {
      this.warded = c.enemyBase.warded;
      this.redrawWard();
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Effects (placeholder recipes; slice 1D replaces them with ART_BIBLE §5.11)

  /** One baked effect sprite (ink behind, fill in front) living in world units. */
  private fx(name: VfxName, x: number, y: number, o: Partial<Omit<Particle, 'g' | 'x' | 'y'>> & { tint?: number; ink?: boolean } = {}): Particle {
    const scale = this.lib ? this.cam.ptPerWu * Math.min(2, globalThis.devicePixelRatio || 1) : 1;
    const tex = vfxTextures(scale);
    const c = new Container();
    const ink = o.ink === false ? undefined : vfxInk(scale, name);
    for (const t of [ink, tex[name]]) {
      if (!t) continue;
      const sp = new Sprite(t);
      sp.anchor.set(0.5);
      sp.scale.set(1 / scale);
      c.addChild(sp);
    }
    if (o.tint !== undefined) (c.children[c.children.length - 1] as Sprite).tint = o.tint;
    this.fxLayer.addChild(c);
    const p: Particle = { g: c, x, y, vx: 0, vy: 0, life: 0, max: 400, gravity: 0, spin: 0, fade: true, s0: 1, s1: 1, ...o };
    this.particles.push(p);
    return p;
  }

  /** Spawn ring in the faction colour (ART_BIBLE §5.11 spawnRing). */
  private ring(x: number, color: number) {
    this.fx('ring', x, 0, { tint: color, max: 380, s0: 0.5, s1: 1.35, ink: false });
    for (let i = 0; i < 3; i++) this.fx('puff', x + (i - 1) * 18, 4, { vx: (i - 1) * 40, vy: 30, max: 360, s0: 0.45, s1: 0.2, gravity: -40 });
  }

  /** Hit spark: one star burst, plus flying chips on heavy hits. */
  private spark(x: number, y: number, heavy: boolean) {
    this.fx(heavy ? 'sparkHeavy' : 'spark', x, y, { max: heavy ? 200 : 150, s0: heavy ? 0.7 : 0.55, s1: heavy ? 1.3 : 1, spin: 3 });
    if (heavy) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + this.time;
        this.fx('spark', x, y, { vx: Math.cos(a) * 220, vy: Math.sin(a) * 180 + 80, gravity: -500, max: 260, s0: 0.35, s1: 0.1, spin: 9 });
      }
    }
  }

  /** Cartoon dust/poof puffs. */
  private puff(x: number, y: number, n: number, dark = false) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.fx(dark ? 'puffDark' : 'puff', x, y, { vx: Math.cos(a) * 90, vy: Math.sin(a) * 60 + 40, gravity: -30, max: 520, s0: 0.5 + (i % 3) * 0.12, s1: 1.05 });
    }
  }

  /** Coins pop up and tumble (coinPop). */
  private coins(x: number, n: number) {
    for (let i = 0; i < n; i++) {
      this.fx('coin', x + (i - n / 2) * 14, 80, { vx: (i - n / 2) * 40, vy: 460 + i * 40, gravity: -1400, max: 760, fade: false, flip: true, s0: 0.8, s1: 0.8 });
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

/** Paints a CSS-px sized canvas at `res` device pixels per px and returns it as a texture. */
function paint(w: number, h: number, res: number, draw: (ctx: CanvasRenderingContext2D) => void): Texture {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * res));
  c.height = Math.max(1, Math.ceil(h * res));
  const ctx = c.getContext('2d')!;
  ctx.scale(res, res);
  draw(ctx);
  return Texture.from(c);
}

/** Swaps a layer's texture (freeing the old one) and sizes the sprite in CSS px. */
function replaceTexture(s: Sprite, t: Texture, w: number, h: number) {
  const old = s.texture;
  s.texture = t;
  s.setSize(w, h);
  if (old && old !== Texture.EMPTY) old.destroy(true);
}
