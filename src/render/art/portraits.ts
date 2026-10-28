import { signal } from '@preact/signals';
import type { Side } from '../../contracts';
import { paintLayer } from './painter';
import { AGE_PALETTE, FACTION } from './palette';
import { STONE_RIGS, type RigNode, type RigSpec } from './rigs';

/**
 * Unit portraits for the DOM (deck cards, Army roster, Ages). Each rig is painted straight onto a 2D canvas in its
 * idle pose with the same painter as the battle sprites (ink pass, then fill pass), so there is no GPU readback and
 * no second WebGL context (TECH §5). Bake tier ~1.4 px per wu × DPR.
 */
export const portraits = signal<Record<string, string>>({});

/** Idle pose overrides: the same rest angles the battle animator uses. */
function pose(spec: RigSpec): Record<string, { rot?: number; scale?: number }> {
  const arm = spec.weaponArm;
  if (spec.ranged) return { [arm]: { rot: -1.05 }, weapon: { rot: 1.05 } };
  return { [arm]: { rot: -0.4 }, weapon: { rot: 1.0 }, riderPivot: { scale: 1.3 }, riderArmBack: { rot: 0.4 } };
}

export function paintRig(spec: RigSpec, side: Side, pxPerWu: number): string {
  return paintRigCanvas(spec, side, pxPerWu).toDataURL('image/png');
}

/** The posed rig on a canvas; `factionOverride` swaps the faction colours (art:lint keys them out). */
export function paintRigCanvas(spec: RigSpec, side: Side, pxPerWu: number, factionOverride?: string): HTMLCanvasElement {
  const tall = spec.kind === 'quad' ? 470 : spec.height + 40;
  const wide = spec.kind === 'quad' ? 520 : spec.height * 1.25;
  const c = document.createElement('canvas');
  c.width = Math.ceil(wide * pxPerWu);
  c.height = Math.ceil(tall * pxPerWu);
  const ctx = c.getContext('2d')!;
  const fac = factionOverride ? { base: factionOverride, shadow: factionOverride, light: factionOverride } : FACTION[side];
  const o = { faction: fac, shadowTint: AGE_PALETTE.stone.shadowTint };
  const overrides = pose(spec);
  const k = spec.scale ?? 1;
  for (const layer of ['ink', 'fill'] as const) {
    ctx.save();
    ctx.scale(pxPerWu, pxPerWu);
    ctx.translate(wide * 0.45 - (spec.offsetX ?? 0) * k * 0.3, tall - 12);
    ctx.scale(k, k);
    const walk = (n: RigNode) => {
      ctx.save();
      ctx.translate(n.at[0], n.at[1]);
      const ov = overrides[n.name];
      if (ov?.rot) ctx.rotate(ov.rot);
      if (ov?.scale) ctx.scale(ov.scale, ov.scale);
      const def = spec.defs[n.name];
      const isFace = n.name.startsWith('face_');
      if (def && (!isFace || n.name === 'face_neutral') && !(layer === 'ink' && n.fillOnly)) paintLayer(ctx, def, layer, o);
      for (const ch of n.children ?? []) walk(ch);
      ctx.restore();
    };
    walk(spec.root);
    ctx.restore();
  }
  return c;
}

export function bakePortraits() {
  const res = Math.min(2, globalThis.devicePixelRatio || 1);
  const out: Record<string, string> = {};
  for (const [id, make] of Object.entries(STONE_RIGS)) {
    try {
      out[id] = paintRig(make('player'), 'player', 1.4 * res);
    } catch (e) {
      console.warn(`portrait bake failed for ${id}`, e); // the cards fall back to role icons
    }
  }
  portraits.value = out;
}
