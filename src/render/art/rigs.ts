import type { Side } from '../../contracts';
import { L, S, type PartDef, type Prim } from './painter';
import { MAT } from './palette';

/**
 * Rig definitions (ART_BIBLE §5.6–5.7). A rig is a tree of parts; each part is drawn with its joint pivot at (0, 0),
 * y negative = up, facing +x. `at` places a part's joint in its parent's space. The renderer builds two trees from
 * one spec (ink behind, fill in front) and animates both identically.
 */

export type FaceKind = 'neutral' | 'blink' | 'fierce' | 'ouch' | 'ko' | 'cheer';
export const FACES: FaceKind[] = ['neutral', 'blink', 'fierce', 'ouch', 'ko', 'cheer'];

export interface RigNode {
  name: string;
  at: [number, number];
  children?: RigNode[];
  /** Part drawn only in the fill tree (faces). */
  fillOnly?: boolean;
}

export interface RigSpec {
  id: string;
  kind: 'biped' | 'quad';
  height: number; // standing height, wu
  legLen: number; // hip to sole, wu (walk swing is derived from it, §5.8)
  stride: number;
  root: RigNode;
  defs: Record<string, PartDef>;
  /** Name of the arm that swings the weapon, and of the face container. */
  weaponArm: string;
  head: string;
  ranged?: boolean;
  /** Parts that fly off on a break death (tanks). */
  breakParts?: string[];
  /** Render scale and x offset (wu) so oversized bosses meet the fight at their sim front edge. */
  scale?: number;
  offsetX?: number;
}

// ---------------------------------------------------------------------------------------------------------------
// Shared biped pieces

const prim = (shape: Prim['shape'], fill: Prim['fill'], extra: Partial<Prim> = {}): Prim => ({ shape, fill, ...extra });

function leg(len: number, r: number, pants: Prim['fill']): PartDef {
  return {
    prims: [
      prim(S.capsule(0, 0, 0, len - 10, r), pants, { lines: [L.line(-r * 0.6, len * 0.45, r * 0.5, len * 0.42)] }),
      prim(S.ellipse(r * 0.45, len - 5, r + 3, 6.5), MAT.leather, { light: true }),
    ],
  };
}

function arm(len: number, r: number, skin: string, sleeve?: string): PartDef {
  const prims: Prim[] = [prim(S.capsule(0, 0, 2, len - 8, r), skin)];
  if (sleeve) prims.push(prim(S.capsule(0, 0, 1, len * 0.38, r + 1.5), sleeve));
  prims.push(prim(S.circle(3, len - 4, r + 0.5), skin, { light: true }));
  return { prims };
}

