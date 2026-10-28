import { Container, Sprite } from 'pixi.js';
import type { Side } from '../../contracts';
import { bakeParts, L, S, type BakedPart, type PartDef, type Prim } from './painter';
import { AGE_PALETTE, FACTION, MAT } from './palette';

/**
 * Totem Camp, the Stone Age base (ART_BIBLE §5.9), drawn for the player (gate face at x = 0, base to the left);
 * the enemy copy is mirrored. Composition grid: gate x ∈ [−50, 0]; main hut centred at x = −100, width ≤ 140;
 * back props in x ∈ [−260, −170]; the faction pennant on a free-standing pole at x = −150 (top at 600 wu).
 * No cloth or flags on the architecture.
 */

const prim = (shape: Prim['shape'], fill: Prim['fill'], extra: Partial<Prim> = {}): Prim => ({ shape, fill, ...extra });

function stake(x: number, h: number): Prim {
  return prim(S.poly([x - 11, 0, x - 11, -h, x, -h - 18, x + 11, -h, x + 11, 0], 4), MAT.wood, { lines: [L.line(x - 3, -h * 0.3, x + 3, -h * 0.34)] });
}

function totemCampDefs(side: Side): Record<string, PartDef> {
  const enemy = side === 'enemy';
  return {
    palisade: { prims: [stake(-252, 150), stake(-228, 178), stake(-204, 160), stake(-180, 190), prim(S.rrect(-262, -120, 96, 16, 6), MAT.leather, { noInk: true })] },
    pole: { prims: [prim(S.capsule(0, 0, 0, -600, 7), MAT.wood, { lines: [L.line(-3, -200, 3, -206), L.line(-3, -420, 3, -426)] }), prim(S.circle(0, -604, 12), MAT.bone)] },
    // pennant cloth: round tail (Storm) or notched tail (Ember)
    cloth: {
      prims: [
        prim(
          enemy
            ? S.poly([0, 0, 64, 4, 50, 22, 64, 40, 0, 44], 4)
            : S.svg('M 0 0 L 52 2 Q 72 22 52 42 L 0 44 Z', [0, 0, 70, 44]),
          'faction',
          { lines: [L.line(8, 14, 40, 16)] },
        ),
      ],
    },
    hut: {
      prims: [
        // hide-and-timber walls
        prim(S.poly([-168, 0, -32, 0, -38, -200, -162, -200], 10), '#B98A5A', { lines: [L.line(-150, -60, -48, -60), L.line(-152, -130, -46, -130), L.line(-120, -200, -122, -8), L.line(-80, -200, -78, -8)] }),
        // stitched hide patch and a doorway
        prim(S.rrect(-150, -176, 44, 52, 10), '#D7AE7C', { lines: [L.line(-148, -150, -108, -150)] }),
        prim(S.svg('M -118 0 L -118 -70 Q -98 -100 -78 -70 L -78 0 Z', [-120, -102, -76, 0]), '#3B2A22', { shade: false }),
      ],
    },
    roof: {
      prims: [
        // thatch cone with a faction-dyed band and a smoke vent
        prim(S.svg('M -196 -176 Q -150 -300 -100 -370 Q -50 -300 -4 -176 Q -100 -158 -196 -176 Z', [-198, -372, -2, -158]), '#E8C85A', { light: true, lines: [L.line(-170, -210, -100, -340), L.line(-130, -184, -100, -330), L.line(-70, -184, -100, -330), L.line(-30, -210, -100, -340)] }),
        prim(S.svg('M -182 -214 Q -100 -238 -18 -214 L -12 -196 Q -100 -222 -188 -196 Z', [-190, -240, -10, -194]), 'faction', { noInk: true }),
        prim(S.rrect(-112, -394, 24, 30, 6), MAT.wood),
      ],
    },
    gate: {
      prims: [
        // bone arch: two tusks meeting over the lane mouth
        prim(S.svg('M -50 0 L -46 -120 Q -40 -180 -14 -196 L -10 -184 Q -30 -168 -32 -120 L -36 0 Z', [-52, -198, -8, 0]), MAT.bone, { light: true, lines: [L.line(-44, -60, -36, -60), L.line(-42, -110, -34, -110)] }),
        prim(S.svg('M -2 0 L -6 -120 Q -10 -168 -30 -186 L -24 -196 Q 6 -176 8 -120 L 10 0 Z', [-32, -198, 12, 0]), MAT.bone, { light: true, lines: [L.line(-4, -60, 6, -60)] }),
        prim(S.circle(-22, -194, 12), MAT.bone),
      ],
    },
    totem: {
      prims: [
        prim(S.rrect(-226, -320, 44, 320, 12), MAT.wood, { lines: [L.line(-222, -110, -186, -110), L.line(-222, -200, -186, -200)] }),
        // painted faction face: round eyes for Storm, angular brows for Ember
        prim(S.rrect(-236, -320, 64, 78, 18), 'faction', { light: true }),
        prim(S.circle(-216, -292, 8), '#FFFFFF', { flat: true }),
        prim(S.circle(-192, -292, 8), '#FFFFFF', { flat: true }),
        prim(S.circle(-214, -290, 4), MAT.pupil, { flat: true }),
        prim(S.circle(-190, -290, 4), MAT.pupil, { flat: true }),
        ...(enemy ? [prim(S.poly([-228, -310, -204, -300, -180, -310, -180, -304, -204, -294, -228, -304]), MAT.pupil, { flat: true })] : []),
        prim(S.rrect(-218, -268, 32, 10, 5), MAT.pupil, { flat: true }),
        // carved wings
        prim(S.svg('M -236 -230 Q -270 -236 -280 -206 Q -256 -214 -236 -206 Z', [-282, -238, -234, -204]), MAT.woodLight),
        prim(S.svg('M -172 -230 Q -138 -236 -128 -206 Q -152 -214 -172 -206 Z', [-174, -238, -126, -204]), MAT.woodLight),
      ],
    },
    firepit: {
      prims: [
        prim(S.ellipse(-12, -6, 30, 12), MAT.stoneDark),
        prim(S.ellipse(-28, -10, 10, 8), MAT.stone, { light: true }),
        prim(S.ellipse(4, -10, 10, 8), MAT.stone, { light: true }),
      ],
    },
    flame: { prims: [prim(S.svg('M -12 0 Q -26 -20 -14 -44 Q -10 -28 -4 -30 Q -2 -50 8 -60 Q 10 -40 18 -32 Q 22 -16 10 0 Z', [-24, -62, 22, 0]), '#FF9A3D', { light: true }), prim(S.svg('M -6 0 Q -12 -14 -4 -26 Q 0 -16 6 -18 Q 10 -8 4 0 Z', [-12, -28, 10, 0]), '#FFE16A', { noInk: true, flat: true })] },
    crack1: { prims: [{ shape: { path: L.line(-150, -40, -132, -70, -140, -96, -124, -120), box: [-152, -122, -122, -38] }, fill: '#5A3E2B', stroke: 5 }, { shape: { path: L.line(-60, -150, -70, -172, -58, -190), box: [-72, -192, -56, -148] }, fill: '#5A3E2B', stroke: 5 }] },
    crack2: { prims: [{ shape: { path: L.line(-100, -10, -92, -44, -106, -78, -96, -110), box: [-108, -112, -90, -8] }, fill: '#4A3222', stroke: 6 }, { shape: { path: L.line(-160, -150, -140, -160, -130, -190), box: [-162, -192, -128, -148] }, fill: '#4A3222', stroke: 6 }] },
  };
}

