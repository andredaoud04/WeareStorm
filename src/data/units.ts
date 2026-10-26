import type { AgeId, ProjStyle, Role, Slot, UnitDefId } from '../contracts';
import { AGES, ageDef } from './ages';

/**
 * Troop and Warlord definitions (GDD §3.2) converted to the reconciled lane geometry (GDD Reconciliation §1–2):
 * edge-gap ranges in world units, speeds and AoE radii ×1.3. Body widths match the art's bounding width minus 4 wu
 * so clashing heads never overlap (melee 60, ranged 52, tank 88, quadruped/vehicle 120, Warlord 210).
 * Stats here are Lv-1 values for the unit's own Age.
 */
export type Trait =
  | { kind: 'cleave'; radius: number; mult: number }
  | { kind: 'charge'; mult: number; speedMult: number }
  | { kind: 'splash'; radius: number; mult: number }
  | { kind: 'armor'; pct: number }
  | { kind: 'rapid'; shots: number }
  | { kind: 'pierce'; count: number; mult: number }
  | { kind: 'slam'; radius: number };

export interface UnitDef {
  id: UnitDefId;
  name: string;
  age: AgeId;
  role: Role;
  slot: Slot | null; // null for Warlords
  cost: number; // Food
  hp: number;
  dmg: number;
  interval: number; // seconds per attack cycle
  windup: number; // seconds from attack start to impact
  range: number; // edge gap, wu
  speed: number; // wu/s
  width: number; // body width, wu
  proj: ProjStyle | null; // ranged projectile style
  projSpeed: number; // wu/s
  trait: Trait | null;
  killGold: number;
}

const ROLE = {
  melee: { hp: 60, dmg: 12, interval: 1.0, windup: 0.35, range: 12, speed: 105, width: 60, gold: 1 },
  ranged: { hp: 40, dmg: 18, interval: 1.2, windup: 0.4, range: 300, speed: 90, width: 52, gold: 1 },
  tank: { hp: 260, dmg: 22, interval: 1.5, windup: 0.5, range: 16, speed: 65, width: 88, gold: 5 },
} as const;

const STONE_COST = { melee: 5, ranged: 8, tank: 12 } as const;

/**
 * Warlord slam damage as a multiple of the Age's tank DMG. 1.92 puts the slam at 96% of a Lv-2 ranged troop's HP
 * in every Age (Stone: 42 vs 44), so one ranged upgrade is the readable counter: Lv-1 Slingers die to one slam,
 * Lv-2 Slingers survive it. Calibration only moves Warlord HP.
 */
const WARLORD_DMG = 1.92;

interface Row {
  key: string;
  name: string;
  slot: Slot;
  trait?: Trait | null;
  hpMult?: number;
  dmgMult?: number;
  interval?: number;
  range?: number;
  speed?: number;
  width?: number;
  proj?: ProjStyle;
  projSpeed?: number;
}

const ROSTER: Record<AgeId, Row[]> = {
  stone: [
    { key: 'clubber', name: 'Clubber', slot: 'melee' },
    { key: 'slinger', name: 'Slinger', slot: 'ranged', proj: 'pebble' },
    { key: 'rockhide', name: 'Rockhide', slot: 'tank' },
  ],
  ancient: [
    { key: 'hoplite', name: 'Hoplite', slot: 'melee' },
    { key: 'javelineer', name: 'Javelineer', slot: 'ranged', proj: 'javelin' },
    { key: 'tusker', name: 'Tusker', slot: 'tank', trait: { kind: 'cleave', radius: 52, mult: 1 }, dmgMult: 0.85, range: 20, width: 120 },
  ],
  medieval: [
    { key: 'footman', name: 'Footman', slot: 'melee' },
    { key: 'bolter', name: 'Bolter', slot: 'ranged', proj: 'bolt', range: 310, projSpeed: 1100 },
    { key: 'knight', name: 'Knight', slot: 'tank', trait: { kind: 'charge', mult: 2.5, speedMult: 1.4 }, range: 20, width: 120 },
  ],
  gunpowder: [
    { key: 'corsair', name: 'Corsair', slot: 'melee' },
    { key: 'bombardier', name: 'Bombardier', slot: 'ranged', proj: 'bomb', range: 290, interval: 1.3, trait: { kind: 'splash', radius: 58, mult: 1 }, dmgMult: 0.7 },
    { key: 'ironclad', name: 'Ironclad', slot: 'tank', trait: { kind: 'armor', pct: 0.25 }, hpMult: 0.9 },
  ],
  industrial: [
    { key: 'trencher', name: 'Trencher', slot: 'melee' },
    { key: 'gunner', name: 'Gunner', slot: 'ranged', proj: 'bullet', projSpeed: 1100, trait: { kind: 'rapid', shots: 3 }, dmgMult: 1 / 3 },
    { key: 'landship', name: 'Landship', slot: 'tank', proj: 'shell', range: 80, interval: 1.6, speed: 58, width: 120, trait: { kind: 'splash', radius: 52, mult: 1 }, dmgMult: 0.8 },
  ],
  future: [
    { key: 'voltblade', name: 'Voltblade', slot: 'melee', interval: 0.9, speed: 124 },
    { key: 'pulseRanger', name: 'Pulse Ranger', slot: 'ranged', proj: 'beam', range: 320, projSpeed: 1100, trait: { kind: 'pierce', count: 2, mult: 1 }, dmgMult: 0.8 },
    { key: 'titan', name: 'Titan', slot: 'tank', trait: { kind: 'armor', pct: 0.3 }, hpMult: 0.9, speed: 58 },
  ],
};

