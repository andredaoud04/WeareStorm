import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { AgeId, BattleSnapshot, Role, Side, SimEvent, UnitDefId, UnitView } from '../../contracts';
import { TICKS_PER_SECOND } from '../../contracts';
import type { BattleSession } from '../../app/battleController';
import { rosterOf, unitDef } from '../../data/units';
import { color, faction, font } from '../../ui/style/tokens';
import { kitForAge, type KitId } from '../kits/ageKits';
import { KitBase } from '../kits/kitBase';
import { KitUnit } from '../kits/kitUnit';
import { KitWorld } from '../kits/kitWorld';
import { getKit, loadKit, onKitLoaded, type Kit } from '../kits/loader';
import type { FrameDef } from '../kits/manifest';
import { BASE_INSET, DEPTH_Y, ROLE_HEIGHT } from '../kits/sizes';
import { makeCamera, rankSpread, type Camera } from '../pixi/camera';
import { TRAUMA, Trauma, coverScale } from '../pixi/trauma';
import type { PixiHost } from '../pixi/app';

/**
 * The lane: the kit world, both bases, troops, projectiles and effects. It reads snapshots and events from a
 * BattleSession and never writes to the sim. Without a session it is the Hub diorama: the same world with a few of
 * your troops idling by your base. Art comes from the kits mapped to the Ages in play (src/render/kits/ageKits.ts):
 * the field (stage) Age draws the world, effects and the enemy base; each troop is drawn by its own Age's kit; your
 * base by your army's. Until a kit has loaded, a quiet placeholder stands in (a battle never waits for art).
 */

interface UnitSprite {
  id: number;
  side: Side;
  role: Role;
  kit: KitId;
  art: KitUnit | null;
  placeholder: Graphics | null;
  speed: number;
  root: Container;
  hp: Graphics;
  dying: number; // ms since death, -1 alive
  lastX: number;
  /** Eased rank offset and depth, so a unit never jumps sideways when the crowd around it changes. */
  sdx: number;
  sdepth: number;
  hpFrac: number;
}

interface Proj {
  g: Sprite;
  fromX: number;
  fromY: number;
  toX: number;
  target: number | 'base';
  fire: number; // tick
  arrive: number;
  arc: number;
  /** A lobbed solid (sling stone, grenade) tumbles instead of pointing along its path. */
  spin: boolean;
  base: number; // wu per texture px
  px: number;
  py: number;
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
  base: number; // wu per texture px
  s0: number; // scale at birth and at death
  s1: number;
  flip?: boolean; // coin spin: scale.x oscillates
  mirror?: number; // 1 or -1
  fadeIn?: number; // ms
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

/** Kit effect frames and their world size (wu along the longest side at scale 1). */
const FX = {
  hit: { size: 100, add: true },
  impact: { size: 220, add: true },
  dust: { size: 170, add: false },
  poof: { size: 240, add: false },
  projectile: { size: 120, add: true },
  coin: { size: 46, add: false },
  strike: { size: 0, add: true },
  scorch: { size: 300, add: false },
  swoosh: { size: 200, add: true },
} as const;
type FxName = keyof typeof FX;

export interface SceneOptions {
  /** Screen y (CSS px) where the bottom UI begins; the ground sits a band above it. */
  uiTop: () => number;
  reduceMotion: () => boolean;
  damageNumbers: () => boolean;
  /** Ages shown when no battle runs: your army's and the next stage's. */
  hubAges: () => { army: AgeId; field: AgeId };
}

const hex = (s: string) => Number.parseInt(s.slice(1), 16);
const INK = hex(color.ink);

export class BattleScene {
  readonly root = new Container();
  private backLayer = new Container();
  private fallback = new Graphics();
  private world: KitWorld | null = null;
  private frontLayer = new Container();
  private bases = { player: new Container(), enemy: new Container() };
  private baseArt: { player: KitBase | null; enemy: KitBase | null } = { player: null, enemy: null };
  private ward = new Graphics();
  private lane = new Container();
  private unitsLayer = new Container();
  private fxLayer = new Container();
  private overlay = new Graphics();
  private units = new Map<number, UnitSprite>();
  private projs = new Map<number, Proj>();
  private particles: Particle[] = [];
  private numbers: Num[] = [];
  private markers: { g: Graphics; until: number; kind: 'slam' | 'storm'; born: number; x: number; r: number }[] = [];
  private cam: Camera;
  private session: BattleSession | null = null;
  private off: (() => void)[] = [];
  private time = 0; // ms, presentation clock
  private trauma = new Trauma();
  private warlordId = 0;
  private slamTick = -1;
  private flashWhite = 0;
  private stormLevel = 0;
  private warded = false;
  private bolts: { g: Sprite; until: number; born: number }[] = [];
  private idle: UnitSprite[] = [];
  private animDt = 0; // ms of animation this frame (0 while paused)
  private ease = 1; // per-frame easing factor for rank offsets
  /** Kits in play: the field (world, effects, enemy base) and the army (your base). */
  private ages: { army: AgeId; field: AgeId } = { army: 'stone', field: 'stone' };
  private built = { world: '', player: '', enemy: '' };