/** Back-to-front part order. */
const ORDER = ['pole', 'cloth', 'palisade', 'totem', 'hut', 'crack1', 'crack2', 'roof', 'gate', 'firepit', 'flame'] as const;
const AT: Record<string, [number, number]> = { pole: [-150, 0], cloth: [-150, -600] };

export class BaseArt {
  readonly root = new Container();
  private ink = new Container();
  private fill = new Container();
  private parts = new Map<string, { ink: Container; fill: Container }>();
  private t = 0;
  private hp = 1;
  private collapse = -1;
  private flashUntil = 0;
  private baked: Record<string, BakedPart>;

  constructor(readonly side: Side, scale: number) {
    this.baked = bakeParts(totemCampDefs(side), { scale, faction: FACTION[side], shadowTint: AGE_PALETTE.stone.shadowTint });
    this.root.addChild(this.ink, this.fill);
    for (const name of ORDER) {
      const b = this.baked[name]!;
      const ci = new Container();
      const cf = new Container();
      const at = AT[name] ?? [0, 0];
      for (const c of [ci, cf]) c.position.set(at[0], at[1]);
      if (b.ink) {
        const s = new Sprite(b.ink);
        s.anchor.set(b.anchor.x, b.anchor.y);
        s.scale.set(1 / b.scale);
        ci.addChild(s);
      }
      const f = new Sprite(b.fill);
      f.anchor.set(b.anchor.x, b.anchor.y);
      f.scale.set(1 / b.scale);
      cf.addChild(f);
      this.ink.addChild(ci);
      this.fill.addChild(cf);
      this.parts.set(name, { ink: ci, fill: cf });
    }
  }

