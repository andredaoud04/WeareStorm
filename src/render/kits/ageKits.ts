import type { AgeId, Slot } from '../../contracts';

/**
 * Which art kit draws each Age (presentation only: the sim, data and balance never read this). Interim mapping until
 * the owner supplies one pack per era: the three early Ages share the Eldritch pack, the three late Ages the Future
 * pack. Change a row here and the battle world, units, bases, effects, icons, portraits, logo and the unit names
 * shown in the UI all follow.
 */
export type KitId = 'eldritch' | 'future';

export const AGE_KIT: Readonly<Record<AgeId, KitId>> = {
  stone: 'eldritch',
  ancient: 'eldritch',
  medieval: 'eldritch',
  gunpowder: 'future',
  industrial: 'future',
  future: 'future',
};

export const KIT_IDS: readonly KitId[] = ['eldritch', 'future'];

export interface KitInfo {
  id: KitId;
  /** Unit names as drawn by the kit (the skin layer shows these instead of the data names). */
  units: Readonly<Record<Slot, string>>;
  warlord: string;
}

export const KITS: Readonly<Record<KitId, KitInfo>> = {
  eldritch: { id: 'eldritch', units: { melee: 'Riftblade', ranged: 'Voidseer', tank: 'Obsidian Warden' }, warlord: 'Hollow Regent' },
  future: { id: 'future', units: { melee: 'Rifleman', ranged: 'Marksman', tank: 'Heavy' }, warlord: 'Siege Commander' },
};

export const kitForAge = (age: AgeId): KitId => AGE_KIT[age];

/** URL of a file in a kit's published folder (public/art/<kit>/), respecting Vite's base path. */
export function kitUrl(kit: KitId, file: string): string {
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
  return `${base.endsWith('/') ? base : `${base}/`}art/${kit}/${file}`;
}
