import { Rectangle, Texture } from 'pixi.js';
import { INK, lightOf, lineOf, shadowOf, type FactionPalette } from './palette';

/**
 * The painter (ART_BIBLE §5.2–5.3, §5.7; TECH §5): Canvas2D Path2D only. Every part is authored in world units with
 * its joint pivot at (0, 0) and baked into three textures on a shared atlas:
 *   ink   the silhouette stroked 16 wu wide in ink (an 8 wu outer outline once the fill sits on top)
 *   fill  flat colour + one cel-shadow crescent (bottom-right) + optional highlight + 4 wu inner lines
 *   white the fill silhouette in white, for the 80 ms hit flash (texture swap, no extra sprites)
 * A rig draws all ink sprites behind all fill sprites, so one outline wraps the whole body.
 */

export type Box = [number, number, number, number]; // x0, y0, x1, y1 (wu)

export interface Shape {
  path: Path2D;
  box: Box;
}

const box = (x0: number, y0: number, x1: number, y1: number): Box => [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];

/** Shape builders. All coordinates in wu, y down (negative = up). */
export const S = {
  ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0): Shape {
    const p = new Path2D();
    p.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
    const r = Math.max(rx, ry);
    return { path: p, box: rot ? box(cx - r, cy - r, cx + r, cy + r) : box(cx - rx, cy - ry, cx + rx, cy + ry) };
  },
  circle(cx: number, cy: number, r: number): Shape {
    return S.ellipse(cx, cy, r, r);
  },
  rrect(x: number, y: number, w: number, h: number, r: number): Shape {
    const p = new Path2D();
    p.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
    return { path: p, box: box(x, y, x + w, y + h) };
  },
  /** Line segment thickened to a capsule (limbs, handles). */
  capsule(x1: number, y1: number, x2: number, y2: number, r: number): Shape {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const p = new Path2D();
    p.arc(x1, y1, r, a + Math.PI / 2, a - Math.PI / 2);
    p.arc(x2, y2, r, a - Math.PI / 2, a + Math.PI / 2);
    p.closePath();
    return { path: p, box: box(Math.min(x1, x2) - r, Math.min(y1, y2) - r, Math.max(x1, x2) + r, Math.max(y1, y2) + r) };
  },
  /** Polygon with every corner rounded by `r` (chunky cartoon shapes, never razor corners). */
  poly(pts: number[], r = 0): Shape {
    const p = new Path2D();
    const n = pts.length / 2;
    const pt = (i: number) => [pts[((i + n) % n) * 2]!, pts[((i + n) % n) * 2 + 1]!] as const;
    if (r <= 0) {
      p.moveTo(pts[0]!, pts[1]!);
      for (let i = 1; i < n; i++) p.lineTo(pts[i * 2]!, pts[i * 2 + 1]!);
    } else {
      const [sx, sy] = pt(0);
      const [px, py] = pt(-1);
      p.moveTo((sx + px) / 2, (sy + py) / 2);
      for (let i = 0; i < n; i++) {
        const [cx, cy] = pt(i);
        const [nx, ny] = pt(i + 1);
        p.arcTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2, r);
      }
    }
    p.closePath();
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      x0 = Math.min(x0, pts[i * 2]!);
      x1 = Math.max(x1, pts[i * 2]!);
      y0 = Math.min(y0, pts[i * 2 + 1]!);
      y1 = Math.max(y1, pts[i * 2 + 1]!);
    }
    return { path: p, box: [x0, y0, x1, y1] };
  },
  /** An SVG path string with an author-supplied bounding box. */
  svg(d: string, b: Box): Shape {
    return { path: new Path2D(d), box: b };
  },
};

/** Open stroke paths for inner detail lines. */
export const L = {
  line(...pts: number[]): Path2D {
    const p = new Path2D();
    p.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i]!, pts[i + 1]!);
    return p;
  },
  curve(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number): Path2D {
    const p = new Path2D();
    p.moveTo(x1, y1);
    p.quadraticCurveTo(cx, cy, x2, y2);
    return p;
  },
  arc(cx: number, cy: number, r: number, a0: number, a1: number): Path2D {
    const p = new Path2D();
    p.arc(cx, cy, r, a0, a1);
    return p;
  },
};

/** 'faction' resolves to the side's colour at bake time (ART_BIBLE §5.4). */
export type Fill = string | 'faction' | 'factionShadow' | 'factionLight';

