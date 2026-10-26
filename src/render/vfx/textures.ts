import type { Texture } from 'pixi.js';
import { bakeParts, L, S, type PartDef, type Prim } from '../art/painter';
import { AGE_PALETTE, FACTION } from '../art/palette';

/**
 * VFX sprites (ART_BIBLE §5.11), baked once per scale with the same painter as the troops, so effects share the
 * ink outline and cel shading of the world. White prims are tinted per use (faction rings, Stormcall).
 */
const prim = (shape: Prim['shape'], fill: Prim['fill'], extra: Partial<Prim> = {}): Prim => ({ shape, fill, ...extra });

function star(r: number, inner: number): Prim['shape'] {
  const pts: number[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? inner : r;
    pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return S.poly(pts, 2);
}

const DEFS: Record<string, PartDef> = {
  puff: { prims: [prim(S.circle(0, 0, 20), '#F7F9FC', { light: true })] },
  puffDark: { prims: [prim(S.circle(0, 0, 20), '#C9C2B4')] },
  spark: { prims: [prim(star(18, 6), '#FFF3A6')] },
  sparkHeavy: { prims: [prim(star(26, 8), '#FFB23D', { light: true }), prim(star(12, 4), '#FFF3A6', { noInk: true, shade: false })] },
  coin: {
    prims: [
      prim(S.circle(0, 0, 14), '#FFCF3D', { light: true }),
      prim(S.circle(0, 0, 9), '#F5B82E', { noInk: true, shade: false }),
      prim(S.poly([2, -8, -5, 1, -1, 1, -3, 8, 5, -1, 1, -1], 1), '#FFF3C4', { noInk: true, flat: true }),
    ],
  },
  pebble: { prims: [prim(S.ellipse(0, 0, 9, 8), '#9AA3B5', { light: true })] },
  ring: { prims: [{ shape: { path: (() => { const p = new Path2D(); p.ellipse(0, 0, 44, 12, 0, 0, Math.PI * 2); return p; })(), box: [-46, -14, 46, 14] }, fill: '#FFFFFF', stroke: 6 }] },
  smear: {
    prims: [
      prim(S.svg('M -40 -10 Q 0 -54 44 -18 Q 10 -36 -40 -10 Z', [-42, -56, 46, -8]), '#FFFFFF', { flat: true }),
    ],
  },
  scorch: { prims: [prim(S.ellipse(0, 0, 60, 14), '#3B3550', { flat: true })] },
  crack: {
    prims: [
      { shape: { path: L.line(-60, 0, -36, -4, -20, 3, 0, -2, 22, 4, 40, -3, 62, 1), box: [-62, -6, 64, 6] }, fill: '#5A3E2B', stroke: 4 },
      { shape: { path: L.line(-20, 3, -28, 10), box: [-30, 2, -18, 12] }, fill: '#5A3E2B', stroke: 3 },
      { shape: { path: L.line(22, 4, 30, 11), box: [20, 2, 32, 13] }, fill: '#5A3E2B', stroke: 3 },
    ],
  },
  confetti: { prims: [prim(S.rrect(-6, -3, 12, 6, 2), '#FFFFFF', { flat: true })] },
};

export type VfxName = keyof typeof DEFS;

let cache: { scale: number; tex: Record<string, Texture> } | null = null;

/** Fill textures by name at the given bake scale (px per wu); the ink pass is merged into one sprite per effect. */
export function vfxTextures(scale: number): Record<VfxName, Texture> {
  if (cache && Math.abs(cache.scale - scale) / scale < 0.15) return cache.tex as Record<VfxName, Texture>;
  const baked = bakeParts(DEFS, { scale, faction: FACTION.player, shadowTint: AGE_PALETTE.stone.shadowTint });
  const tex: Record<string, Texture> = {};
  for (const [k, b] of Object.entries(baked)) {
    tex[k] = b.fill;
    if (b.ink) tex[`${k}Ink`] = b.ink;
  }
  cache = { scale, tex };
  return tex as Record<VfxName, Texture>;
}

/** The ink texture behind an effect sprite, if it has one. */
export function vfxInk(scale: number, name: VfxName): Texture | undefined {
  vfxTextures(scale);
  return cache!.tex[`${name}Ink`];
}