/** Faces sit on the head in head space; flat shapes, no outline (§5.6). `fierceBias` tilts enemy brows (rival look). */
function faces(ex: number, ey: number, scale = 1): Record<string, PartDef> {
  const k = scale;
  const eye = (x: number, y: number, s: number): Prim[] => [
    prim(S.ellipse(x, y, 5 * k * s, 6 * k * s), MAT.eyeWhite, { flat: true }),
    prim(S.ellipse(x + 1.5 * k, y + 0.8 * k, 2.6 * k * s, 3.6 * k * s), MAT.pupil, { flat: true }),
    prim(S.circle(x + 0.4 * k, y - 1.6 * k, 1.1 * k * s), MAT.eyeWhite, { flat: true }),
  ];
  const e1: [number, number] = [ex, ey];
  const e2: [number, number] = [ex + 13 * k, ey + 0.5 * k];
  const brow = (x: number, y: number, tilt: number) => prim(S.capsule(x - 5 * k, y - tilt * k, x + 5 * k, y + tilt * k, 1.6 * k), MAT.pupil, { flat: true });
  const mouth = (open: boolean, smile: boolean): Prim => {
    const mx = ex + 8 * k;
    const my = ey + 16 * k;
    if (open) {
      return prim(S.svg(`M ${mx - 6 * k} ${my - 2 * k} Q ${mx} ${my - 4 * k} ${mx + 7 * k} ${my - 2 * k} Q ${mx + 4 * k} ${my + 8 * k} ${mx - 1 * k} ${my + 7 * k} Q ${mx - 6 * k} ${my + 4 * k} ${mx - 6 * k} ${my - 2 * k} Z`, [mx - 7 * k, my - 5 * k, mx + 8 * k, my + 9 * k]), MAT.mouth, { flat: true });
    }
    const p = smile ? L.curve(mx - 5 * k, my, mx, my + 4 * k, mx + 5 * k, my - 1 * k) : L.curve(mx - 4 * k, my + 1 * k, mx, my + 2 * k, mx + 4 * k, my);
    return { shape: { path: p, box: [mx - 7 * k, my - 3 * k, mx + 7 * k, my + 5 * k] }, fill: MAT.pupil, stroke: 3.2 * k };
  };
  const closed = (x: number, y: number): Prim => ({ shape: { path: L.curve(x - 5 * k, y + 1 * k, x, y - 3 * k, x + 5 * k, y + 1 * k), box: [x - 6 * k, y - 4 * k, x + 6 * k, y + 3 * k] }, fill: MAT.pupil, stroke: 3.4 * k });
  const cross = (x: number, y: number): Prim[] => [
    prim(S.capsule(x - 4 * k, y - 4 * k, x + 4 * k, y + 4 * k, 1.6 * k), MAT.pupil, { flat: true }),
    prim(S.capsule(x - 4 * k, y + 4 * k, x + 4 * k, y - 4 * k, 1.6 * k), MAT.pupil, { flat: true }),
  ];
  return {
    face_neutral: { prims: [...eye(...e1, 1), ...eye(...e2, 0.9), brow(e1[0], e1[1] - 10 * k, 0.3), brow(e2[0], e2[1] - 10 * k, -0.3), mouth(false, false)] },
    face_blink: { prims: [closed(...e1), closed(...e2), brow(e1[0], e1[1] - 10 * k, 0.3), brow(e2[0], e2[1] - 10 * k, -0.3), mouth(false, false)] },
    face_fierce: { prims: [...eye(...e1, 1), ...eye(...e2, 0.9), brow(e1[0], e1[1] - 9 * k, 1.8), brow(e2[0], e2[1] - 9 * k, 1.8), mouth(true, false)] },
    face_ouch: { prims: [closed(...e1), closed(...e2), brow(e1[0], e1[1] - 10 * k, -1.4), brow(e2[0], e2[1] - 10 * k, 1.4), mouth(true, false)] },
    face_ko: { prims: [...cross(...e1), ...cross(...e2), mouth(true, false)] },
    face_cheer: { prims: [closed(e1[0], e1[1] + 1), closed(e2[0], e2[1] + 1), brow(e1[0], e1[1] - 11 * k, -0.6), brow(e2[0], e2[1] - 11 * k, 0.6), mouth(true, true)] },
  };
}

const faceNodes = (): RigNode[] => FACES.map((f) => ({ name: `face_${f}`, at: [0, 0] as [number, number], fillOnly: true }));

// ---------------------------------------------------------------------------------------------------------------
// Stone Age troops