  private each(name: string, fn: (c: Container) => void) {
    const p = this.parts.get(name);
    if (p) {
      fn(p.ink);
      fn(p.fill);
    }
  }

  hit() {
    this.flashUntil = this.t + 90;
  }

  startCollapse() {
    if (this.collapse < 0) this.collapse = 0;
  }

  /** hp is the base's health fraction 0..1. */
  update(dt: number, hp: number) {
    this.t += dt;
    this.hp = hp;
    // damage states (§5.9): cracks under 66 % and 33 %, the roof tilts 6° under 33 %, the fire grows under 15 %
    this.each('crack1', (c) => (c.visible = hp < 0.66));
    this.each('crack2', (c) => (c.visible = hp < 0.33));
    this.each('roof', (c) => {
      c.rotation = hp < 0.33 ? -0.1 : 0;
      c.pivot.set(hp < 0.33 ? -100 : 0, hp < 0.33 ? -180 : 0);
      c.position.set(hp < 0.33 ? -100 : 0, hp < 0.33 ? -180 : 0);
    });
    const flicker = 1 + Math.sin(this.t / 70) * 0.08 + Math.sin(this.t / 31) * 0.05;
    const big = hp < 0.15 ? 1.7 : 1;
    this.each('flame', (c) => c.scale.set(big * (2 - flicker), big * flicker));
    // pennant waves
    this.each('cloth', (c) => {
      c.skew.y = Math.sin(this.t / 260) * 0.12;
      c.scale.x = 1 + Math.sin(this.t / 180) * 0.06;
    });
    const flash = this.t < this.flashUntil;
    this.fill.tint = flash ? 0xffd9c9 : 0xffffff;
    this.root.x = flash ? (this.side === 'player' ? -3 : 3) : 0;
    if (this.collapse >= 0) {
      this.collapse += dt;
      const f = Math.min(1, this.collapse / 900);
      this.each('roof', (c) => {
        c.rotation = -0.1 - f * 0.9;
        c.y = -180 + f * f * 200;
      });
      this.each('hut', (c) => (c.y = f * f * 60));
      this.each('totem', (c) => {
        c.rotation = -f * 0.35;
        c.pivot.set(-204, 0);
        c.x = -204;
      });
      this.each('pole', (c) => (c.rotation = -f * 1.2)); // the pennant pole tips over (§5.9)
      this.each('cloth', (c) => {
        c.x = -150 - Math.sin(f * 1.2) * 600;
        c.y = -600 * Math.cos(f * 1.2);
        c.rotation = -f * 1.2;
      });
      this.each('gate', (c) => (c.y = f * 40));
      this.root.alpha = f < 0.8 ? 1 : 1 - (f - 0.8) * 2;
    }
  }

  get health() {
    return this.hp;
  }

  destroy() {
    this.root.destroy({ children: true });
  }
}
