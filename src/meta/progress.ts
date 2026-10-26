import type { AgeId, BattleResult, SimInput, Slot } from '../contracts';
import { AGE_ORDER } from '../contracts';
import { ASSIST, EVOLVE_PRICE, STORMCALL, TRACKS, UNLOCK_PRICE, upgradePrice, victoryBonus, type Track } from '../data/economy';
import { STAGE_COUNT, stageDef } from '../data/stages';
import { RECENT_IDS, freshLevels, type SaveV1 } from './save';

/** Pure progression rules (GDD §3.5–3.6, §2.11). Every function returns a new save or the same one if invalid. */

const ageIdx = (a: AgeId) => AGE_ORDER.indexOf(a);

/** Age of the next campaign stage (the last Age once the campaign is complete). */
export const frontierAge = (save: SaveV1): AgeId => stageDef(Math.min(STAGE_COUNT, save.campaignStage)).age;

/**
 * The campaign is played in order: the frontier stage (or a retry of it). Earlier stages cannot be replayed for
 * Gold until the campaign is complete; then the Future stages 26–30 are open as replays (GDD §2.11, §3.4).
 * The army must be of the stage's Age or, after an early Evolve, one Age ahead; a later Age needs an Evolve first.
 */
export function canPlayStage(save: SaveV1, stageId: number): boolean {
  if (!Number.isInteger(stageId) || stageId < 1 || stageId > STAGE_COUNT) return false;
  const complete = save.campaignStage > STAGE_COUNT;
  const reachable = complete ? stageDef(stageId).age === 'future' : stageId === save.campaignStage;
  if (!reachable) return false;
  const lead = ageIdx(save.armyAge) - ageIdx(stageDef(stageId).age);
  return lead === 0 || lead === 1;
}

export function battleInput(save: SaveV1, stageId: number, seed: number): SimInput {
  return {
    seed,
    stageId,
    armyAge: save.armyAge,
    timeline: save.timeline,
    owned: { ...save.owned },
    levels: { ...save.levels },
    stormcall: save.campaignStage >= STORMCALL.unlockStage || save.clearedStages.length >= STORMCALL.unlockStage - 1,
    assist: stageId === save.campaignStage ? assistFor(save.lossStreak) : 0,
  };
}

/** Lose-forward assist: enemy HP/DMG reduction after consecutive losses on the current stage (ASSIST). */
export const assistFor = (lossStreak: number) => Math.min(ASSIST.max, ASSIST.perLoss * Math.max(0, lossStreak));

export interface Settlement {
  goldKept: number; // kills + base damage (always kept)
  bonus: number; // first-clear (or replay) victory bonus
  total: number;
  firstClear: boolean;
}

/** Idempotent battle settlement keyed by battleId (GDD §2.11). */
export function settleBattle(
  save: SaveV1,
  battleId: string,
  stageId: number,
  result: BattleResult,
  goldEarned: number,
  durationSec: number,
): { save: SaveV1; settlement: Settlement } {
  const none = { goldKept: 0, bonus: 0, total: 0, firstClear: false };
  if (save.lastSettledBattleId === battleId || save.recentBattleIds.includes(battleId)) return { save, settlement: none };
  // Only a stage the player could have fought can be settled (no paying out stage 30 to a fresh save).
  if (!Number.isInteger(stageId) || stageId < 1 || stageId > STAGE_COUNT || stageId > save.campaignStage) return { save, settlement: none };
  const st = stageDef(stageId);
  const firstClear = result === 'victory' && !save.clearedStages.includes(stageId);
  const bonus = result !== 'victory' ? 0 : firstClear ? victoryBonus(st.age, st.idx, st.warlord) : Math.floor(victoryBonus(st.age, st.idx, st.warlord) / 2);
  const goldKept = Number.isFinite(goldEarned) ? Math.max(0, Math.floor(goldEarned)) : 0;
  const seconds = Number.isFinite(durationSec) ? Math.max(0, durationSec) : 0;
  const total = goldKept + bonus;
  const next: SaveV1 = {
    ...save,
    gold: save.gold + total,
    lastSettledBattleId: battleId,
    recentBattleIds: [...save.recentBattleIds, battleId].slice(-RECENT_IDS),
    pendingBattle: save.pendingBattle?.battleId === battleId ? null : save.pendingBattle,
    clearedStages: firstClear ? [...save.clearedStages, stageId] : save.clearedStages,
    warlordsBeaten: result === 'victory' && st.warlord && !save.warlordsBeaten.includes(st.age) ? [...save.warlordsBeaten, st.age] : save.warlordsBeaten,
    campaignStage: result === 'victory' && stageId === save.campaignStage ? Math.min(STAGE_COUNT + 1, stageId + 1) : save.campaignStage,
    lossStreak: stageId !== save.campaignStage ? save.lossStreak : result === 'victory' ? 0 : save.lossStreak + 1,
    stats: {
      battles: save.stats.battles + 1,
      victories: save.stats.victories + (result === 'victory' ? 1 : 0),
      goldEarned: save.stats.goldEarned + total,
      playSeconds: save.stats.playSeconds + Math.round(seconds),
    },
  };
  return { save: next, settlement: { goldKept, bonus, total, firstClear } };
}