function stoneHead(opts: { hair: string; skin: string; band?: 'faction' | null; bone?: boolean; feather?: boolean; helm?: boolean }): PartDef {
  const prims: Prim[] = [];
  if (opts.feather) {
    prims.push(prim(S.svg('M -16 -54 Q -34 -86 -20 -96 Q -10 -80 -10 -56 Z', [-36, -98, -8, -52]), 'faction', { lines: [L.curve(-12, -58, -20, -76, -21, -92)] }));
  }
  // ear (on the far side), head, nose
  prims.push(prim(S.ellipse(-14, -27, 7, 9), opts.skin));
  prims.push(prim(S.ellipse(4, -30, 31, 30), opts.skin, { light: true }));
  prims.push(prim(S.ellipse(33, -24, 7, 6), opts.skin, { light: true }));
  if (opts.helm) {
    // beast-skull helmet: bone cap with horns and dark eye sockets (Rockhide)
    prims.push(prim(S.svg('M -26 -36 Q -26 -66 4 -68 Q 34 -66 36 -38 L 30 -32 Q 4 -40 -22 -30 Z', [-28, -70, 38, -28]), MAT.bone, { light: true, lines: [L.curve(-14, -50, 4, -58, 24, -50)] }));
    prims.push(prim(S.svg('M -20 -56 Q -44 -62 -48 -84 Q -36 -74 -18 -66 Z', [-50, -86, -16, -54]), MAT.bone));
    prims.push(prim(S.svg('M 26 -58 Q 48 -66 50 -88 Q 40 -76 22 -66 Z', [20, -90, 52, -56]), MAT.bone));
  } else {
    // messy hair tuft: the Stone Age headgear silhouette
    prims.push(prim(S.svg('M -27 -22 Q -34 -48 -14 -60 Q -6 -72 10 -64 Q 24 -70 30 -56 Q 38 -50 32 -42 Q 20 -50 6 -46 Q -8 -48 -14 -40 Q -18 -30 -27 -22 Z', [-35, -72, 38, -20]), opts.hair, { lines: [L.curve(-14, -54, -2, -60, 8, -54), L.curve(4, -62, 16, -60, 24, -52)] }));
  }
  if (opts.band) prims.push(prim(S.svg('M -27 -38 Q 4 -50 34 -40 L 33 -33 Q 4 -42 -26 -31 Z', [-28, -50, 35, -30]), 'faction', { noInk: true }));
  if (opts.bone) {
    prims.push(prim(S.capsule(-10, -64, 14, -72, 3.4), MAT.bone, { noInk: false }));
    prims.push(prim(S.circle(-11, -61, 4.2), MAT.bone));
    prims.push(prim(S.circle(-12, -67, 4.2), MAT.bone));
    prims.push(prim(S.circle(15, -69, 4.2), MAT.bone));
    prims.push(prim(S.circle(14, -75, 4.2), MAT.bone));
  }
  return { prims };
}

function tunic(w: number, h: number, hem = true): PartDef {
  const hw = w / 2;
  const prims: Prim[] = [
    prim(S.poly([-hw, 2, hw + 2, 2, hw - 2, -h + 2, -hw + 3, -h], 10), 'faction', { lines: [L.curve(-hw + 8, -h * 0.55, 0, -h * 0.45, hw - 6, -h * 0.58)] }),
  ];
  if (hem) {
    const pts: number[] = [];
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const x = -hw - 2 + ((w + 6) * i) / n;
      pts.push(x, i % 2 ? 9 : 2);
    }
    pts.push(hw + 4, -6, -hw - 2, -6);
    prims.push(prim(S.poly(pts, 2), MAT.fur, { lines: [L.line(-hw + 4, -2, -hw + 10, 4), L.line(hw - 10, -2, hw - 4, 4)] }));
  }
  // leather strap across the chest
  prims.push(prim(S.poly([-hw + 4, -h + 6, -hw + 13, -h + 2, hw - 2, -10, hw - 9, -4], 3), MAT.leather, { noInk: true }));
  return { prims };
}