export interface Prim {
  shape: Shape;
  fill: Fill;
  /** Cel crescent (default true). */
  shade?: boolean;
  /** Highlight blob for round/shiny materials. */
  light?: boolean;
  /** Hard specular dot for metal. */
  spec?: boolean;
  lines?: Path2D[];
  lineWidth?: number;
  /** Line colour override (default: the fill's dark tone). */
  lineColor?: string;
  /** Excluded from the ink silhouette (details that sit fully inside another prim). */
  noInk?: boolean;
  /** Flat colour, no crescent, no outline: eyes, mouths, decals. */
  flat?: boolean;
  /** Draw the path as a stroke of this width instead of filling it (closed eyes, smiles). Implies flat. */
  stroke?: number;
}

export interface PartDef {
  prims: Prim[];
}

export interface BakedPart {
  ink: Texture | null;
  fill: Texture;
  white: Texture;
  /** Anchor (0..1) that puts the joint pivot (0, 0) at the sprite's origin. */
  anchor: { x: number; y: number };
  /** Bake scale (px per wu): sprites are scaled by 1/scale. */
  scale: number;
}

export interface BakeOptions {
  scale: number; // px per wu
  faction: FactionPalette;
  shadowTint: string;
}

const INK_W = 16; // stroke width under the fill → 8 wu visible outline
const PAD = 10;

function resolve(f: Fill, fac: FactionPalette): string {
  return f === 'faction' ? fac.base : f === 'factionShadow' ? fac.shadow : f === 'factionLight' ? fac.light : f;
}

function partBox(def: PartDef): Box {
  let b: Box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of def.prims) {
    const [x0, y0, x1, y1] = p.shape.box;
    b = [Math.min(b[0], x0), Math.min(b[1], y0), Math.max(b[2], x1), Math.max(b[3], y1)];
  }
  return [b[0] - PAD, b[1] - PAD, b[2] + PAD, b[3] + PAD];
}

function drawInk(ctx: CanvasRenderingContext2D, def: PartDef) {
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.lineWidth = INK_W;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const p of def.prims) {
    if (p.noInk || p.flat || p.stroke) continue;
    ctx.stroke(p.shape.path);
    ctx.fill(p.shape.path);
  }
}

