/**
 * Batches battle Gold into a bounded number of coin flights (ART_BIBLE §5.11 coinPop: coins fly to the Gold pill).
 * A busy fight can pay dozens of times a second; at most `cap` coins are ever in the air, and Gold that arrives while
 * the sky is full (or right next to a coin that just launched) rides on an existing coin. Every Gold piece is
 * credited exactly once, when the coin that carries it lands.
 */
export interface CoinFlight {
  id: number;
  value: number;
  bornMs: number;
  x: number;
  y: number;
}

export class CoinBatcher {
  private flying = new Map<number, CoinFlight>();
  private seq = 0;
  private last: CoinFlight | null = null;
  requested = 0;
  credited = 0;

  constructor(
    readonly cap = 12,
    /** Gold from the same spot within this window joins the coin that just launched. */
    readonly mergeMs = 80,
    readonly mergePx = 32,
  ) {}

  /** Returns the coin to launch, or null when the Gold joined a coin already in the air. */
  add(value: number, x: number, y: number, nowMs: number): CoinFlight | null {
    if (!(value > 0)) return null;
    this.requested += value;
    const last = this.last;
    if (last && this.flying.has(last.id) && nowMs - last.bornMs <= this.mergeMs && Math.hypot(last.x - x, last.y - y) <= this.mergePx) {
      last.value += value;
      return null;
    }
    if (this.flying.size >= this.cap) {
      // the youngest coin still has the longest way to go, so its landing reads as the one carrying this Gold
      let young: CoinFlight | null = null;
      for (const f of this.flying.values()) if (!young || f.bornMs >= young.bornMs) young = f;
      young!.value += value;
      return null;
    }
    const f: CoinFlight = { id: ++this.seq, value, bornMs: nowMs, x, y };
    this.flying.set(f.id, f);
    this.last = f;
    return f;
  }

  /** A coin reached the pill: returns the Gold it carried (0 if it already landed). */
  land(id: number): number {
    const f = this.flying.get(id);
    if (!f) return 0;
    this.flying.delete(id);
    this.credited += f.value;
    return f.value;
  }

  /** Lands everything still in the air (battle over, motion turned off); returns that Gold. */
  flush(): number {
    let v = 0;
    for (const id of [...this.flying.keys()]) v += this.land(id);
    return v;
  }

  get active(): number {
    return this.flying.size;
  }

  /** Gold that has been earned but not yet landed in the pill. */
  get inFlight(): number {
    let v = 0;
    for (const f of this.flying.values()) v += f.value;
    return v;
  }
}