function biped(id: string, o: { torso: PartDef; head: PartDef; weapon: PartDef; weaponAt: [number, number]; ranged?: boolean; tank?: boolean; shield?: PartDef; mantle?: PartDef; cape?: PartDef }): RigSpec {
  const tank = !!o.tank;
  const legLen = tank ? 52 : 46;
  const torsoH = tank ? 92 : 46;
  const skin = MAT.skin[0];
  const defs: Record<string, PartDef> = {
    legBack: leg(legLen, tank ? 12 : 9, 'factionShadow'),
    legFront: leg(legLen, tank ? 12 : 9, 'factionShadow'),
    armBack: arm(tank ? 44 : 36, tank ? 9.5 : 7.5, skin, tank ? MAT.fur : undefined),
    armFront: arm(tank ? 44 : 36, tank ? 9.5 : 7.5, skin, tank ? MAT.fur : undefined),
    torso: o.torso,
    head: o.head,
    weapon: o.weapon,
    ...faces(12, -33, tank ? 1.05 : 1),
  };
  if (o.shield) defs.shield = o.shield;
  if (o.mantle) defs.mantle = o.mantle;
  if (o.cape) defs.cape = o.cape;
  const sx = tank ? 22 : 12;
  const shoulderY = tank ? -torsoH + 18 : -36;
  const neckY = tank ? -torsoH + 4 : -42;
  const armFrontChildren: RigNode[] = [{ name: 'weapon', at: o.weaponAt }];
  const root: RigNode = {
    name: 'root',
    at: [0, 0],
    children: [
      { name: 'legBack', at: [-7, -legLen] },
      {
        name: 'torsoPivot',
        at: [0, -legLen],
        children: [
          ...(o.cape ? [{ name: 'cape', at: [-6, shoulderY - 4] as [number, number] }] : []),
          { name: 'armBack', at: [-sx, shoulderY] },
          { name: 'torso', at: [0, 0] },
          ...(o.mantle ? [{ name: 'mantle', at: [0, -torsoH + 6] as [number, number] }] : []),
          { name: 'head', at: [2, neckY], children: faceNodes() },
          { name: 'armFront', at: [sx, shoulderY], children: armFrontChildren },
          ...(o.shield ? [{ name: 'shield', at: [sx + 18, shoulderY + 30] as [number, number] }] : []),
        ],
      },
      { name: 'legFront', at: [7, -legLen] },
    ],
  };
  return {
    id,
    kind: 'biped',
    height: tank ? 200 : 150,
    legLen,
    stride: tank ? 40 : 28,
    root,
    defs,
    weaponArm: 'armFront',
    head: 'head',
    ranged: o.ranged,
    breakParts: tank ? ['head', 'shield', 'weapon'] : undefined,
  };
}

/** Clubber: hide tunic, messy hair with a bone, a club bigger than its head. */
export function clubber(): RigSpec {
  return biped('stone.clubber', {
    torso: tunic(48, 48),
    // a short hide cape in the faction colour, hanging behind the shoulders (team read, §5.3 rule 7)
    cape: { prims: [prim(S.svg('M 6 -4 Q -18 -8 -26 16 Q -32 32 -28 44 L -20 38 L -16 46 L -8 38 L 0 44 Q 4 20 6 -4 Z', [-33, -10, 8, 47]), 'faction', { lines: [L.curve(-8, 4, -16, 20, -14, 36)] })] },
    head: stoneHead({ hair: MAT.hair[0], skin: MAT.skin[0], bone: true, band: 'faction' }),
    weaponAt: [3, 32],
    weapon: {
      prims: [
        prim(S.capsule(0, 10, 2, -40, 5.5), MAT.wood, { lines: [L.line(-2, -6, 3, -10), L.line(-2, -22, 3, -26)] }),
        prim(S.capsule(0, 4, 1, -14, 6.5), 'faction', { lines: [L.line(-4, -2, 5, -4), L.line(-4, -8, 5, -10)] }),
        prim(S.svg('M -14 -40 Q -20 -70 0 -84 Q 22 -88 22 -62 Q 22 -44 8 -36 Q -6 -32 -14 -40 Z', [-20, -88, 23, -32]), MAT.woodLight, { light: true, lines: [L.arc(4, -60, 5, 0.3, 2.6), L.curve(-8, -48, -4, -44, 2, -46)] }),
        prim(S.poly([16, -70, 30, -74, 20, -62], 2), MAT.stoneLight),
        prim(S.poly([-12, -64, -24, -72, -14, -54], 2), MAT.stoneLight),
      ],
    },
  });
}

/** Slinger: lean, feather in the hair, a long staff-sling held level (the ranged silhouette line). */
export function slinger(): RigSpec {
  return biped('stone.slinger', {
    torso: tunic(44, 48),
    head: stoneHead({ hair: MAT.hair[1], skin: MAT.skin[0], feather: true, band: 'faction' }),
    weaponAt: [3, 32],
    ranged: true,
    weapon: {
      prims: [
        prim(S.capsule(-22, 4, 62, -6, 3.6), MAT.wood, { lines: [L.line(0, -2, 0, 3)] }),
        prim(S.svg('M 58 -8 Q 70 2 74 16 Q 66 22 60 14 Q 58 6 58 -8 Z', [56, -10, 76, 24]), MAT.leather),
        prim(S.circle(68, 16, 7.5), MAT.stone, { light: true }),
      ],
    },
  });
}