function drawFill(ctx: CanvasRenderingContext2D, def: PartDef, o: BakeOptions) {
  for (const p of def.prims) {
    const base = resolve(p.fill, o.faction);
    const path = p.shape.path;
    const [x0, y0, x1, y1] = p.shape.box;
    const w = x1 - x0;
    const h = y1 - y0;
    if (p.stroke) {
      ctx.strokeStyle = base;
      ctx.lineWidth = p.stroke;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke(path);
      continue;
    }
    if (p.flat) {
      ctx.fillStyle = base;
      ctx.fill(path);
      continue;
    }
    if (p.shade === false) {
      ctx.fillStyle = base;
      ctx.fill(path);
    } else {
      // crescent: the shape in its shadow tone, then the same shape shifted toward the light in the base tone
      ctx.fillStyle = shadowOf(base, o.shadowTint);
      ctx.fill(path);
      ctx.save();
      ctx.clip(path);
      ctx.translate(-0.16 * w, -0.12 * h);
      ctx.fillStyle = base;
      ctx.fill(path);
      ctx.restore();
    }
    if (p.light || p.spec) {
      ctx.save();
      ctx.clip(path);
      if (p.light) {
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = lightOf(base);
        ctx.beginPath();
        ctx.ellipse(x0 + 0.32 * w, y0 + 0.27 * h, 0.2 * w, 0.13 * h, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (p.spec) {
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.ellipse(x0 + 0.26 * w, y0 + 0.22 * h, Math.max(3, 0.06 * w), Math.max(2.5, 0.045 * h), -0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (p.lines?.length) {
      ctx.save();
      ctx.clip(path);
      ctx.strokeStyle = p.lineColor ?? lineOf(base);
      ctx.lineWidth = p.lineWidth ?? 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const l of p.lines) ctx.stroke(l);
      ctx.restore();
    }
  }
}

function drawWhite(ctx: CanvasRenderingContext2D, def: PartDef) {
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#FFFFFF';
  for (const p of def.prims) {
    if (p.stroke) {
      ctx.lineWidth = p.stroke;
      ctx.stroke(p.shape.path);
    } else ctx.fill(p.shape.path);
  }
}

/** Shelf-packed atlas pages (≤ 2048², TECH §5). One page per bake call keeps a whole army in one batch. */
class Atlas {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private x = 1;
  private y = 1;
  private rowH = 0;
  constructor(readonly size = 2048) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d')!;
  }
  alloc(w: number, h: number): { x: number; y: number } | null {
    if (this.x + w + 1 > this.size) {
      this.x = 1;
      this.y += this.rowH + 2;
      this.rowH = 0;
    }
    if (this.y + h + 1 > this.size) return null;
    const at = { x: this.x, y: this.y };
    this.x += w + 2;
    this.rowH = Math.max(this.rowH, h);
    return at;
  }
}

/**
 * Bakes a set of parts into one atlas texture and returns per-part textures. Throws if the set does not fit one
 * 2048² page (keep sets per unit family small enough).
 */
export function bakeParts(defs: Record<string, PartDef>, o: BakeOptions): Record<string, BakedPart> {
  const s = o.scale;
  const atlas = new Atlas(nextPow2(estimate(defs, s)));
  const frames: Record<string, { ink: Rectangle | null; fill: Rectangle; white: Rectangle; anchor: { x: number; y: number } }> = {};
  for (const [name, def] of Object.entries(defs)) {
    const [x0, y0, x1, y1] = partBox(def);
    const w = Math.ceil((x1 - x0) * s);
    const h = Math.ceil((y1 - y0) * s);
    const draw = (fn: (c: CanvasRenderingContext2D) => void): Rectangle => {
      const at = atlas.alloc(w, h);
      if (!at) throw new Error(`atlas full while baking ${name}`);
      const c = atlas.ctx;
      c.save();
      c.beginPath();
      c.rect(at.x, at.y, w, h);
      c.clip();
      c.translate(at.x - x0 * s, at.y - y0 * s);
      c.scale(s, s);
      fn(c);
      c.restore();
      return new Rectangle(at.x, at.y, w, h);
    };
    const hasInk = def.prims.some((p) => !p.noInk && !p.flat && !p.stroke);
    frames[name] = {
      ink: hasInk ? draw((c) => drawInk(c, def)) : null,
      fill: draw((c) => drawFill(c, def, o)),
      white: draw((c) => drawWhite(c, def)),
      anchor: { x: (-x0 * s) / w, y: (-y0 * s) / h },
    };
  }
  const base = Texture.from(atlas.canvas);
  const sub = (r: Rectangle) => new Texture({ source: base.source, frame: r });
  const out: Record<string, BakedPart> = {};
  for (const [name, f] of Object.entries(frames)) {
    out[name] = { ink: f.ink ? sub(f.ink) : null, fill: sub(f.fill), white: sub(f.white), anchor: f.anchor, scale: s };
  }
  return out;
}

function estimate(defs: Record<string, PartDef>, s: number): number {
  let area = 0;
  for (const def of Object.values(defs)) {
    const [x0, y0, x1, y1] = partBox(def);
    area += 3 * ((x1 - x0) * s + 2) * ((y1 - y0) * s + 2);
  }
  return Math.min(2048, Math.max(256, Math.sqrt(area * 1.6)));
}

const nextPow2 = (n: number) => Math.pow(2, Math.ceil(Math.log2(n)));

/** Bakes a single free-drawn picture (backgrounds, bases, props) into its own texture at `scale` px per wu. */
export function bakePicture(b: Box, scale: number, draw: (ctx: CanvasRenderingContext2D) => void): { texture: Texture; anchor: { x: number; y: number } } {
  const [x0, y0, x1, y1] = b;
  const w = Math.max(1, Math.ceil((x1 - x0) * scale));
  const h = Math.max(1, Math.ceil((y1 - y0) * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.translate(-x0, -y0);
  draw(ctx);
  return { texture: Texture.from(c), anchor: { x: -x0 / (x1 - x0), y: -y0 / (y1 - y0) } };
}

/** Draws one layer of a part directly onto a 2D context (portraits, previews). */
export function paintLayer(ctx: CanvasRenderingContext2D, def: PartDef, layer: 'ink' | 'fill', o: Omit<BakeOptions, 'scale'>) {
  if (layer === 'ink') drawInk(ctx, def);
  else drawFill(ctx, def, { ...o, scale: 1 });
}

/** Draws a part set directly (no atlas): used by pictures that reuse part definitions (bases, props). */
export function paintPart(ctx: CanvasRenderingContext2D, def: PartDef, o: Omit<BakeOptions, 'scale'>) {
  drawInk(ctx, def);
  drawFill(ctx, def, { ...o, scale: 1 });
}
