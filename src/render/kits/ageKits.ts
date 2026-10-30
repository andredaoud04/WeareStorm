import type { AgeId, Slot } from '../../contracts';

/**
 * Which art kit draws each Age (presentation only: the sim, data and balance never read this). One kit per Age:
 * the four era packs (Primal, Ancient, Gunpowder, Industrial) plus the Eldritch pack in the Medieval slot and the
 * Future pack. Change a row here and the battle world, units, bases, effects, portraits and the unit names shown in
 * the UI all follow.
 */
export type KitId = 'primal' | 'ancient' | 'eldritch' | 'gunpowder' | 'industrial' | 'future';

export const AGE_KIT: Readonly<Record<AgeId, KitId>> = {
  stone: 'primal',
  ancient: 'ancient',
  medieval: 'eldritch',
  gunpowder: 'gunpowder',
  industrial: 'industrial',
  future: 'future',
};

export const KIT_IDS: readonly KitId[] = ['primal', 'ancient', 'eldritch', 'gunpowder', 'industrial', 'future'];

/** The one icon sheet every Age uses (the era packs ship none; one set keeps the UI consistent across Ages). */
export const ICON_KIT: KitId = 'eldritch';

export interface KitInfo {
  id: KitId;
  /** Unit names as drawn by the kit (the skin layer shows these instead of the data names). */
  units: Readonly<Record<Slot, string>>;
  warlord: string;
  /** Kit whose STORMGLASS wordmark the title shows (the era packs ship none). */
  logo: KitId;
}

/**
 * Role mapping of the era packs (which design plays melee / ranged / tank) is a presentation call made from the art:
 * closest weapon = melee, projectile = ranged, heaviest armour = tank; the `warlord` design is the Warlord.
 * Awaiting the owner's confirmation (public/art/README.md).
 */
export const KITS: Readonly<Record<KitId, KitInfo>> = {
  primal: { id: 'primal', units: { melee: 'Flintspear', ranged: 'Slinghunter', tank: 'Boneguard' }, warlord: 'Primal Warlord', logo: 'eldritch' },
  ancient: { id: 'ancient', units: { melee: 'Longspear', ranged: 'Warbow', tank: 'Bronze Guard' }, warlord: 'Ancient Warlord', logo: 'eldritch' },
  eldritch: { id: 'eldritch', units: { melee: 'Riftblade', ranged: 'Voidseer', tank: 'Obsidian Warden' }, warlord: 'Hollow Regent', logo: 'eldritch' },
  gunpowder: { id: 'gunpowder', units: { melee: 'Musketeer', ranged: 'Grenadier', tank: 'Sabre Guard' }, warlord: 'Gunpowder Warlord', logo: 'eldritch' },
  industrial: { id: 'industrial', units: { melee: 'Trench Raider', ranged: 'Rifleman', tank: 'Heavy Gunner' }, warlord: 'Industrial Warlord', logo: 'eldritch' },
  future: { id: 'future', units: { melee: 'Rifleman', ranged: 'Marksman', tank: 'Heavy' }, warlord: 'Siege Commander', logo: 'future' },
};

export const kitForAge = (age: AgeId): KitId => AGE_KIT[age];

/** URL of a file in a kit's published folder (public/art/<kit>/), respecting Vite's base path. */
export function kitUrl(kit: KitId, file: string): string {
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
  return `${base.endsWith('/') ? base : `${base}/`}art/${kit}/${file}`;
}