export function unlockPrice(slot: Exclude<Slot, 'melee'>): number {
  return UNLOCK_PRICE[slot];
}

export function canUnlock(save: SaveV1, slot: Exclude<Slot, 'melee'>): boolean {
  if (save.owned[slot]) return false;
  if (slot === 'tank' && !save.owned.ranged) return false;
  return save.gold >= UNLOCK_PRICE[slot];
}

export function unlockSlot(save: SaveV1, slot: Exclude<Slot, 'melee'>): SaveV1 {
  if (!canUnlock(save, slot)) return save;
  return { ...save, gold: save.gold - UNLOCK_PRICE[slot], owned: { ...save.owned, [slot]: true } };
}

/** Whether a Camp track is visible/usable (training tracks need their slot). */
export function trackAvailable(save: SaveV1, track: Track): boolean {
  return track === 'ranged' ? save.owned.ranged : track === 'tank' ? save.owned.tank : true;
}

export function priceFor(save: SaveV1, track: Track): number | null {
  return upgradePrice(track, save.armyAge, save.levels[track]);
}

export function canUpgrade(save: SaveV1, track: Track): boolean {
  const p = priceFor(save, track);
  return p !== null && trackAvailable(save, track) && save.gold >= p;
}

export function upgrade(save: SaveV1, track: Track): SaveV1 {
  if (!canUpgrade(save, track)) return save;
  const p = priceFor(save, track)!;
  return { ...save, gold: save.gold - p, levels: { ...save.levels, [track]: save.levels[track] + 1 } };
}

export function affordableCount(save: SaveV1): number {
  let n = 0;
  if (canUnlock(save, 'ranged')) n++;
  if (canUnlock(save, 'tank')) n++;
  for (const t of ['food', 'walls', 'melee', 'ranged', 'tank'] as Track[]) if (canUpgrade(save, t)) n++;
  return n;
}

/**
 * Evolve price (GDD §3.5): free once the army Age's Warlord is beaten; before that an early Evolve costs Gold.
 * null when there is no next Age or the army would lead the campaign frontier by more than one Age.
 */
export function evolvePrice(save: SaveV1): number | null {
  const i = ageIdx(save.armyAge);
  if (i >= AGE_ORDER.length - 1) return null;
  if (i + 1 > ageIdx(frontierAge(save)) + 1) return null;
  return save.warlordsBeaten.includes(save.armyAge) ? 0 : EVOLVE_PRICE[i]!;
}

export function canEvolve(save: SaveV1): boolean {
  const p = evolvePrice(save);
  return p !== null && save.gold >= p;
}

/** Evolve: the army moves up one Age, the Camp resets, unlocked slots carry over, the price (if any) is paid. */
export function evolve(save: SaveV1): SaveV1 {
  if (!canEvolve(save)) return save;
  const next = AGE_ORDER[ageIdx(save.armyAge) + 1] as AgeId;
  return { ...save, gold: save.gold - evolvePrice(save)!, armyAge: next, levels: freshLevels() };
}

/** The army must evolve before the next campaign battle can start (frontier Age is ahead of the army). */
export const mustEvolve = (save: SaveV1) => ageIdx(frontierAge(save)) > ageIdx(save.armyAge);

export type Recommendation =
  | { kind: 'evolve'; price: number }
  | { kind: 'unlock'; slot: Exclude<Slot, 'melee'>; price: number }
  | { kind: 'upgrade'; track: Track; price: number };

/**
 * The single "what should I buy next" rule behind the Results Upgrade button, the defeat tip and the coach
 * (and the lazy harness bots). Only returns something affordable right now; null if nothing is.
 */
export function recommendUpgrade(save: SaveV1): Recommendation | null {
  if (mustEvolve(save) && evolvePrice(save) === 0) return { kind: 'evolve', price: 0 };
  for (const slot of ['ranged', 'tank'] as const) if (canUnlock(save, slot)) return { kind: 'unlock', slot, price: UNLOCK_PRICE[slot] };
  // Food is weighted as 20% cheaper: more Food helps every troop.
  const best = TRACKS.filter((t) => canUpgrade(save, t)).sort((a, b) => priceFor(save, a)! * (a === 'food' ? 0.8 : 1) - priceFor(save, b)! * (b === 'food' ? 0.8 : 1))[0];
  return best ? { kind: 'upgrade', track: best, price: priceFor(save, best)! } : null;
}

/** Applies a recommendation (no-op if it is no longer valid). */
export function applyRecommendation(save: SaveV1, r: Recommendation): SaveV1 {
  if (r.kind === 'evolve') return evolve(save);
  if (r.kind === 'unlock') return unlockSlot(save, r.slot);
  return upgrade(save, r.track);
}