/** Rockhide: wide and heavy, beast-skull helmet, fur mantle, a stone slab shield with the faction emblem. */
export function rockhide(side: Side = 'player'): RigSpec {
  return biped('stone.rockhide', {
    tank: true,
    torso: {
      prims: [
        prim(S.poly([-34, 2, 36, 2, 40, -60, 30, -88, -30, -90, -38, -58], 14), 'faction', { lines: [L.curve(-26, -40, 0, -32, 30, -42)] }),
        prim(S.rrect(-30, -22, 62, 12, 5), MAT.leather, { noInk: true }),
        prim(S.circle(4, -16, 6), MAT.bone, { noInk: true }),
      ],
    },
    mantle: {
      prims: [prim(S.svg('M -42 6 Q -50 -18 -24 -26 Q 2 -36 30 -26 Q 52 -18 46 8 Q 36 0 26 8 Q 14 -2 2 8 Q -10 -2 -20 8 Q -30 -2 -42 6 Z', [-52, -36, 52, 10]), MAT.fur, { lines: [L.curve(-30, -10, -24, -4, -18, -12), L.curve(10, -12, 16, -4, 22, -12)] })],
    },
    head: stoneHead({ hair: MAT.hair[0], skin: MAT.skin[0], helm: true }),
    weaponAt: [3, 40],
    weapon: {
      prims: [
        prim(S.capsule(0, 8, 0, -34, 5), MAT.wood),
        prim(S.poly([-14, -30, 16, -36, 22, -52, -2, -60, -18, -48], 6), MAT.stoneDark, { light: true }),
      ],
    },
    shield: {
      prims: [
        prim(S.poly([-24, -58, 22, -64, 30, 30, 20, 50, -22, 52, -30, 24], 14), MAT.stone, { light: true, lines: [L.line(-14, -30, -4, -18, -10, -4), L.line(12, 10, 20, 24)] }),
        // faction emblem: round sun for Storm, angular chevron for Ember (§5.4: shape, not only colour)
        ...(side === 'player'
          ? [prim(S.circle(0, -2, 16), 'faction', { noInk: true }), prim(S.circle(0, -2, 8), 'factionLight', { noInk: true, shade: false })]
          : [prim(S.poly([-16, -14, 0, 4, 16, -14, 16, 2, 0, 20, -16, 2], 2), 'faction', { noInk: true })]),
      ],
    },
  });
}

