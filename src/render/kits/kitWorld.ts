import { Container, Graphics, Sprite, TilingSprite } from 'pixi.js';
import type { Kit } from './loader';
import { LANE_HEIGHT } from './sizes';

/**
 * The kit's world behind the troops: the portrait sky cover-fitted to the screen (its planet kept in view), drifting
 * wisps/ion clouds, the horizon band standing on the lane, the basalt/ash ground below, the path strip along the lane,
 * and a few props at the bottom edges, below the lane so they never cover a troop. Layers are re-laid out on resize;
 * textures come from the kit (nothing is repainted).
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
  private haze = new Graphics();
  private ground: TilingSprite;
  private path: TilingSprite;
  private drift: { s: Sprite; v: number }[] = [];
  private w = 0;
  laneTop = 0;
  laneBottom = 0;

  constructor(readonly kit: Kit) {
    this.sky.texture = kit.image('sky');
    this.ground = new TilingSprite({ texture: kit.image('ground') });
    this.path = new TilingSprite({ texture: kit.image('path') });
    // the far scenery sits back: a touch darker so the troops pop against it
    this.horizon.tint = 0xc4c4d6;
    this.ground.tint = 0x9a9aae;
    this.back.addChild(this.sky, this.clouds, this.horizon, this.haze, this.ground, this.path);
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
    const bands = 28;
    this.haze.clear();
    for (let i = 0; i < bands; i++) {
      const f = (i + 1) / bands;
      const y0 = hazeTop + ((this.laneTop - hazeTop) * i) / bands;
      this.haze.rect(0, y0, w, (this.laneTop - hazeTop) / bands + 1).fill({ color: HAZE[this.kit.id] ?? 0x4b4a8f, alpha: 0.62 * f * f });
    }

    // ground: from just under the horizon's foot to the bottom of the screen
    const gs = k * 1.15;
    this.ground.position.set(0, groundY);
    this.ground.setSize(w, Math.max(1, h - groundY));
    this.ground.tileScale.set(gs);
    this.ground.tilePosition.set(w / 2, 0);

    // path along the lane
    const pa = m.images.path!;
    const ps = laneH / pa.h;
    this.path.position.set(0, this.laneTop);
    this.path.setSize(w, laneH);
    this.path.tileScale.set(ps);
    this.path.tilePosition.set(w / 2, 0);

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

const HAZE: Record<string, number> = { eldritch: 0x4d4796, future: 0x4f5c9c };

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