  constructor(private host: PixiHost, private opts: SceneOptions) {
    this.cam = makeCamera({ w: host.width, h: host.height, uiTop: opts.uiTop() });
    this.unitsLayer.sortableChildren = true;
    this.backLayer.addChild(this.fallback);
    this.root.addChild(this.backLayer, this.lane, this.frontLayer);
    this.lane.addChild(this.bases.player, this.bases.enemy, this.ward, this.unitsLayer, this.fxLayer);
    this.root.addChild(this.overlay);
    host.world.addChild(this.root);
    this.off.push(host.onResize(() => this.layout()));
    this.off.push(onKitLoaded(() => this.syncKits()));
    this.layout();
  }

  attach(session: BattleSession | null) {
    for (const f of this.off.splice(2)) f();
    this.clearUnits();
    this.session = session;
    this.warded = !!session?.curr.enemyBase.warded;
    this.stormLevel = 0;
    this.trauma.value = 0;
    this.warlordId = 0;
    this.ages = session ? { army: session.state.input.armyAge, field: session.stage.age } : this.opts.hubAges();
    for (const side of ['player', 'enemy'] as const) {
      this.baseArt[side]?.destroy();
      this.baseArt[side] = null;
    }
    this.built.player = this.built.enemy = '';
    this.syncKits();
    if (session) this.off.push(session.onEvents((ev, tick) => this.onEvents(ev, tick)));
    else this.spawnIdle();
    this.redrawWard();
  }

  destroy() {
    for (const f of this.off) f();
    this.root.destroy({ children: true, context: true });
  }

