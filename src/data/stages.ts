import type { AgeId, StageId } from '../contracts';
import { AGES } from './ages';
import calibrated from './stages.calibrated.json';

/** Calibrator output (tools/harness/calibrate.ts): per-stage overrides of budget and bossMult. */
const CALIBRATED = calibrated as Record<string, Partial<Pick<StageDef, 'budget' | 'bossMult'>>>;

/**
 * The 30-stage campaign (GDD §3.4). Stage n belongs to Age ceil(n/5); stage 5k is that Age's Warlord.
 * `budget` E is a multiple of the player's Lv-1 Food rate for the Age, spent on the pattern during the assault
 * window. These seeds are prototype values; the calibrator (tools/harness/calibrate.ts) re-tunes them.
 *
 * Pattern tokens: m/r/t = melee/ranged/tank of `enemyAge`; M = the stage Age's own melee. Stage 1 of every later
 * Age fields the PREVIOUS Age's roster with one new-Age melee per cycle: the freshly evolved army meets enemies a
 * full Age behind it, which is where the evolution power spike comes from (enemy stats scale by the same factor A,
 * so a like-for-like stage could never feel stronger).
 */
export type SpawnToken = 'm' | 'r' | 't' | 'M';

export interface Insert {
  atSec: number;
  units: SpawnToken[];
}

export interface StageDef {
  id: StageId;
  age: AgeId;
  idx: number; // 0..4 within the Age
  title: string;
  warlord: boolean;
  /** Age whose roster the m/r/t tokens use (the stage Age except on stage 1 of Ages 2–6). */
  enemyAge: AgeId;
  pattern: string; // e.g. 'mmrmt'
  budget: number; // E
  assaultStartSec: number;
  assaultEndSec: number;
  /** Fixed seconds between trickle units, or 0 to derive it from TRICKLE_SHARE of the Lv-1 Food rate. */
  trickleSec: number;
  rally: number; // pack size when enemy base first drops below 50%; 0 = no rally
  warlordAtSec: number;
  enemyStatMult: number;
  bossMult: number; // Warlord HP multiplier (calibrated; 1 = 4× the Age's tank HP). Slam damage is fixed.
  inserts: Insert[];
}

const TITLES: Record<AgeId, string[]> = {
  stone: ['First Hunt', 'Sling Ridge', 'Boulder Pass', 'Rockhide Rumble', 'Chief Grumbo'],
  ancient: ['Bronze Dawn', 'Javelin Shore', 'Temple Steps', 'Tusker Trail', 'The Bronze Colossus'],
  medieval: ['Banner Hill', 'Bolt Woods', 'Moat Crossing', 'Lance Charge', 'Baron Blackmace'],
  gunpowder: ['Powder Bay', 'Bomb Bluff', 'Corsair Cove', "Anchor's Edge", 'Admiral Kaboom'],
  industrial: ['Smoke Yard', 'Rail Junction', 'Gear Works', 'Landship Ridge', 'The Iron Juggernaut'],
  future: ['Neon Outskirts', 'Pulse Plaza', 'Arc Bridge', 'Titan Foundry', 'OMEGA Core'],
};

const STONE: Pick<StageDef, 'pattern' | 'budget'>[] = [
  { pattern: 'm', budget: 0.6 }, // pinned: never calibrated (BALANCE §4.7)
  { pattern: 'mmr', budget: 0.85 },
  { pattern: 'mmrmr', budget: 0.75 },
  { pattern: 'mmrtmr', budget: 0.8 },
  { pattern: 'mmrmr', budget: 0.3 },
];
const LATER: Pick<StageDef, 'pattern' | 'budget'>[] = [
  { pattern: 'mmrmtM', budget: 1.2 },
  { pattern: 'mrmrt', budget: 1.15 },
  { pattern: 'mmrtr', budget: 1.2 },
  { pattern: 'mrtmrt', budget: 1.2 },
  { pattern: 'mmrmr', budget: 0.35 },
];

/** Authored beats the calibrator can never delete by lowering E. */
const INSERTS: Record<number, Insert[]> = {
  4: [{ atSec: 30, units: ['t'] }], // Rockhide Rumble: the first enemy tank (FTUE beat)
  8: [{ atSec: 28, units: ['t', 't'] }],
  12: [{ atSec: 25, units: ['t'] }],
  17: [{ atSec: 25, units: ['r', 'r'] }],
  22: [{ atSec: 25, units: ['r', 'r'] }],
};

function build(): StageDef[] {
  const out: StageDef[] = [];
  AGES.forEach((age, a) => {
    for (let idx = 0; idx < 5; idx++) {
      const id = a * 5 + idx + 1;
      const seed = (a === 0 ? STONE : LATER)[idx]!;
      const first = id === 1;
      out.push({
        id,
        age: age.id,
        idx,
        title: TITLES[age.id][idx]!,
        warlord: idx === 4,
        enemyAge: a > 0 && idx === 0 ? AGES[a - 1]!.id : age.id,
        pattern: seed.pattern,
        budget: seed.budget,
        assaultStartSec: first ? 10 : 6 + idx,
        assaultEndSec: 30 + 2 * a,
        trickleSec: first ? 10 : 0,
        rally: first ? 0 : Math.min(4, 1 + idx),
        warlordAtSec: id === 30 ? 10 : 12,
        enemyStatMult: first ? 0.8 : 1,
        bossMult: 1,
        inserts: INSERTS[id] ?? [],
        ...CALIBRATED[String(id)],
      });
    }
  });
  return out;
}

export const STAGES: readonly StageDef[] = build();
export const STAGE_COUNT = STAGES.length;

export function stageDef(id: StageId): StageDef {
  const s = STAGES[id - 1];
  if (!s) throw new Error(`unknown stage ${id}`);
  return s;
}
