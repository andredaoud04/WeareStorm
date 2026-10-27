import type { SaveV1 } from '../meta/save';
import { ageDef } from '../data/ages';

/** Ages playable in this build. All six exist in data; the G1 owner build sets VITE_MAX_AGE=1 (Stone only). */
export const MAX_AGE = Math.max(1, Math.min(6, Number(import.meta.env.VITE_MAX_AGE ?? 6)));

/** True when the Age after the army's current one is part of this build. */
export function nextAgeInBuild(s: SaveV1): boolean {
  return ageDef(s.armyAge).index + 1 < MAX_AGE;
}