const WARLORDS: Record<AgeId, { key: string; name: string }> = {
  stone: { key: 'grumbo', name: 'Chief Grumbo' },
  ancient: { key: 'colossus', name: 'The Bronze Colossus' },
  medieval: { key: 'blackmace', name: 'Baron Blackmace' },
  gunpowder: { key: 'kaboom', name: 'Admiral Kaboom' },
  industrial: { key: 'juggernaut', name: 'The Iron Juggernaut' },
  future: { key: 'omega', name: 'OMEGA Core' },
};

function build(): Map<UnitDefId, UnitDef> {
  const out = new Map<UnitDefId, UnitDef>();
  for (const age of AGES) {
    for (const r of ROSTER[age.id]) {
      const base = ROLE[r.slot];
      const def: UnitDef = {
        id: `${age.id}.${r.key}`,
        name: r.name,
        age: age.id,
        role: r.slot,
        slot: r.slot,
        cost: Math.round(STONE_COST[r.slot] * age.foodFactor),
        hp: Math.round(base.hp * age.statFactor * (r.hpMult ?? 1)),
        dmg: Math.max(1, Math.round(base.dmg * age.statFactor * (r.dmgMult ?? 1))),
        interval: r.interval ?? base.interval,
        windup: base.windup,
        range: r.range ?? base.range,
        speed: r.speed ?? base.speed,
        width: r.width ?? base.width,
        proj: r.proj ?? null,
        projSpeed: r.projSpeed ?? 680,
        trait: r.trait ?? null,
        killGold: base.gold,
      };
      out.set(def.id, def);
    }
    const tank = ROSTER[age.id].find((r) => r.slot === 'tank')!;
    const w = WARLORDS[age.id];
    out.set(`${age.id}.${w.key}`, {
      id: `${age.id}.${w.key}`,
      name: w.name,
      age: age.id,
      role: 'warlord',
      slot: null,
      cost: 0,
      hp: Math.round(ROLE.tank.hp * age.statFactor * (tank.hpMult ?? 1) * 4),
      dmg: Math.round(ROLE.tank.dmg * age.statFactor * WARLORD_DMG),
      interval: 2.6,
      windup: 0.9,
      range: 30,
      speed: 48,
      width: 210,
      proj: null,
      projSpeed: 0,
      trait: { kind: 'slam', radius: 70 },
      killGold: 25,
    });
  }
  return out;
}

export const UNITS: ReadonlyMap<UnitDefId, UnitDef> = build();

export function unitDef(id: UnitDefId): UnitDef {
  const u = UNITS.get(id);
  if (!u) throw new Error(`unknown unit ${id}`);
  return u;
}

export function rosterOf(age: AgeId): Record<Slot, UnitDef> {
  const rows = ROSTER[age];
  const get = (slot: Slot) => unitDef(`${age}.${rows.find((r) => r.slot === slot)!.key}`);
  return { melee: get('melee'), ranged: get('ranged'), tank: get('tank') };
}

export const warlordOf = (age: AgeId): UnitDef => unitDef(ageDef(age).warlord);