  /** Kits for the Ages in play; builds whatever has loaded, asks for the rest. */
  private syncKits() {
    const fieldKit = kitForAge(this.ages.field);
    const armyKit = kitForAge(this.ages.army);
    for (const id of new Set([fieldKit, armyKit])) if (!getKit(id)) loadKit(id).catch((e) => console.warn(`art kit ${id} failed to load`, e));
    const fk = getKit(fieldKit);
    if (fk && this.built.world !== fk.id) {
      this.world?.destroy();
      this.world = new KitWorld(fk);
      this.backLayer.addChild(this.world.back);
      this.frontLayer.addChild(this.world.front);
      this.built.world = fk.id;
    }
    const sides: [Side, KitId][] = [['player', armyKit], ['enemy', fieldKit]];
    for (const [side, id] of sides) {
      const k = getKit(id);
      if (!k || this.built[side] === id) continue;
      this.baseArt[side]?.destroy();
      const b = new KitBase(k, side);
      b.onStateChange = (st) => this.onBaseState(side, st);
      this.baseArt[side] = b;
      this.bases[side].addChild(b.root);
      this.built[side] = id;
    }
    this.layout();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Layout

  layout() {
    const w = this.host.width;
    const h = this.host.height;
    const uiTop = this.opts.uiTop();
    this.cam = makeCamera({ w, h, uiTop });
    const k = this.cam.ptPerWu;
    const gy = this.cam.groundY;
    // fallback while the field kit loads: deep night sky and a dark lane, no detail
    this.fallback.clear().rect(0, 0, w, h).fill(hex(color.night900)).rect(0, gy - 6, w, h - gy + 6).fill(0x0b0f1f);
    this.world?.layout({ w, h, groundY: gy, k, uiTop });
    this.bases.player.position.set(this.cam.sx(-BASE_INSET), gy);
    this.bases.player.scale.set(k);
    this.bases.enemy.position.set(this.cam.sx(1000 + BASE_INSET), gy);
    this.bases.enemy.scale.set(-k, k);
    this.redrawWard();
  }

  private redrawWard() {
    this.ward.clear();
    if (!this.warded) return;
    const k = this.cam.ptPerWu;
    const cx = this.cam.sx(1000 + BASE_INSET + 30);
    const gy = this.cam.groundY;
    const H = (this.baseArt.enemy?.height ?? 700) * 0.6;
    this.ward.ellipse(cx, gy - H * 0.45 * k, 230 * k, H * k).fill({ color: 0x8b5cf6, alpha: 0.14 });
    this.ward.ellipse(cx, gy - H * 0.45 * k, 230 * k, H * k).stroke({ width: 3, color: 0xb79cff, alpha: 0.8 });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Units

  private makeUnit(id: number, side: Side, role: Role, def: UnitDefId): UnitSprite {
    const root = new Container();
    const hp = new Graphics();
    hp.visible = false;
    root.addChild(hp);
    this.unitsLayer.addChild(root);
    const u: UnitSprite = { id, side, role, kit: kitForAge(unitDef(def).age), art: null, placeholder: null, speed: unitDef(def).speed, root, hp, dying: -1, lastX: 0, hpFrac: 1, sdx: Number.NaN, sdepth: 0 };
    this.dress(u);
    return u;
  }

  /** Gives a unit its kit art, or a dim placeholder until the kit arrives. */
  private dress(u: UnitSprite) {
    const kit = getKit(u.kit);
    if (kit && !u.art) {
      u.placeholder?.destroy();
      u.placeholder = null;
      u.art = new KitUnit(kit, u.role, u.side, u.id);
      u.root.addChildAt(u.art.root, 0);
    } else if (!kit && !u.placeholder) {
      const H = ROLE_HEIGHT[u.role];
      const c = hex(faction[u.side].shadow);
      u.placeholder = new Graphics().roundRect(-H * 0.14, -H * 0.8, H * 0.28, H * 0.8, H * 0.12).fill({ color: c, alpha: 0.7 });
      u.root.addChildAt(u.placeholder, 0);
    }
  }

  private height(u: UnitSprite) {
    return u.art?.height ?? ROLE_HEIGHT[u.role];
  }

  private clearUnits() {
    for (const u of this.units.values()) u.root.destroy({ children: true, context: true });
    for (const u of this.idle) u.root.destroy({ children: true, context: true });
    for (const p of this.projs.values()) p.g.destroy();
    for (const p of this.particles) p.g.destroy({ children: true, context: true });
    for (const n of this.numbers) n.t.destroy();
    for (const m of this.markers) m.g.destroy({ context: true });
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
    const r = rosterOf(this.ages.army);
    const rows: [Role, UnitDefId, number][] = [['ranged', r.ranged.id, 110], ['melee', r.melee.id, 250], ['melee', r.melee.id, 370]];
    rows.forEach(([role, def, x], i) => {
      const u = this.makeUnit(9000 + i, 'player', role, def);
      u.lastX = x;
      u.sdepth = i % 2 ? 14 : -10;
      this.idle.push(u);
    });
  }

  private onBaseState(side: Side, st: string) {
    const x = side === 'enemy' ? 1000 + BASE_INSET : -BASE_INSET;
    const H = this.baseArt[side]?.height ?? 600;
    const n = st === 'ruins' ? 6 : 3;
    for (let i = 0; i < n; i++) this.fx('dust', x + (i - (n - 1) / 2) * 90, H * (0.1 + (i % 3) * 0.15), { vx: (i - n / 2) * 40, vy: 40, max: 900, s0: 0.8, s1: 1.4, gravity: -20 });
    if (st !== 'ruins') this.shake(TRAUMA.baseHit);
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
          this.ring(e.x, hex(faction[e.side].light));
          break;
        }
        case 'attackStart': {
          this.units.get(e.id)?.art?.onAttackStart(tick, e.impactTick);
          break;
        }
        case 'slamTelegraph': {
          const g = new Graphics();
          this.fxLayer.addChild(g);
          this.markers.push({ g, until: e.impactTick, kind: 'slam', born: tick, x: e.x, r: e.radius });
          break;
        }
        case 'projectile': {
          const src = this.units.get(e.id);
          const facing = src?.side === 'enemy' ? -1 : 1;
          let fromX = e.from;
          let fromY = 0.55 * (src ? this.height(src) : ROLE_HEIGHT.ranged);
          if (src?.art) {
            const m = src.art.muzzle();
            fromX = src.lastX + src.sdx + facing * m.x;
            fromY = -m.y;
          }
          const tex = this.fxTexture('projectile', src?.kit);
          // muzzle / casting flash (not for a sling stone, an arrow or a thrown grenade)
          if (tex?.fr.flash !== false) this.fx('hit', fromX, fromY, { max: 120, s0: 0.45, s1: 0.8, kit: src?.kit });
          if (!tex) break;
          const g = new Sprite(tex.t);
          g.anchor.set(0.5);
          g.blendMode = tex.fr.blend === 'normal' ? 'normal' : 'add';
          this.fxLayer.addChild(g);
          // lobbed styles arc, unless the kit draws them as a tracer or beam (an additive glow flies flat)
          const lob = (e.style === 'bomb' || e.style === 'shell' || e.style === 'pebble') && tex.fr.blend !== 'add';
          this.projs.set(e.projId, { g, fromX, fromY, toX: e.toX, target: e.to, fire: tick, arrive: e.arriveTick, arc: lob ? 90 : 18, spin: lob && tex.fr.blend === 'normal', base: tex.base, px: Number.NaN, py: Number.NaN });
          break;
        }
        case 'projectileEnd': {
          const p = this.projs.get(e.projId);
          if (p) {
            p.g.destroy();
            this.projs.delete(e.projId);
          }
          if (e.result === 'fizzle') this.puff(e.x, 10, 2, 0.5);
          if (e.result === 'explode') {
            this.fx('impact', e.x, 60, { max: 320, s0: 0.6, s1: 1.1 });
            this.puff(e.x, 30, 4, 0.9);
            this.shake(TRAUMA.splash);
          }
          break;
        }
        case 'hit': {
          if (e.targetId === 'base') {
            this.baseArt[e.targetSide]?.hit(e.heavy);
            const bx = e.targetSide === 'enemy' ? 1000 + 50 : -50;
            const H = this.baseArt[e.targetSide]?.height ?? 600;
            if (e.blocked === 'ward') {
              this.fx('hit', 1000 + 40, H * 0.3, { tint: 0xb79cff, max: 200, s0: 0.7, s1: 1.2 }); // ward 'ting'
              break;
            }
            this.fx(e.heavy ? 'impact' : 'hit', bx, H * (0.12 + ((e.sourceId * 37) % 30) / 100), { max: 220, s0: e.heavy ? 0.45 : 0.6, s1: e.heavy ? 0.8 : 1, spin: 2 });
            if (e.heavy) this.puff(bx, 60, 2, 0.7);
            if (e.targetSide === 'player' && e.amount > 0) this.shake(TRAUMA.baseHit);
            if (e.targetSide === 'enemy') this.number('base', bx, H * 0.45, e.amount);
            break;
          }
          const u = this.units.get(e.targetId);
          if (!u) break;
          u.art?.onHit(e.heavy);
          const src = this.units.get(e.sourceId);
          const H = this.height(u);
          const dir = u.side === 'player' ? 1 : -1;
          this.fx(e.heavy ? 'impact' : 'hit', u.lastX + u.sdx + dir * H * 0.08, H * 0.5, { max: e.heavy ? 240 : 170, s0: e.heavy ? 0.4 : 0.55, s1: e.heavy ? 0.75 : 1, spin: 3 });
          if (src && e.projId === undefined && src.role !== 'ranged' && src.dying < 0) {
            const sd = src.side === 'player' ? 1 : -1;
            const SH = this.height(src);
            if (src.art?.strike === 'shot') {
              // a point-blank volley: flash and smoke at the muzzle
              const m = src.art.muzzle();
              const mx = src.lastX + src.sdx + sd * m.x;
              this.fx('hit', mx, -m.y, { max: 140, s0: 0.6, s1: 1, kit: src.kit });
              this.fx('dust', mx + sd * 20, -m.y, { vx: sd * 60, vy: 30, max: 520, s0: 0.25, s1: 0.5, kit: src.kit });
            } else {
              // melee swoosh on the striking side
              this.fx('swoosh', src.lastX + src.sdx + sd * SH * 0.3, SH * 0.55, { max: 160, s0: (SH / 250) * 0.9, s1: (SH / 250) * 1.05, mirror: sd, kit: src.kit, fadeIn: 30 });
            }
          }
          if (src && src.id === this.warlordId) {
            if (this.slamTick !== tick) {
              this.shake(TRAUMA.warlordSlam); // one slam hits many: shake once
              this.fx('impact', src.lastX - 160, 20, { max: 380, s0: 0.7, s1: 1.3 });
              this.puff(src.lastX - 160, 10, 5, 1.1);
            }
            this.slamTick = tick;
          } else if (e.heavy && (u.role === 'tank' || u.role === 'warlord' || src?.role === 'tank')) this.shake(TRAUMA.tankHit);
          if (e.targetSide === 'enemy') this.number(e.targetId, u.lastX, H + 30, e.amount);
          break;
        }
        case 'death': {
          const u = this.units.get(e.id);
          if (u) {
            u.dying = 0;
            u.hp.visible = false;
            u.art?.onDeath();
          }
          const H = u ? this.height(u) : ROLE_HEIGHT.melee;
          this.fx('poof', e.x, H * 0.35, { max: 520, s0: (H / 250) * 0.6, s1: (H / 250) * 1.1, vy: 30 });
          // with motion on, the UI flies the coins to the Gold pill (coinPop); the world only shows them under Reduce Motion
          if (e.gold > 0 && rm) this.coins(e.x, Math.min(5, e.gold));
          if (u?.role === 'warlord') this.shake(TRAUMA.warlordKill);
          else if (u?.role === 'tank') this.shake(TRAUMA.tankKill);
          break;
        }
        case 'baseChunk':
          if (e.source === 'base' && rm) this.coins(1000 + 60, Math.min(3, e.gold));
          break;
        case 'wardBroken': {
          this.warded = false;
          this.redrawWard();
          const H = this.baseArt.enemy?.height ?? 600;
          for (let i = 0; i < 12; i++) this.fx('hit', 1030 + Math.cos(i) * 160, H * 0.3 + Math.sin(i) * H * 0.25, { tint: 0xc9b6ff, vy: 120, max: 520, s0: 0.8, s1: 0.2, spin: 6 });
          this.shake(TRAUMA.wardBreak);
          if (!rm) this.session?.hitStop(80);
          break;
        }
        case 'warlordIntro':
          this.warlordId = e.id;
          this.shake(TRAUMA.warlordIntro);
          if (!rm) this.session?.slowMo(1000, 0.4); // boss intro slow-motion (ART_BIBLE §5.15)
          break;
        case 'stormRising':
          this.stormLevel = e.level;
          break;
        case 'stormcallCast': {
          const g = new Graphics();
          this.fxLayer.addChild(g);
          this.markers.push({ g, until: e.strikeTick, kind: 'storm', born: tick, x: e.x, r: e.radius });
          break;
        }
        case 'stormcallStrike':
          this.bolt(e.x);
          this.flashWhite = rm ? 0 : 0.35; // ≤ 35 % (ART_BIBLE §5.15)
          this.shake(TRAUMA.stormcall);
          if (!rm) this.session?.hitStop(70);
          this.fx('impact', e.x, 40, { max: 420, s0: 0.8, s1: 1.5 });
          this.puff(e.x, 20, 5, 1.1);
          this.fx('scorch', e.x, 0, { max: 2400, s0: 1, s1: 1.05 });
          break;
        case 'end': {
          const loser: Side = e.result === 'victory' ? 'enemy' : 'player';
          this.baseArt[loser]?.startCollapse();
          if (e.result === 'victory') for (const u of this.units.values()) if (u.side === 'player' && u.dying < 0) u.art?.cheer();
          const x = loser === 'enemy' ? 1000 + BASE_INSET : -BASE_INSET;
          const H = this.baseArt[loser]?.height ?? 600;
          for (let i = 0; i < 5; i++) this.puff(x + (i - 2) * 80, H * (0.1 + i * 0.12), 2, 1.3);
          this.fx('poof', x, H * 0.4, { max: 900, s0: 1.5, s1: 2.6 });
          this.shake(TRAUMA.collapse);
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
    this.animDt = dtMs * (s?.speed ?? 1);
    const k = this.cam.ptPerWu;
    const gy = this.cam.groundY;
    const sx = (x: number) => this.cam.sx(x);
    const rm = this.opts.reduceMotion();

    if (s) {
      const tickTime = s.curr.tick - 1 + s.alpha;
      const prevById = new Map(s.prev.units.map((u) => [u.id, u] as const));
      const spread = rankSpread(s.curr.units);
      const alive = new Set<number>();
      for (const v of s.curr.units) {
        alive.add(v.id);
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
        if (alive.has(id)) continue;
        if (u.dying < 0) u.dying = 0;
        u.dying += this.animDt;
        if (u.art) {
          if (u.art.dying < 0) u.art.onDeath();
          u.art.update(this.animDt, 'idle', tickTime, 0);
          if (!u.art.done) continue;
        } else if (u.dying < 400) {
          u.root.alpha = 1 - u.dying / 400;
          continue;
        }
        u.root.destroy({ children: true, context: true });
        this.units.delete(id);
      }
      // projectiles
      for (const p of this.projs.values()) {
        const f = Math.max(0, Math.min(1, (tickTime - p.fire) / Math.max(1, p.arrive - p.fire)));
        let toX = p.toX;
        let toY = 120;
        if (typeof p.target === 'number') {
          const t = this.units.get(p.target);
          if (t && t.dying < 0) {
            toX = t.lastX + t.sdx;
            toY = this.height(t) * 0.45;
          } else toY = 60;
        } else toY = (this.baseArt.enemy?.height ?? 600) * 0.2;
        const x = p.fromX + (toX - p.fromX) * f;
        const y = p.fromY + (toY - p.fromY) * f + Math.sin(f * Math.PI) * p.arc;
        const px = sx(x);
        const py = gy - y * k;
        if (p.spin) p.g.rotation = f * 9 * (toX < p.fromX ? -1 : 1);
        else if (!Number.isNaN(p.px) && (px !== p.px || py !== p.py)) p.g.rotation = Math.atan2(py - p.py, px - p.px);
        else if (Number.isNaN(p.px)) p.g.rotation = toX < p.fromX ? Math.PI : 0;
        p.px = px;
        p.py = py;
        p.g.position.set(px, py);
        p.g.scale.set(k * p.base);
      }
      // markers (slam telegraph, Stormcall gather)
      this.markers = this.markers.filter((m) => {
        const f = Math.max(0, Math.min(1, (tickTime - m.born) / Math.max(1, m.until - m.born)));
        m.g.clear();
        const col = m.kind === 'slam' ? 0xf0533c : 0xb79cff;
        m.g.ellipse(sx(m.x), gy, m.r * k * (0.4 + 0.6 * f), 14 * k + 6).fill({ color: col, alpha: 0.18 + 0.2 * f });
        m.g.ellipse(sx(m.x), gy, m.r * k, 14 * k + 6).stroke({ width: 2.5, color: col, alpha: 0.9 });
        if (tickTime >= m.until) {
          m.g.destroy({ context: true });
          return false;
        }
        return true;
      });
      this.drawBaseState(s.curr);
    } else {
      // Hub diorama: troops idle by your base
      for (const u of this.idle) {
        if (!u.art) this.dress(u);
        u.root.position.set(sx(u.lastX), gy + u.sdepth * k * DEPTH_Y);
        u.root.scale.set(k);
        u.root.zIndex = u.sdepth;
        u.art?.update(dtMs, 'idle', 0, 0);
      }
      for (const side of ['player', 'enemy'] as const) this.baseArt[side]?.update(dtMs, 1);
    }
    this.world?.update(dtMs);

    // particles, numbers, bolts, shake, flash
    const dt = dtMs / 1000;
    this.particles = this.particles.filter((p) => {
      p.life += dtMs;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const f = Math.min(1, p.life / p.max);
      const sc = k * p.base * (p.s0 + (p.s1 - p.s0) * f);
      p.g.position.set(sx(p.x), gy - p.y * k);
      p.g.rotation += p.spin * dt;
      p.g.scale.set(sc * (p.flip ? Math.cos(p.life / 60) : 1) * (p.mirror ?? 1), sc);
      let a = p.fade ? (f < 0.45 ? 1 : Math.max(0, 1 - (f - 0.45) / 0.55)) : 1;
      if (p.fadeIn) a *= Math.min(1, p.life / p.fadeIn);
      p.g.alpha = a;
      if (p.life >= p.max) {
        p.g.destroy({ children: true, context: true });
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
      const age = this.time - b.born;
      b.g.alpha = age < 40 ? age / 40 : Math.max(0, (b.until - this.time) / (b.until - b.born - 40));
      if (this.time >= b.until) {
        b.g.destroy();
        return false;
      }
      return true;
    });
    this.applyShake(dt, rm);
    this.overlay.clear();
    const dark = Math.min(0.32, this.stormLevel * 0.08);
    if (dark > 0) this.overlay.rect(0, 0, this.host.width, this.host.height).fill({ color: 0x141b33, alpha: dark });
    if (this.flashWhite > 0) {
      this.overlay.rect(0, 0, this.host.width, this.host.height).fill({ color: 0xffffff, alpha: this.flashWhite });
      this.flashWhite = Math.max(0, this.flashWhite - dt * 6);
    }
  }

  private placeUnit(u: UnitSprite, v: UnitView, x: number, spread: { dx: number; depth: number } | undefined, tickTime: number) {
    if (!u.art) this.dress(u);
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
    const facing = u.side === 'player' ? 1 : -1;
    u.root.position.set(this.cam.sx(x + u.sdx), this.cam.groundY + u.sdepth * k * DEPTH_Y);
    u.root.scale.set(k * facing, k);
    // nearer (lower) units in front; the Warlord stands behind the troops it tramples
    u.root.zIndex = u.role === 'warlord' ? -100 : u.sdepth;
    u.art?.update(this.animDt, v.state, tickTime, u.speed);
    // HP bar only once damaged (the Warlord has its own bar in the HUD)
    const frac = v.hp / v.maxHp;
    if (u.role !== 'warlord' && frac < 0.999) {
      if (Math.abs(frac - u.hpFrac) > 0.001 || !u.hp.visible) {
        const w = u.role === 'tank' ? 130 : 96;
        const y = -this.height(u) * 1.04 - 22;
        u.hp.clear();
        u.hp.roundRect(-w / 2, y, w, 17, 8.5).fill(0x111735).stroke({ width: 4, color: INK });
        u.hp.roundRect(-w / 2 + 3, y + 3, Math.max(0, (w - 6) * frac), 11, 5.5).fill(hex(faction[u.side].base));
        u.hp.visible = true;
        u.hpFrac = frac;
      }
      u.hp.scale.x = facing; // the root is mirrored for the enemy: keep the bar draining the same way
    }
  }

  private drawBaseState(c: BattleSnapshot) {
    for (const side of ['player', 'enemy'] as const) {
      const b = side === 'player' ? c.playerBase : c.enemyBase;
      this.baseArt[side]?.update(this.animDt, Math.max(0, b.hp / b.maxHp));
    }
    if (this.warded !== c.enemyBase.warded) {
      this.warded = c.enemyBase.warded;
      this.redrawWard();
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Effects (kit sprites)

  /** An effect texture from a kit (the field kit by default) with its world scale, or null while it loads. */
  private fxTexture(name: FxName, kitId?: KitId): { t: Texture; base: number; kit: Kit; fr: FrameDef } | null {
    const kit = getKit(kitId ?? kitForAge(this.ages.field)) ?? getKit(kitForAge(this.ages.field));
    if (!kit) return null;
    const fr = kit.manifest.frames[`fx/${name}`];
    if (!fr) return null;
    return { t: kit.frame(`fx/${name}`), base: (fr.size ?? (FX[name].size || 100)) / Math.max(fr.w, fr.h), kit, fr };
  }

  /** One effect sprite living in world units. */
  private fx(name: FxName, x: number, y: number, o: Partial<Omit<Particle, 'g' | 'x' | 'y' | 'base'>> & { tint?: number; kit?: KitId } = {}): Particle | null {
    const tex = this.fxTexture(name, o.kit);
    if (!tex) return null;
    const sp = new Sprite(tex.t);
    sp.anchor.set(0.5);
    if (FX[name].add) sp.blendMode = 'add';
    if (o.tint !== undefined) sp.tint = o.tint;
    if (name === 'scorch') this.fxLayer.addChildAt(sp, 0);
    else this.fxLayer.addChild(sp);
    const { kit: _k, tint: _t, ...rest } = o;
    const p: Particle = { g: sp, x, y, vx: 0, vy: 0, life: 0, max: 400, gravity: 0, spin: 0, fade: true, s0: 1, s1: 1, base: tex.base, ...rest };
    this.particles.push(p);
    return p;
  }

  /** Spawn ring in the faction colour, plus a little dust. */
  private ring(x: number, col: number) {
    const g = new Graphics().ellipse(0, 0, 70, 16).stroke({ width: 7, color: col, alpha: 0.9 });
    this.fxLayer.addChildAt(g, 0);
    this.particles.push({ g, x, y: 0, vx: 0, vy: 0, life: 0, max: 380, gravity: 0, spin: 0, fade: true, base: 1, s0: 0.5, s1: 1.5 });
    this.puff(x, 8, 2, 0.45);
  }

  /** Dust puffs. */
  private puff(x: number, y: number, n: number, size = 0.8) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.fx('dust', x + Math.cos(a) * 20, y, { vx: Math.cos(a) * 90, vy: Math.sin(a) * 40 + 40, gravity: -30, max: 560, s0: size * (0.5 + (i % 3) * 0.12), s1: size * 1.05, mirror: i % 2 ? -1 : 1 });
    }
  }

  /** Coins pop up and tumble (Reduce Motion only: otherwise the UI flies them to the Gold pill). */
  private coins(x: number, n: number) {
    for (let i = 0; i < n; i++) {
      this.fx('coin', x + (i - n / 2) * 14, 80, { vx: (i - n / 2) * 40, vy: 460 + i * 40, gravity: -1400, max: 760, fade: false, flip: true, s0: 1, s1: 1 });
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

  /** The Stormcall strike: the kit's bolt sprite from the top of the screen to the ground. */
  private bolt(x: number) {
    const tex = this.fxTexture('strike');
    if (!tex) return;
    const fr = tex.kit.manifest.frames['fx/strike']!;
    const g = new Sprite(tex.t);
    g.anchor.set(0.5);
    g.blendMode = 'add';
    const gy = this.cam.groundY;
    const vertical = fr.h >= fr.w;
    const len = vertical ? fr.h : fr.w;
    const s = (gy * 0.92) / len;
    g.rotation = vertical ? 0 : Math.PI / 2;
    g.scale.set(s, vertical ? s * 0.7 : s);
    g.position.set(this.cam.sx(x), gy - (len * s) / 2);
    this.fxLayer.addChild(g);
    this.bolts.push({ g, until: this.time + 260, born: this.time });
  }

  private shake(amount: number) {
    this.trauma.add(amount);
  }

  /**
   * Trauma shake on the world container only (the DOM HUD never moves): offset and roll from smooth noise, scaled by
   * trauma², with a matching zoom so no canvas edge shows. Far layers (sky, wisps) move at 40 % (parallax depth).
   * Off under Reduce Motion.
   */
  private applyShake(dtSec: number, rm: boolean) {
    this.trauma.update(dtSec);
    const w = this.host.width;
    const h = this.host.height;
    const sh = rm ? null : this.trauma.sample(this.time / 1000);
    const far = this.world?.far ?? [];
    if (!sh || (!sh.x && !sh.y && !sh.angle)) {
      if (this.root.rotation || this.root.scale.x !== 1 || this.root.pivot.x) {
        this.root.pivot.set(0, 0);
        this.root.position.set(0, 0);
        this.root.rotation = 0;
        this.root.scale.set(1);
        for (const l of far) l.pivot.set(0, 0);
      }
      return;
    }
    const env = this.trauma.envelope();
    this.root.pivot.set(w / 2, h / 2);
    this.root.position.set(w / 2 + sh.x, h / 2 + sh.y);
    this.root.rotation = sh.angle;
    this.root.scale.set(coverScale(w, h, env.x, env.y, env.angle));
    for (const l of far) l.pivot.set(sh.x * 0.6, sh.y * 0.6);
  }

  /** Screen position of a world point, for DOM overlays (coin flights, coach marks). */
  toScreen(x: number, heightWu = 0) {
    return { x: this.cam.sx(x), y: this.cam.groundY - heightWu * this.cam.ptPerWu };
  }

  get seconds() {
    return this.session ? this.session.curr.tick / TICKS_PER_SECOND : 0;
  }
}
