import type { Graphics } from 'pixi.js';
import type { Role, Side } from '../../contracts';
import { faction } from '../../ui/style/tokens';

/**
 * Placeholder figures for slice 1C, drawn as vectors in world units with the y axis pointing down (feet at y = 0,
 * the head at negative y), facing +x. Slice 1D replaces these with the baked clean-cartoon rigs; the scene only
 * relies on the sizes exported here.
 */

export const INK = 0x1d1830;
const SKIN = [0xf7d0a8, 0xe0a77c, 0xa9704e];
const hex = (s: string) => Number.parseInt(s.slice(1), 16);

export const STONE = {
  skyTop: '#6EC6F5',
  skyHorizon: '#FFE6B0',
  sunGlow: '#FFF3C4',
  far: 0xa7c4e0,
  mid: 0x79bf5a,
  near: 0x5da845,
  lane: 0xd9a86a,
  laneDark: 0xb5824e,
  fgProp: 0x3f8f3c,
  thatch: 0xe8c85a,
  wood: 0x9b6a3f,
  shadow: 0x4b3d7a,
} as const;

export function sideColors(side: Side) {
  const f = faction[side];
  return { base: hex(f.base), shadow: hex(f.shadow), light: hex(f.light) };
}

/** Standing height of each role in wu (used for HP bars, numbers and hit sparks). */
export const HEIGHT: Record<Role, number> = { melee: 150, ranged: 138, tank: 176, warlord: 330 };

export interface FigureStyle {
  side: Side;
  role: Role;
  variant: number;
  /** Draw as a flat white silhouette (hit flash). */
  white?: boolean;
}

/** Legs are drawn separately so the walk cycle can swing them. */
export function drawLeg(g: Graphics, role: Role, white = false) {
  const w = role === 'warlord' ? 34 : role === 'tank' ? 20 : 15;
  const h = role === 'warlord' ? 70 : role === 'tank' ? 34 : 30;
  g.roundRect(-w / 2, 0, w, h, w / 2).fill(white ? 0xffffff : 0x6b4428);
  if (!white) g.stroke({ width: 6, color: INK });
}

export function drawFigure(g: Graphics, s: FigureStyle) {
  const c = sideColors(s.side);
  const w = !!s.white;
  const fill = (col: number) => (w ? 0xffffff : col);
  const ink = () => {
    if (!w) g.stroke({ width: 7, color: INK, join: 'round' });
  };
  const skin = SKIN[s.variant % SKIN.length]!;
  if (s.role === 'warlord') {
    // Chief on a woolly mammoth (placeholder): big round body, trunk, tusks, the chief riding on top.
    g.ellipse(0, -130, 150, 105).fill(fill(0x8a5a3b));
    ink();
    g.ellipse(-30, -150, 110, 70).fill(fill(0xa36b3f));
    g.circle(118, -150, 62).fill(fill(0x8a5a3b));
    ink();
    g.roundRect(150, -150, 34, 110, 17).fill(fill(0x8a5a3b));
    ink();
    g.moveTo(140, -120).quadraticCurveTo(205, -100, 196, -40).lineTo(176, -46).quadraticCurveTo(178, -96, 128, -106).fill(fill(0xf7f9fc));
    ink();
    g.circle(132, -170, 9).fill(fill(INK));
    // rider
    g.roundRect(-40, -310, 80, 90, 26).fill(fill(c.base));
    ink();
    g.circle(0, -335, 38).fill(fill(skin));
    ink();
    g.poly([-36, -360, -20, -400, -6, -364, 6, -364, 20, -400, 36, -360]).fill(fill(0xf2eAD8));
    ink();
    g.circle(18, -338, 6).fill(fill(INK));
    g.roundRect(30, -330, 22, 120, 11).fill(fill(0xa36b3f));
    ink();
    g.circle(41, -335, 26).fill(fill(0xa36b3f));
    ink();
    return;
  }
  const scale = s.role === 'tank' ? 1.3 : s.role === 'ranged' ? 0.92 : 1;
  const bw = 54 * scale;
  const bh = 62 * scale;
  const top = -30 * scale - bh;
  // body (tunic in faction colour) with a darker belt band
  g.roundRect(-bw / 2, top, bw, bh, 16 * scale).fill(fill(c.base));
  ink();
  if (!w) {
    g.roundRect(-bw / 2 + 4, top + bh * 0.62, bw - 8, 9 * scale, 4).fill(c.shadow);
    g.roundRect(-bw / 2 + 8, top + 8, bw * 0.34, bh * 0.3, 8).fill({ color: 0xffffff, alpha: 0.22 });
  }
  // head
  const hr = 26 * scale;
  const hy = top - hr + 6;
  g.circle(4, hy, hr).fill(fill(skin));
  ink();
  if (!w) {
    // hair tuft, eye and brow facing +x
    g.poly([-hr + 2, hy - 6, -hr * 0.4, hy - hr - 8, hr * 0.4, hy - hr - 2, hr * 0.2, hy - hr * 0.55]).fill(0x3b2a22);
    g.circle(4 + hr * 0.45, hy - 2, 4.5 * scale).fill(INK);
    g.roundRect(4 + hr * 0.2, hy - 12 * scale, 14 * scale, 4, 2).fill(INK);
  }
  // role prop
  if (s.role === 'melee') {
    g.roundRect(bw / 2 - 6, top + 6, 16, 70, 8).fill(fill(0xa36b3f));
    ink();
    g.circle(bw / 2 + 2, top + 4, 17).fill(fill(0xa36b3f));
    ink();
  } else if (s.role === 'ranged') {
    g.moveTo(bw / 2 - 4, top + 20).lineTo(bw / 2 + 26, top - 18).stroke({ width: 5, color: w ? 0xffffff : 0x8a5a3b });
    g.circle(bw / 2 + 28, top - 22, 10).fill(fill(0x9aa3b5));
    ink();
  } else {
    // a big stone shield in front: tanks read as a wall
    g.roundRect(bw / 2 - 18, top - 4, 34, bh + 20, 14).fill(fill(0x9aa3b5));
    ink();
    if (!w) g.roundRect(bw / 2 - 12, top + 4, 10, bh, 5).fill({ color: 0xffffff, alpha: 0.25 });
  }
}

