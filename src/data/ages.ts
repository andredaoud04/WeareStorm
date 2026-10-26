import type { AgeId } from '../contracts';

/** Per-Age scaling (GDD §2.5, BALANCE §4.2). A = stat factor, K = food factor. */
export interface AgeDef {
  id: AgeId;
  index: number; // 0..5
  name: string;
  statFactor: number; // A
  foodFactor: number; // K (Food/s at Lv 1 and troop costs scale by this)
  baseHp: number; // player and stage-1 enemy base HP
  baseName: string;
  warlord: string; // unit def id of this Age's Warlord
}

export const AGES: readonly AgeDef[] = [
  { id: 'stone', index: 0, name: 'Stone Age', statFactor: 1, foodFactor: 1.0, baseHp: 400, baseName: 'Totem Camp', warlord: 'stone.grumbo' },
  { id: 'ancient', index: 1, name: 'Ancient Age', statFactor: 2.2, foodFactor: 1.6, baseHp: 880, baseName: 'Sun Ziggurat', warlord: 'ancient.colossus' },
  { id: 'medieval', index: 2, name: 'Medieval Age', statFactor: 4.8, foodFactor: 2.4, baseHp: 1920, baseName: 'Banner Keep', warlord: 'medieval.blackmace' },
  { id: 'gunpowder', index: 3, name: 'Gunpowder Age', statFactor: 10.5, foodFactor: 3.4, baseHp: 4200, baseName: 'Star Bastion', warlord: 'gunpowder.kaboom' },
  { id: 'industrial', index: 4, name: 'Industrial Age', statFactor: 23, foodFactor: 4.6, baseHp: 9200, baseName: 'Iron Works', warlord: 'industrial.juggernaut' },
  { id: 'future', index: 5, name: 'Future Age', statFactor: 50, foodFactor: 6.0, baseHp: 20000, baseName: 'Aegis Spire', warlord: 'future.omega' },
];

export function ageDef(id: AgeId): AgeDef {
  const a = AGES.find((x) => x.id === id);
  if (!a) throw new Error(`unknown age ${id}`);
  return a;
}

export const ageByIndex = (i: number): AgeDef => AGES[Math.max(0, Math.min(AGES.length - 1, i))]!;
