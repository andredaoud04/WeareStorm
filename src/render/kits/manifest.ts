/**
 * The kit manifest written by tools/art/build_kits.py (public/art/<kit>/manifest.json) and the pure rules the
 * renderer applies to it. No Pixi here, so it is unit-tested in node.
 */
export interface FrameDef {
  atlas: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Anchor in frame pixels (feet for units, ground anchor for bases, pivot for parts/effects); may lie outside. */
  ax: number;
  ay: number;
  /** Units: the pixel height of the role's nominal figure (soldier/tank/boss reference), for world scaling. */
  nominalH?: number;
  /** Units: muzzle / casting point in frame pixels (source faces right). */
  muzzle?: [number, number];
  /** Effects: world size (wu along the longest side) overriding the scene's default for that effect. */
  size?: number;
  /** Effects: 'normal' for solid objects (a sling stone, an arrow); glows are additive. */
  blend?: 'add' | 'normal';
  /** Projectiles: false when the shot has no muzzle flash (sling, bow, thrown grenade). */
  flash?: boolean;
}

export interface ImageDef {
  file: string;
  w: number;
  h: number;
  focus?: [number, number];
  repeat?: 'x' | 'xy';
  cell?: number;
  cols?: number;
  order?: string[];
  /** Layered worlds: top of this layer on the shared scene canvas (output px), and that canvas's size. */
  y?: number;
  canvas?: [number, number];
  /** Layered worlds (ground layer): the canvas row the troops' feet stand on. */
  laneY?: number;
}

export interface UnitEntry {
  frame: string;
  white: string;
  debris: string[];
  name: string;
  /** How a close-combat troop strikes: a swing (default, slash effect) or a point-blank 'shot' (muzzle flash). */
  strike?: 'swing' | 'shot';
}

export interface KitManifest {
  kit: string;
  title: string;
  schema: number;
  /**
   * The battle world: absent for the atlas kits (sky, horizon band, path strip, ground tile); 'layers' for the era
   * packs (sky plus the authored distant / midground / ground layers on one canvas, a foreground strip and a fill).
   */
  world?: 'layers';
  atlases: Record<string, { file: string; w: number; h: number }[]>;
  frames: Record<string, FrameDef>;
  images: Record<string, ImageDef>;
  /** `${role}.${faction}`: melee/ranged/tank × storm/ember, plus warlord.ember. */
  units: Record<string, UnitEntry>;
  /** `${faction}.${state}` → frame name. */
  bases: Record<string, string>;
  /** Base texture pixels that the runtime draws at BASE_HEIGHT (src/render/kits/sizes.ts). */
  baseRefHeight: number;
  baseAlignmentApplied: boolean;
  sources: Record<string, string>;
}

export type BaseState = 'intact' | 'damaged' | 'critical' | 'ruins';
export const BASE_STATES: readonly BaseState[] = ['intact', 'damaged', 'critical', 'ruins'];

/** Damage state from the base's HP fraction: intact > 66 %, damaged > 33 %, critical > 0, ruins at 0 or once collapsed. */
export function baseState(hpFrac: number, collapsed = false): BaseState {
  if (collapsed || hpFrac <= 0) return 'ruins';
  if (hpFrac > 0.66) return 'intact';
  if (hpFrac > 0.33) return 'damaged';
  return 'critical';
}

export type Faction = 'storm' | 'ember';
export const factionOf = (side: 'player' | 'enemy'): Faction => (side === 'player' ? 'storm' : 'ember');

/** The manifest entry for a unit: Warlords only exist in the Ember colours, so both sides share that sprite. */
export function unitEntry(m: KitManifest, role: 'melee' | 'ranged' | 'tank' | 'warlord', faction: Faction): UnitEntry {
  const e = role === 'warlord' ? m.units['warlord.ember'] : m.units[`${role}.${faction}`];
  if (!e) throw new Error(`kit ${m.kit} has no ${role}.${faction}`);
  return e;
}

/** The full-size images a kit's battle world is drawn from (the loader fetches exactly these). */
export function worldImages(m: Pick<KitManifest, 'world'>): string[] {
  return m.world === 'layers' ? ['sky', 'distant', 'midground', 'ground', 'foreground', 'fill'] : ['sky', 'horizon', 'path', 'ground'];
}

/** Checks what the loader relies on, so a stale or hand-edited manifest fails loudly instead of drawing nothing. */
export function validateManifest(m: KitManifest): string[] {
  const errs: string[] = [];
  if (m.schema !== 1) errs.push(`schema ${m.schema} (expected 1)`);
  for (const role of ['melee', 'ranged', 'tank'] as const)
    for (const f of ['storm', 'ember'] as const) {
      const e = m.units[`${role}.${f}`];
      if (!e) errs.push(`missing unit ${role}.${f}`);
      else for (const n of [e.frame, e.white, ...e.debris]) if (!m.frames[n]) errs.push(`missing frame ${n}`);
    }
  if (!m.units['warlord.ember']) errs.push('missing warlord');
  for (const f of ['storm', 'ember'] as const)
    for (const s of BASE_STATES) {
      const n = m.bases[`${f}.${s}`];
      if (!n || !m.frames[n]) errs.push(`missing base ${f}.${s}`);
    }
  for (const k of worldImages(m)) if (!m.images[k]) errs.push(`missing image ${k}`);
  if (m.world === 'layers' && m.images.ground?.laneY === undefined) errs.push('ground layer has no laneY');
  for (const [n, fr] of Object.entries(m.frames)) {
    const pages = m.atlases[fr.atlas];
    const page = pages?.[fr.page];
    if (!page) errs.push(`${n}: no page ${fr.atlas}[${fr.page}]`);
    else if (fr.x < 0 || fr.y < 0 || fr.x + fr.w > page.w || fr.y + fr.h > page.h) errs.push(`${n}: outside its page`);
  }
  return errs;
}