/** Totem Camp placeholder, drawn for the player side (x ≤ 0, gate at x = 0). The enemy copy is mirrored. */
export function drawBase(g: Graphics, side: Side) {
  const c = sideColors(side);
  // back palisade
  for (let i = 0; i < 7; i++) {
    const x = -250 + i * 28;
    g.poly([x, 0, x, -150 - (i % 2) * 18, x + 12, -172 - (i % 2) * 18, x + 24, -150 - (i % 2) * 18, x + 24, 0]).fill(STONE.wood);
    g.stroke({ width: 6, color: INK, join: 'round' });
  }
  // hut body
  g.roundRect(-170, -190, 140, 190, 18).fill(0xb98a5a);
  g.stroke({ width: 7, color: INK });
  // thatch roof with a faction band
  g.poly([-196, -170, -100, -300, -4, -170]).fill(STONE.thatch);
  g.stroke({ width: 7, color: INK, join: 'round' });
  g.poly([-178, -192, -100, -276, -22, -192, -36, -176, -100, -248, -164, -176]).fill(c.base);
  // door
  g.roundRect(-122, -96, 44, 96, 20).fill(0x3b2a22);
  // bone-arch gate at the lane edge
  g.moveTo(-46, 0).lineTo(-46, -110).quadraticCurveTo(-24, -150, -2, -110).lineTo(-2, 0).stroke({ width: 16, color: 0xf2ead8, cap: 'round' });
  g.moveTo(-46, 0).lineTo(-46, -110).quadraticCurveTo(-24, -150, -2, -110).lineTo(-2, 0).stroke({ width: 5, color: INK, cap: 'round' });
  // totem pole with the faction face, the side's emblem
  g.roundRect(-232, -250, 40, 250, 10).fill(0xa36b3f);
  g.stroke({ width: 6, color: INK });
  g.roundRect(-238, -250, 52, 52, 14).fill(c.base);
  g.stroke({ width: 6, color: INK });
  g.circle(-222, -228, 6).fill(INK);
  g.circle(-202, -228, 6).fill(INK);
  g.roundRect(-224, -214, 24, 7, 3).fill(INK);
}
