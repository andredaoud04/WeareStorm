/**
 * Haptics (UX §9): light on deploy, medium when the player's camp takes a hit (throttled), heavy on victory and
 * defeat. Uses the Vibration API where it exists; silently does nothing elsewhere (iOS Safari, desktop, tests).
 */

export type HapticKind = 'light' | 'medium' | 'heavy';

export const HAPTIC_PATTERN: Record<HapticKind, number | number[]> = {
  light: 10,
  medium: 24,
  heavy: [45, 40, 80],
};

/** Minimum time between two pulses of the same kind, so a siege never buzzes continuously. */
export const HAPTIC_GAP_MS: Record<HapticKind, number> = { light: 60, medium: 400, heavy: 800 };

export interface HapticsOptions {
  enabled: () => boolean;
  vibrate?: ((p: number | number[]) => boolean) | null;
  now?: () => number;
}

export class Haptics {
  private last: Record<HapticKind, number> = { light: -1e9, medium: -1e9, heavy: -1e9 };
  private readonly vibrate: ((p: number | number[]) => boolean) | null;
  private readonly now: () => number;
  fired = 0;

  constructor(private readonly o: HapticsOptions) {
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }) : null;
    this.vibrate = o.vibrate !== undefined ? o.vibrate : nav && typeof nav.vibrate === 'function' ? (p) => nav.vibrate!(p) : null;
    this.now = o.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  }

  get available(): boolean {
    return this.vibrate !== null;
  }

  /** Returns true if a pulse was sent. */
  pulse(kind: HapticKind): boolean {
    if (!this.vibrate || !this.o.enabled()) return false;
    // where the browser tells us, never vibrate before a user activation (Chrome logs an error otherwise)
    const ua = typeof navigator !== 'undefined' ? (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation : undefined;
    if (ua && !ua.hasBeenActive) return false;
    const t = this.now();
    if (t - this.last[kind] < HAPTIC_GAP_MS[kind]) return false;
    this.last[kind] = t;
    try {
      this.vibrate(HAPTIC_PATTERN[kind]);
    } catch {
      return false; // blocked before the first gesture, or by the browser
    }
    this.fired++;
    return true;
  }
}
