import { describe, expect, it } from 'vitest';
import { SHAKE, TRAUMA, Trauma, coverScale, noise1 } from '../../src/render/pixi/trauma';

describe('trauma shake (ART_BIBLE §5.15)', () => {
  it('adds trauma per source, caps it at 1 and decays it at 1.6/s', () => {
    const t = new Trauma();
    t.add(TRAUMA.baseHit);
    expect(t.value).toBeCloseTo(0.15);
    t.add(TRAUMA.collapse);
    t.add(TRAUMA.collapse);
    expect(t.value).toBe(1);
    t.update(0.25);
    expect(t.value).toBeCloseTo(1 - 0.4);
    t.update(10);
    expect(t.value).toBe(0);
    t.add(-1);
    expect(t.value).toBe(0);
  });

  it('scales the offset with trauma squared and never exceeds 7 pt / 0.8°', () => {
    const t = new Trauma();
    expect(t.sample(1.234)).toEqual({ x: 0, y: 0, angle: 0 });
    t.value = 1;
    let maxX = 0;
    let maxA = 0;
    for (let i = 0; i < 2000; i++) {
      const s = t.sample(i * 0.0071);
      maxX = Math.max(maxX, Math.abs(s.x), Math.abs(s.y));
      maxA = Math.max(maxA, Math.abs(s.angle));
    }
    expect(maxX).toBeLessThanOrEqual(SHAKE.maxOffset);
    expect(maxX).toBeGreaterThan(SHAKE.maxOffset * 0.6); // it really shakes at full trauma
    expect(maxA).toBeLessThanOrEqual((SHAKE.maxAngleDeg * Math.PI) / 180 + 1e-9);
    const half = new Trauma();
    half.value = 0.5;
    const a = half.sample(0.37);
    t.value = 1;
    const b = t.sample(0.37);
    expect(a.x).toBeCloseTo(b.x * 0.25); // trauma² : 0.5² = 0.25
    expect(half.envelope().x).toBeCloseTo(SHAKE.maxOffset * 0.25);
  });

  it('uses smooth, deterministic noise in [-1, 1] that moves at ~18 Hz', () => {
    for (let x = -5; x < 5; x += 0.013) {
      const n = noise1(x, 3);
      expect(n).toBeGreaterThanOrEqual(-1);
      expect(n).toBeLessThanOrEqual(1);
      expect(noise1(x, 3)).toBe(n);
      // continuous: a tiny step changes the value a little
      expect(Math.abs(noise1(x + 0.001, 3) - n)).toBeLessThan(0.01);
    }
    expect(noise1(0.5, 1)).not.toBe(noise1(0.5, 2)); // one stream per axis
  });

  it('zooms just enough to hide the canvas edge while shaken', () => {
    expect(coverScale(390, 844, 0, 0, 0)).toBe(1);
    const k = coverScale(390, 844, 7, 7, (0.8 * Math.PI) / 180);
    expect(k).toBeGreaterThan(1);
    expect(k).toBeLessThan(1.08);
    // the shifted, rotated, zoomed screen rectangle still contains every screen corner
    const angle = (0.8 * Math.PI) / 180;
    for (const [cx, cy] of [[-195, -422], [195, -422], [-195, 422], [195, 422]] as const) {
      // corner in the layer's own frame: undo the translation, rotation and zoom
      const px = cx - 7;
      const py = cy - 7;
      const lx = (px * Math.cos(-angle) - py * Math.sin(-angle)) / k;
      const ly = (px * Math.sin(-angle) + py * Math.cos(-angle)) / k;
      expect(Math.abs(lx)).toBeLessThanOrEqual(195 + 1e-6);
      expect(Math.abs(ly)).toBeLessThanOrEqual(422 + 1e-6);
    }
  });
});
