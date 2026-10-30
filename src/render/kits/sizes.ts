import type { Role } from '../../contracts';

/**
 * World sizes of the kit art, in world units (wu). The reference phone (390 pt wide) shows 0.291 pt per wu, so
 * 1 pt ≈ 3.44 wu there; tablets show more pt per wu and everything grows with the lane. Collision widths stay in
 * src/data (sprites overlap a little, by design). Tune here; the art tool only decides pixel density.
 */
export const REF_PT_PER_WU = 390 / 1340;
export const pt = (points: number) => points / REF_PT_PER_WU;

/** Height of each role's nominal figure (the art tool's reference height, ≈ the standing figure). */
export const ROLE_HEIGHT: Readonly<Record<Role, number>> = {
  melee: pt(76),
  ranged: pt(76),
  tank: pt(112),
  warlord: pt(186),
};

/** Visible height of the intact base (every damage state shares its scale). */
export const BASE_HEIGHT = pt(205);
/** World x of each base's ground anchor, relative to the lane end it guards (0 for the player, 1000 for the enemy). */
export const BASE_INSET = 25;

/** Layered (era-pack) worlds: the width of the painted scene canvas; it is mirror-repeated past that. */
export const SCENE_WIDTH = pt(820);

/** Lane band: the path strip's screen height, centred on the ground line. */
export const LANE_HEIGHT = pt(62);

/** How far the rank-spread depth offset moves a unit up/down the lane (fraction of its depth in wu). */
export const DEPTH_Y = 0.85;
