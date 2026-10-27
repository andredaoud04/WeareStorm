import { describe, expect, it } from 'vitest';
import { CoinBatcher } from '../../src/app/coinBatch';

describe('coin flight batching (coinPop → Gold pill)', () => {
  it('launches one coin per payout and credits it when it lands', () => {
    const b = new CoinBatcher(12);
    const a = b.add(1, 100, 300, 0)!;
    const c = b.add(5, 220, 300, 500)!;
    expect(a).not.toBeNull();
    expect(c).not.toBeNull();
    expect(b.active).toBe(2);
    expect(b.inFlight).toBe(6);
    expect(b.land(a.id)).toBe(1);
    expect(b.land(a.id)).toBe(0); // a coin lands once
    expect(b.inFlight).toBe(5);
    expect(b.credited).toBe(1);
  });

  it('merges Gold from the same spot in the same moment into one coin', () => {
    const b = new CoinBatcher(12);
    const a = b.add(1, 100, 300, 0)!;
    expect(b.add(1, 110, 305, 30)).toBeNull();
    expect(b.add(1, 300, 305, 40)).not.toBeNull(); // far away: its own coin
    expect(b.land(a.id)).toBe(2);
  });

  it('never has more than `cap` coins in the air and loses no Gold in a busy fight', () => {
    const b = new CoinBatcher(12);
    const launched: number[] = [];
    let max = 0;
    let t = 0;
    let paid = 0;
    for (let i = 0; i < 400; i++) {
      t += 17;
      const v = (i % 7) + 1;
      paid += v;
      const f = b.add(v, (i * 53) % 390, 300 + (i % 5) * 40, t);
      if (f) launched.push(f.id);
      max = Math.max(max, b.active);
      // coins take ~0.9 s: land the oldest ones as time passes
      while (launched.length && b.active > 0 && i % 3 === 0 && launched.length > 8) b.land(launched.shift()!);
    }
    expect(max).toBeLessThanOrEqual(12);
    expect(b.requested).toBe(paid);
    expect(b.credited + b.inFlight).toBe(paid);
    b.flush();
    expect(b.inFlight).toBe(0);
    expect(b.credited).toBe(paid);
  });

  it('ignores zero and negative payouts', () => {
    const b = new CoinBatcher();
    expect(b.add(0, 0, 0, 0)).toBeNull();
    expect(b.add(-3, 0, 0, 0)).toBeNull();
    expect(b.requested).toBe(0);
  });
});
