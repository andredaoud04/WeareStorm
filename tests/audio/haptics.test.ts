import { describe, expect, it } from 'vitest';
import { HAPTIC_PATTERN, Haptics } from '../../src/audio/haptics';

describe('haptics (UX §9)', () => {
  const make = (enabled = true) => {
    const calls: (number | number[])[] = [];
    const clock = { t: 0 };
    const h = new Haptics({ enabled: () => enabled, vibrate: (p) => (calls.push(p), true), now: () => clock.t });
    return { h, calls, clock };
  };

  it('light, medium and heavy are distinct patterns, heavy the longest', () => {
    const len = (p: number | number[]) => (Array.isArray(p) ? p.reduce((a, b) => a + b, 0) : p);
    expect(len(HAPTIC_PATTERN.light)).toBeLessThan(len(HAPTIC_PATTERN.medium));
    expect(len(HAPTIC_PATTERN.medium)).toBeLessThan(len(HAPTIC_PATTERN.heavy));
  });

  it('respects the Haptics setting', () => {
    const { h, calls } = make(false);
    expect(h.pulse('heavy')).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('throttles base-hit pulses so a siege never buzzes continuously', () => {
    const { h, calls, clock } = make();
    for (let i = 0; i < 20; i++) {
      h.pulse('medium');
      clock.t += 50;
    }
    expect(calls.length).toBeLessThanOrEqual(3);
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it('is a no-op where the Vibration API is missing', () => {
    const h = new Haptics({ enabled: () => true, vibrate: null });
    expect(h.available).toBe(false);
    expect(h.pulse('light')).toBe(false);
  });
});