/** Chief Grumbo: a woolly mammoth (2.5×) with the chief riding on a faction blanket. */
export function grumbo(): RigSpec {
  const skin = MAT.skin[1];
  const defs: Record<string, PartDef> = {
    qLegBackFar: { prims: [prim(S.rrect(-22, 0, 44, 96, 20), MAT.mammothDark), prim(S.rrect(-24, 80, 48, 22, 10), MAT.mammothDark, { lines: [L.line(-10, 92, -10, 100), L.line(4, 92, 4, 100)] })] },
    qLegFrontFar: { prims: [prim(S.rrect(-22, 0, 44, 96, 20), MAT.mammothDark), prim(S.rrect(-24, 80, 48, 22, 10), MAT.mammothDark)] },
    qLegBack: { prims: [prim(S.rrect(-24, 0, 48, 98, 22), MAT.mammoth, { light: true }), prim(S.rrect(-26, 82, 52, 22, 10), MAT.mammoth, { lines: [L.line(-10, 94, -10, 102), L.line(6, 94, 6, 102)] })] },
    qLegFront: { prims: [prim(S.rrect(-24, 0, 48, 98, 22), MAT.mammoth, { light: true }), prim(S.rrect(-26, 82, 52, 22, 10), MAT.mammoth, { lines: [L.line(-10, 94, -10, 102), L.line(6, 94, 6, 102)] })] },
    body: {
      prims: [
        prim(S.svg('M -150 -10 Q -170 -90 -110 -140 Q -30 -190 70 -160 Q 140 -130 140 -50 Q 140 10 90 20 Q 0 40 -90 30 Q -146 22 -150 -10 Z', [-170, -190, 142, 40]), MAT.mammoth, { light: true, lines: [L.curve(-120, -60, -100, -40, -110, -10), L.curve(40, -150, 60, -120, 50, -90)] }),
        // shaggy fur fringe along the belly
        prim(S.svg('M -140 0 L -126 28 L -112 10 L -96 34 L -80 14 L -60 36 L -40 16 L -20 38 L 0 18 L 20 38 L 40 16 L 60 34 L 78 14 L 96 28 L 110 6 Q 20 20 -140 0 Z', [-142, -4, 112, 40]), MAT.mammothDark, { noInk: true }),
        // faction blanket and saddle
        prim(S.svg('M -96 -152 Q -10 -182 74 -150 L 86 -40 Q 0 -22 -104 -40 Z', [-106, -184, 88, -22]), 'faction', { lines: [L.curve(-94, -60, -6, -44, 82, -60), L.curve(-90, -120, -6, -140, 78, -118)] }),
        prim(S.svg('M -104 -42 L -88 -18 L -72 -40 L -56 -16 L -40 -38 L -24 -14 L -8 -36 L 8 -14 L 24 -36 L 40 -16 L 56 -38 L 72 -18 L 86 -42 Z', [-106, -44, 88, -12]), 'factionLight', { noInk: true }),
        prim(S.rrect(-50, -178, 90, 30, 12), MAT.leather, { light: true }),
      ],
    },
    qHead: {
      prims: [
        prim(S.svg('M -40 -40 Q -30 -96 30 -98 Q 84 -90 86 -34 Q 86 6 60 20 Q 20 34 -14 16 Q -40 0 -40 -40 Z', [-42, -100, 88, 34]), MAT.mammoth, { light: true, lines: [L.curve(10, -84, 30, -74, 50, -82)] }),
        // hair tuft on the crown
        prim(S.svg('M -10 -88 Q 0 -122 20 -100 Q 32 -126 44 -98 Q 60 -112 62 -86 Z', [-12, -126, 64, -84]), MAT.mammothDark),
        // eye with an angry brow, glowing (boss)
        prim(S.ellipse(42, -44, 9, 10), '#FFE16A', { flat: true }),
        prim(S.ellipse(45, -43, 4, 6), MAT.pupil, { flat: true }),
        prim(S.capsule(28, -62, 58, -54, 4), MAT.pupil, { flat: true }),
      ],
    },
    ear: { prims: [prim(S.svg('M 0 0 Q -40 -10 -46 30 Q -40 64 0 56 Q 14 30 0 0 Z', [-48, -6, 10, 64]), MAT.mammothDark, { lines: [L.curve(-30, 14, -36, 30, -26, 46)] })] },
    tusk: { prims: [prim(S.svg('M 0 0 Q 50 20 70 -30 Q 74 -44 66 -46 Q 56 6 4 -14 Z', [0, -48, 76, 22]), MAT.tusk, { light: true, lines: [L.curve(14, -4, 30, 0, 44, -10)] })] },
    trunk1: { prims: [prim(S.capsule(0, 0, 6, 40, 17), MAT.mammoth, { lines: [L.line(-10, 14, 10, 12), L.line(-9, 26, 12, 24)] })] },
    trunk2: { prims: [prim(S.capsule(0, 0, 4, 34, 13), MAT.mammoth, { lines: [L.line(-8, 12, 9, 11), L.line(-7, 22, 10, 21)] })] },
    trunk3: { prims: [prim(S.svg('M -10 0 L 10 0 Q 14 22 26 26 Q 30 38 16 38 Q -6 34 -10 0 Z', [-12, -2, 32, 40]), MAT.mammoth)] },
    // the chief
    riderTorso: tunic(50, 52),
    riderHead: {
      prims: [
        // bone-and-feather crown in faction colours: the boss headgear
        prim(S.svg('M -30 -50 L -36 -96 L -20 -66 L -12 -108 L 0 -70 L 12 -112 L 20 -70 L 32 -100 L 34 -50 Z', [-38, -114, 36, -48]), 'faction', { lines: [L.line(-12, -70, -12, -100), L.line(12, -70, 12, -104)] }),
        ...stoneHead({ hair: MAT.hair[0], skin, band: null }).prims,
        prim(S.svg('M -30 -46 Q 4 -60 36 -46 L 34 -36 Q 4 -48 -28 -36 Z', [-32, -60, 37, -34]), MAT.bone, { lines: [L.line(-14, -50, -14, -42), L.line(4, -53, 4, -45), L.line(20, -50, 20, -42)] }),
        // beard
        prim(S.svg('M 4 -8 Q 8 22 30 20 Q 40 6 34 -10 Q 20 -2 4 -8 Z', [2, -12, 40, 22]), MAT.hair[0]),
      ],
    },
    riderArm: arm(40, 8.5, skin, MAT.fur),
    riderArmBack: arm(40, 8.5, skin, MAT.fur),
    weapon: {
      prims: [
        prim(S.capsule(0, 10, 2, -56, 7), MAT.wood),
        prim(S.svg('M -22 -56 Q -30 -100 0 -116 Q 32 -120 32 -84 Q 32 -58 12 -50 Q -10 -44 -22 -56 Z', [-30, -120, 33, -44]), MAT.woodLight, { light: true, lines: [L.arc(4, -84, 7, 0.3, 2.6)] }),
        prim(S.poly([24, -96, 44, -102, 30, -84], 2), MAT.bone),
        prim(S.poly([-20, -88, -38, -98, -24, -74], 2), MAT.bone),
        prim(S.poly([4, -112, 8, -132, 16, -112], 2), MAT.bone),
      ],
    },
    ...faces(12, -33, 1.1),
  };
  const root: RigNode = {
    name: 'root',
    at: [0, 0],
    children: [
      { name: 'qLegBackFar', at: [-96, -112] },
      { name: 'qLegFrontFar', at: [70, -112] },
      {
        name: 'bodyPivot',
        at: [0, -104],
        children: [
          { name: 'body', at: [0, 0] },
          {
            name: 'riderPivot',
            at: [-14, -168],
            children: [
              { name: 'riderArmBack', at: [-18, -40] },
              { name: 'riderTorso', at: [0, 0] },
              { name: 'head', at: [4, -48], children: faceNodes() },
              { name: 'riderArm', at: [18, -40], children: [{ name: 'weapon', at: [3, 36] }] },
            ],
          },
          {
            name: 'qHead',
            at: [120, -80],
            children: [
              { name: 'ear', at: [-6, -64] },
              { name: 'trunk1', at: [70, -6], children: [{ name: 'trunk2', at: [6, 40], children: [{ name: 'trunk3', at: [4, 32] }] }] },
              { name: 'tusk', at: [52, 0] },
            ],
          },
        ],
      },
      { name: 'qLegBack', at: [-80, -104] },
      { name: 'qLegFront', at: [86, -104] },
    ],
  };
  // riderArmBack's shoulder sits on the rider; keep it simple: parented to the body at the rider's shoulder height
  defs.head = defs.riderHead!;
  delete defs.riderHead;
  // The mammoth is ~400 wu long; its sim body is 210. Scale it down a little and shift it back so the trunk tip,
  // not the middle of the body, meets the fight at the sim front edge (+105).
  return { id: 'stone.grumbo', kind: 'quad', height: 380, legLen: 104, stride: 56, root, defs, weaponArm: 'riderArm', head: 'head', breakParts: ['tusk', 'weapon', 'ear'], scale: 0.86, offsetX: -78 };
}

export const STONE_RIGS: Record<string, (side: Side) => RigSpec> = {
  'stone.clubber': clubber,
  'stone.slinger': slinger,
  'stone.rockhide': rockhide,
  'stone.grumbo': grumbo,
};
