import type { AgeId, Slot } from '../contracts';
import { AGES, ageDef } from './ages';

/** Single source of economy formulas (BALANCE §4, GDD §3.6). The UI, sim and harness all call these. */

export const MAX_LEVEL = 10;
export type Track = 'food' | 'walls' | 'melee' | 'ranged' | 'tank';
export const TRACKS: readonly Track[] = ['food', 'walls', 'melee', 'ranged', 'tank'];

const P0: Record<Track, number> = { food: 20, walls: 15, melee: 12, ranged: 16, tank: 22 };
export const UNLOCK_PRICE = { ranged: 30, tank: 70 } as const;

export const ageMult = (age: AgeId) => 1 + 0.25 * ageDef(age).index;

/** Gold price to go from `level` to `level + 1`; null at max level. */
export function upgradePrice(track: Track, age: AgeId, level: number): number | null {
  if (level >= MAX_LEVEL) return null;
  return Math.round(P0[track] * ageMult(age) * Math.pow(1.3, level - 1));
}

/** Food per second for an Age at a Food level (Stone Lv 1 = 1.0). */
export function foodRate(age: AgeId, foodLevel: number): number {
  return ageDef(age).foodFactor * (1 + 0.1 * (foodLevel - 1));
}

/** Integer milli-food gained per 50 ms tick. */
export function foodPerTick(age: AgeId, foodLevel: number): number {
  return Math.round((foodRate(age, foodLevel) * 1000) / 20);
}

/** HP/DMG multiplier from a troop training level (+10% per level). */
export const trainingMult = (level: number) => 1 + 0.1 * (level - 1);

export function playerBaseHp(age: AgeId, wallsLevel: number): number {
  return Math.round(ageDef(age).baseHp * (1 + 0.15 * (wallsLevel - 1)));
}

/** Enemy bases are 80% of the player's base HP for the Age (+10% per stage, Warlord keep +25%): the final push is
 * the payoff of a won battle, so it should be short (harness: battle P50 ≤ 100 s). Base Gold is per 5%, unchanged. */
export function enemyBaseHp(age: AgeId, stageIdx: number, warlord: boolean): number {
  return Math.round(ageDef(age).baseHp * ENEMY_BASE_SHARE * (1 + 0.1 * stageIdx) * (warlord ? 1.25 : 1));
}
export const ENEMY_BASE_SHARE = 0.8;

/**
 * First-clear victory bonus (replays pay 50%). ageIdx is 0-based (Stone = 0). The Warlord bonus is 40 + 15·ageIdx
 * because Warlord fights also pay up to 20 Gold for damaging the warded Warlord (GDD §2.11).
 */
export function victoryBonus(age: AgeId, stageIdx: number, warlord: boolean): number {
  const a = ageDef(age).index;
  return warlord ? 40 + 15 * a : 12 + 4 * stageIdx + 3 * a;
}

/** Gold price of an early Evolve out of `age` (free once that Age's Warlord is beaten). Index = from-Age index. */
export const EVOLVE_PRICE: readonly number[] = [180, 420, 820, 1450, 2500];

export const BASE_CHUNK_PCT = 5; // +1 Gold per full 5% of enemy base max HP removed
export const BASE_CHUNK_MAX = 20;

export const STORMCALL = {
  unlockStage: 4,
  firstChargeSec: 25,
  cooldownSec: 30,
  gatherSec: 0.5,
  radius: 104, // wu (80 u in the prototype lane × 1.3)
  warlordShare: 0.5,
} as const;

/** Stormcall damage = 2 × the Age's Lv-1 melee HP (GDD §2.12). */
export function stormcallDamage(age: AgeId): number {
  return 2 * Math.round(60 * ageDef(age).statFactor);
}

/**
 * Storm Rising overtime (GDD §2.10): from 100 s all damage grows +20% per 10 s step; from 120 s bases take double
 * damage and the enemy trickle stops, so no battle can stall. 600 s is a hard safety stop (counts as a defeat).
 */
export const STORM = { risingSec: 100, stepSec: 10, stepBonus: 0.2, baseDoubleSec: 120, hardLimitSec: 600 } as const;

/**
 * Post-assault trickle spend as a share of the Age's Lv-1 Food rate (GDD §2.9). It is deliberately independent of
 * the assault budget E: whatever the assault was, once it ends the player out-produces the enemy and can push.
 */
export const TRICKLE_SHARE = 0.45;

/**
 * Lose-forward assist (GDD P3): each consecutive loss on the current stage takes 6% off the enemy's HP/DMG AND off
 * its assault budget, capped at 30% (so after five losses the assault is about half as strong). Resets on a win.
 */
export const ASSIST = { perLoss: 0.06, max: 0.3 } as const;

export const SLOT_ORDER: readonly Slot[] = ['melee', 'ranged', 'tank'];
export const FIELD_CAP = 30;
export const QUEUE_CAP = 4;
export const QUEUE_RELEASE_TICKS = 5;
export const AGE_COUNT = AGES.length;
