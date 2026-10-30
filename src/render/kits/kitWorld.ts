import { Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { Kit } from './loader';
import { LANE_HEIGHT, SCENE_WIDTH } from './sizes';

/**
 * The kit's world behind the troops. Atlas kits (Eldritch, Future): the portrait sky cover-fitted to the screen (its
 * planet kept in view), drifting wisps/ion clouds, the horizon band standing on the lane, the basalt/ash ground below,
 * the path strip along the lane, and a few props at the bottom edges, below the lane so they never cover a troop.
 * Layered kits (the era packs): the sky, then the authored distant / midground / ground layers kept in register on one
 * scene canvas that stands on the lane, the era's neutral prop behind the lane, the foreground strip below the lane
 * and a fill down to the screen bottom. Layers are re-laid out on resize; textures come from the kit.
 */
export interface WorldLayout {
  w: number;
  h: number;
  groundY: number;
  k: number; // pt per wu
  uiTop: number;
}

/** Which props stand where: [frame, screen x fraction, height pt at the reference phone, mirrored]. */
const PROPS: Record<string, [string, number, number, boolean][]> = {
  eldritch: [
    ['prop/rock_large', 0.05, 50, false],
    ['prop/crystal_cyan', 0.19, 34, false],
    ['prop/void_flowers', 0.8, 30, true],
    ['prop/crystal_violet', 0.94, 46, true],
  ],
  future: [
    ['prop/rock_large', 0.05, 44, false],
    ['prop/luminous_flowers', 0.19, 26, false],
    ['prop/supply_crate', 0.8, 28, true],
    ['prop/crystal_violet', 0.95, 42, true],
  ],
};

/** Layered kits: the neutral prop behind the lane: [frame, screen x fraction, height pt at the reference phone]. */
const BACK_PROPS: Record<string, [string, number, number][]> = {
  primal: [['prop/weathered_totem', 0.6, 96]],
  ancient: [['prop/broken_standard', 0.38, 100]],
};

/** Layered kits: tints that set the far layers back so the troops read in front of them. */
const LAYER_TINT: Record<string, { distant: number; midground: number; ground: number; foreground: number; fill: number }> = {
  primal: { distant: 0xb4b8c8, midground: 0xc2c4cc, ground: 0xe4e2e0, foreground: 0xa8a8b0, fill: 0x8e8c90 },
  ancient: { distant: 0xc8ccd8, midground: 0xd4d4da, ground: 0xecebe8, foreground: 0xb0b0b4, fill: 0x969492 },
  gunpowder: { distant: 0xbcc0cc, midground: 0xc8c8d0, ground: 0xe6e4e2, foreground: 0xa8a8b0, fill: 0x8e8c90 },
  industrial: { distant: 0xbcbcc8, midground: 0xc8c6cc, ground: 0xe6e4e2, foreground: 0xa8a6aa, fill: 0x8c8a8c },
};

export class KitWorld {
  /** Behind the bases and troops. */
  readonly back = new Container();
  /** In front of everything on the lane (props below it). */
  readonly front = new Container();
  /** Far layers that move less under screen shake. */
  readonly far: Container[];
  private sky = new Sprite();
  private clouds = new Container();
  private horizon = new Container();
  /** Atmospheric haze at the horizon's foot: the far cliffs recede, the dark armour of the troops pops. */
  private haze = new Sprite();
  private ground: TilingSprite;
  private path: TilingSprite | null = null;
  private drift: { s: Sprite; v: number }[] = [];
  private w = 0;
  /** Layered kits: the scene canvas layers (each a row of mirrored copies), the prop row and the foreground. */
  private layers: Record<'distant' | 'midground' | 'ground' | 'foreground', Container> | null = null;
  private props = new Container();
  laneTop = 0;
  laneBottom = 0;

  constructor(readonly kit: Kit) {
    this.sky.texture = kit.image('sky');
    if (kit.manifest.world === 'layers') {
      const t = LAYER_TINT[kit.id];
      this.layers = { distant: new Container(), midground: new Container(), ground: new Container(), foreground: new Container() };
      this.ground = new TilingSprite({ texture: kit.image('fill') });
      if (t) {
        for (const k of ['distant', 'midground', 'ground', 'foreground'] as const) this.layers[k].tint = t[k];
        this.ground.tint = t.fill;
      }
      this.back.addChild(this.sky, this.layers.distant, this.layers.midground, this.ground, this.layers.ground, this.props);
      this.front.addChild(this.layers.foreground);
      this.far = [this.sky, this.layers.distant];
      return;
    }
    this.ground = new TilingSprite({ texture: kit.image('ground') });
    const path = (this.path = new TilingSprite({ texture: kit.image('path') }));
    // the far scenery sits back: a touch darker so the troops pop against it
    this.haze.texture = hazeTexture(HAZE[kit.id] ?? '#4b4a8f');
    this.horizon.tint = 0xc4c4d6;
    this.ground.tint = 0x9a9aae;
    this.back.addChild(this.sky, this.clouds, this.horizon, this.haze, this.ground, path);
    this.far = [this.sky, this.clouds];
    for (let i = 1; i <= 5; i++) {
      const s = new Sprite(kit.frame(`cloud/${i}`));
      s.anchor.set(0.5);
      s.alpha = 0.7;
      this.clouds.addChild(s);
      this.drift.push({ s, v: 3 + ((i * 7) % 5) * 1.5 });
    }
  }

  layout(L: WorldLayout) {
    const { w, h, groundY, k } = L;
    this.w = w;
    const m = this.kit.manifest;
    // sky: cover the screen, keep the focus (planet) in view
    const sky = m.images.sky!;
    const ss = Math.max(w / sky.w, h / sky.h);
    const [fx, fy] = sky.focus ?? [0.5, 0.3];
    this.sky.scale.set(ss);
    this.sky.position.set(clamp(w * 0.55 - fx * sky.w * ss, w - sky.w * ss, 0), clamp(h * 0.24 - fy * sky.h * ss, h - sky.h * ss, 0));

    // lane band
    const laneH = LANE_HEIGHT * k;
    this.laneTop = groundY - laneH * 0.5;
    this.laneBottom = groundY + laneH * 0.5;
    if (this.layers) {
      this.layoutLayers(L);
      return;
    }
    const path = this.path!;

    // horizon: bottom on the lane top, mirrored copies to cover any width
    const hz = m.images.horizon!;
    const hs = k * 1.34;
    const hw = hz.w * hs;
    this.horizon.removeChildren().forEach((c) => c.destroy());
    const n = Math.ceil((w / hw - 1) / 2) + 1;
    for (let i = -n; i <= n; i++) {
      const s = new Sprite(this.kit.image('horizon'));
      s.anchor.set(0.5, 1);
      s.scale.set(i % 2 ? -hs : hs, hs);
      s.position.set(w / 2 + i * hw, this.laneTop + laneH * 0.12);
      this.horizon.addChild(s);
    }
    const horizonTop = this.laneTop - hz.h * hs;
    const hazeTop = this.laneTop - hz.h * hs * 0.62;
    this.haze.position.set(0, hazeTop);
    this.haze.setSize(w, this.laneTop - hazeTop);

    // ground: from just under the horizon's foot to the bottom of the screen
    const gs = k * 1.15;
    this.ground.position.set(0, groundY);
    this.ground.setSize(w, Math.max(1, h - groundY));
    this.ground.tileScale.set(gs);
    this.ground.tilePosition.set(w / 2, 0);

    // path along the lane
    const pa = m.images.path!;
    const ps = laneH / pa.h;
    path.position.set(0, this.laneTop);
    path.setSize(w, laneH);
    path.tileScale.set(ps);
    path.tilePosition.set(w / 2, 0);

    // wisps drift across the upper sky
    this.drift.forEach(({ s }, i) => {
      s.scale.set(k * (0.9 + (i % 3) * 0.25) * (i % 2 ? -1 : 1), k * (0.9 + (i % 3) * 0.25));
      s.position.set(((i * 0.23 + 0.1) % 1) * w, Math.max(h * 0.16, horizonTop) - (i % 3) * 0.06 * h + (i % 2) * 0.04 * h);
    });

    // props at the bottom edges, under the lane
    this.front.removeChildren().forEach((c) => c.destroy());
    for (const [name, x, hpt, mirror] of PROPS[this.kit.id] ?? []) {
      const fr = m.frames[name];
      if (!fr) continue;
      const s = new Sprite(this.kit.frame(name));
      const sc = (hpt * (k / (390 / 1340))) / fr.h;
      s.anchor.set(0.5, 1);
      s.scale.set(mirror ? -sc : sc, sc);
      s.position.set(x * w, Math.min(L.uiTop + hpt * 0.35 * (k / 0.291), this.laneBottom + 14 + fr.h * sc));
      s.tint = 0xb8b8c8;
      this.front.addChild(s);
    }
  }

  /**
   * The era scene: distant, midground and ground keep the registration they were painted with, on one canvas whose
   * `laneY` row is the ground line; mirrored copies cover any width (the sources' left and right edges differ).
   */
  private layoutLayers(L: WorldLayout) {
    const { w, h, groundY, k } = L;
    const m = this.kit.manifest;
    const ly = this.layers!;
    const g = m.images.ground!;
    const [cw, ch] = g.canvas ?? [g.w, g.h];
    const cs = (SCENE_WIDTH * k) / cw; // screen px per canvas px
    const top = groundY - (g.laneY ?? 0) * cs;
    const row = (c: Container, key: string, y: number) => {
      c.removeChildren().forEach((x) => x.destroy());
      const n = Math.ceil((w / (cw * cs) - 1) / 2) + 1;
      for (let i = -n; i <= n; i++) {
        const s = new Sprite(this.kit.image(key));
        s.anchor.set(0.5, 0);
        s.scale.set(i % 2 ? -cs : cs, cs);
        s.position.set(w / 2 + i * cw * cs, y);
        c.addChild(s);
      }
    };
    row(ly.distant, 'distant', top + (m.images.distant!.y ?? 0) * cs);
    row(ly.midground, 'midground', top + (m.images.midground!.y ?? 0) * cs);
    row(ly.ground, 'ground', top + (g.y ?? 0) * cs);
    // below the painted canvas: the fill continues the ground's near rows (its tile starts with them mirrored)
    const fill = m.images.fill!;
    const fs = cs * (g.w / (fill.w / 2)); // the fill was cut at a lower resolution than the ground layer
    const bottom = top + ch * cs - 2;
    this.ground.position.set(0, bottom);
    this.ground.setSize(w, Math.max(1, h - bottom));
    this.ground.tileScale.set(fs);
    this.ground.tilePosition.set(w / 2, -(fill.h / 2) * fs);
    // foreground strip: its top edge on the lane's lower edge, so it frames the lane without covering a troop
    row(ly.foreground, 'foreground', this.laneBottom);
    // the era's neutral prop stands behind the lane
    this.props.removeChildren().forEach((c) => c.destroy());
    for (const [name, x, hpt] of BACK_PROPS[this.kit.id] ?? []) {
      const fr = m.frames[name];
      if (!fr) continue;
      const s = new Sprite(this.kit.frame(name));
      const sc = (hpt * (k / (390 / 1340))) / fr.h;
      s.anchor.set(0.5, 1);
      s.scale.set(sc);
      s.position.set(x * w, this.laneTop + 4);
      s.tint = 0xc8c8d0;
      this.props.addChild(s);
    }
  }

  update(dtMs: number) {
    const dt = dtMs / 1000;
    for (const d of this.drift) {
      d.s.x += d.v * dt;
      const half = Math.abs(d.s.width) / 2;
      if (d.s.x - half > this.w + 10) d.s.x = -half - 10;
    }
  }

  destroy() {
    this.back.destroy({ children: true });
    this.front.destroy({ children: true });
  }
}

const HAZE: Record<string, string> = { eldritch: '#4d4796', future: '#4f5c9c' };

/** A 1 × 128 vertical ramp (transparent → 62 %, eased) for the haze; one tiny texture per colour. */
const hazeCache = new Map<string, Texture>();
function hazeTexture(col: string): Texture {
  let t = hazeCache.get(col);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 128;
    const g = c.getContext('2d')!;
    for (let y = 0; y < 128; y++) {
      const f = (y + 1) / 128;
      g.globalAlpha = 0.62 * f * f;
      g.clearRect(0, y, 1, 1);
      g.fillStyle = col;
      g.fillRect(0, y, 1, 1);
    }
    t = Texture.from(c);
    hazeCache.set(col, t);
  }
  return t;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
