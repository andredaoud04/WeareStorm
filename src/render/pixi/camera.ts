/**
 * World → screen mapping (GDD Reconciliation §1b). One uniform scale: points per world unit grows with the viewport
 * width and is clamped so troops stay ~42–48 pt on phones and ~70 pt on tablets. Wider screens reveal more lane and
 * base instead of stretching. The ground line sits a fixed band above the deck so the lane never hides under it.
 */
export interface Viewport {
  w: number; // CSS px
  h: number;
  /** Top of the bottom UI (deck in battle, tab bar in the hub) in CSS px from the top. */
  uiTop: number;
}

export interface Camera {
  ptPerWu: number;
  centerX: number; // world x at the screen centre
  groundY: number; // screen y of the ground line (CSS px)
  halfWidthWu: number;
  /** World x → screen x. */
  sx(x: number): number;
  /** Height in world units → screen px. */
  sy(h: number): number;
}

export const LANE_CENTER = 500;

export function makeCamera(v: Viewport, centerX = LANE_CENTER): Camera {
  const ptPerWu = Math.min(0.467, Math.max(0.27, v.w / 1340));
  // a generous band below the lane holds the foreground props and keeps the action near the middle of the screen
  const groundY = v.uiTop - Math.min(170, Math.max(56, 0.15 * v.h));
  return {
    ptPerWu,
    centerX,
    groundY,
    halfWidthWu: v.w / (2 * ptPerWu),
    sx: (x) => v.w / 2 + (x - centerX) * ptPerWu,
    sy: (h) => h * ptPerWu,
  };
}

/**
 * Presentation-only rank spread (GDD Reconciliation): same-side units standing within 8 wu of each other are fanned
 * out back from the front by rank (16 wu per rank, ranks 0–2 then cycle) and given a small depth offset, so ten
 * Clubbers read as a crowd instead of one blob. The sim is unaffected.
 */
export function rankSpread<T extends { id: number; side: 'player' | 'enemy'; x: number }>(units: readonly T[]): Map<number, { dx: number; depth: number }> {
  const out = new Map<number, { dx: number; depth: number }>();
  const bySide = { player: [] as T[], enemy: [] as T[] };
  for (const u of units) bySide[u.side].push(u);
  for (const side of ['player', 'enemy'] as const) {
    const list = bySide[side].slice().sort((a, b) => (side === 'player' ? b.x - a.x : a.x - b.x) || a.id - b.id);
    let groupX = Number.NaN;
    let rank = 0;
    for (const u of list) {
      if (Math.abs(u.x - groupX) <= 8) rank += 1;
      else {
        groupX = u.x;
        rank = 0;
      }
      const r = rank % 3;
      const back = side === 'player' ? -1 : 1;
      // depth: alternate above/below the lane centre so a group fans out vertically too
      const depth = r === 0 ? 0 : r === 1 ? -18 : 18;
      out.set(u.id, { dx: r === 0 ? 0 : back * r * 16, depth: depth + ((u.id * 7) % 11) - 5 });
    }
  }
  return out;
}
