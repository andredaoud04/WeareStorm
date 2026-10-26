import { describe, expect, it } from 'vitest';
import { makeCamera, rankSpread } from '../../src/render/pixi/camera';

describe('camera (GDD Reconciliation 1b)', () => {
  it('shows x in [-170, 1170] on a 390-wide phone with no stretching', () => {
    const c = makeCamera({ w: 390, h: 844, uiTop: 700 });
    expect(c.ptPerWu).toBeCloseTo(390 / 1340);
    expect(c.sx(-170)).toBeCloseTo(0, 0);
    expect(c.sx(1170)).toBeCloseTo(390, 0);
    expect(c.sy(150)).toBeCloseTo(150 * c.ptPerWu);
  });

  it('clamps the scale so iPads get bigger troops and more world, never a stretched lane', () => {
    const c = makeCamera({ w: 1024, h: 1366, uiTop: 1150 });
    expect(c.ptPerWu).toBe(0.467);
    expect(c.halfWidthWu).toBeGreaterThan(670);
    expect(makeCamera({ w: 320, h: 568, uiTop: 420 }).ptPerWu).toBe(0.27);
  });

  it('puts the ground a clamped band above the bottom UI', () => {
    expect(makeCamera({ w: 390, h: 844, uiTop: 700 }).groundY).toBeCloseTo(700 - 126.6);
    expect(makeCamera({ w: 390, h: 300, uiTop: 220 }).groundY).toBe(220 - 56);
    expect(makeCamera({ w: 820, h: 2000, uiTop: 1800 }).groundY).toBe(1800 - 170);
  });

  it('fans a stack of same-side troops back from the front so a crowd reads as a crowd', () => {
    const units = [
      { id: 1, side: 'player' as const, x: 400 },
      { id: 2, side: 'player' as const, x: 403 },
      { id: 3, side: 'player' as const, x: 405 },
      { id: 4, side: 'enemy' as const, x: 600 },
      { id: 5, side: 'enemy' as const, x: 600 },
    ];
    const s = rankSpread(units);
    expect(s.get(3)!.dx).toBe(0); // the front-most player unit leads
    expect(new Set([s.get(1)!.dx, s.get(2)!.dx])).toEqual(new Set([-16, -32]));
    expect(s.get(4)!.dx).toBe(0);
    expect(s.get(5)!.dx).toBe(16); // enemies fan back toward their own base (+x)
    for (const v of s.values()) expect(Math.abs(v.depth)).toBeLessThanOrEqual(30);
  });
});
