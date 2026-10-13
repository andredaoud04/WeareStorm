import { describe, expect, it } from 'vitest';
import { uiScale, color } from '../src/ui/style/tokens';
import { AGE_ORDER, TICK_MS, TICKS_PER_SECOND } from '../src/contracts';

describe('foundation', () => {
  it('has six Ages in the locked order', () => {
    expect(AGE_ORDER).toEqual(['stone', 'ancient', 'medieval', 'gunpowder', 'industrial', 'future']);
  });
  it('runs the sim at 20 Hz', () => {
    expect(TICK_MS * TICKS_PER_SECOND).toBe(1000);
  });
  it('clamps UI scale between SE and iPad', () => {
    expect(uiScale(375)).toBeCloseTo(375 / 390);
    expect(uiScale(1024)).toBe(1.35);
    expect(uiScale(320)).toBe(0.92);
  });
  it('uses one ink colour for all outlines', () => {
    expect(color.ink).toBe('#1D1830');
  });
});
