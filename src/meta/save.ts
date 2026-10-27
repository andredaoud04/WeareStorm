import type { AgeId } from '../contracts';
import { AGE_ORDER } from '../contracts';
import { MAX_LEVEL, type Track } from '../data/economy';

/** Persistent save, schema v1 (TECH §6). Pure: storage access lives in src/app. */
export interface SaveV1 {
  v: 1;
  gold: number;
  armyAge: AgeId;
  campaignStage: number; // next stage to play, 1..30 (31 = campaign complete)
  clearedStages: number[]; // first-clear ledger
  warlordsBeaten: AgeId[];
  timeline: number;
  owned: { ranged: boolean; tank: boolean };
  levels: Record<Track, number>;
  ftue: Record<string, boolean>;
  settings: { sound: boolean; music: boolean; haptics: boolean; reduceMotion: boolean; damageNumbers: boolean; fast: boolean };
  lossStreak: number; // consecutive losses on the current stage (drives the lose-forward assist)
  lastSettledBattleId: string | null;
  /** The last few settled battle ids, so a battle can never be paid twice (even out of order). */
  recentBattleIds: string[];
  /** The battle in progress, so a crash still settles it (as a retreat, Gold kept). */
  pendingBattle: { battleId: string; stageId: number; goldEarned: number } | null;
  stats: { battles: number; victories: number; goldEarned: number; playSeconds: number };
}

export const RECENT_IDS = 16;

export const freshLevels = (): Record<Track, number> => ({ food: 1, walls: 1, melee: 1, ranged: 1, tank: 1 });

export function newSave(): SaveV1 {
  return {
    v: 1,
    gold: 0,
    armyAge: 'stone',
    campaignStage: 1,
    clearedStages: [],
    warlordsBeaten: [],
    timeline: 1,
    owned: { ranged: false, tank: false },
    levels: freshLevels(),
    ftue: {},
    settings: { sound: true, music: true, haptics: true, reduceMotion: false, damageNumbers: true, fast: false },
    lossStreak: 0,
    lastSettledBattleId: null,
    recentBattleIds: [],
    pendingBattle: null,
    stats: { battles: 0, victories: 0, goldEarned: 0, playSeconds: 0 },
  };
}

const int = (v: unknown, min: number, max: number, dflt: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.floor(v))) : dflt;
const bool = (v: unknown, dflt: boolean) => (typeof v === 'boolean' ? v : dflt);

/**
 * Validates/migrates any parsed JSON into a SaveV1. Unknown or broken fields fall back to defaults field by field,
 * so one bad value never wipes the rest of the player's progress.
 */
export function migrate(raw: unknown): SaveV1 {
  const d = newSave();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const levels = (r.levels ?? {}) as Record<string, unknown>;
  const owned = (r.owned ?? {}) as Record<string, unknown>;
  const settings = (r.settings ?? {}) as Record<string, unknown>;
  const stats = (r.stats ?? {}) as Record<string, unknown>;
  const campaignStage = int(r.campaignStage, 1, 31, 1);
  // The army is never more than one Age away from the campaign frontier (behind until it evolves, or one ahead
  // after an early Evolve); anything else is corruption and is pulled back into range.
  const frontier = Math.floor((Math.min(30, campaignStage) - 1) / 5);
  const rawAge = AGE_ORDER.indexOf(r.armyAge as AgeId);
  const armyAge = AGE_ORDER[Math.max(frontier - 1, Math.min(frontier + 1, rawAge < 0 ? frontier : rawAge), 0)]!;
  const pending = r.pendingBattle as SaveV1['pendingBattle'];
  const ownedRanged = bool(owned.ranged, false);
  return {
    v: 1,
    gold: int(r.gold, 0, Number.MAX_SAFE_INTEGER, 0),
    armyAge,
    campaignStage,
    clearedStages: Array.isArray(r.clearedStages) ? [...new Set(r.clearedStages.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 30))] : [],
    warlordsBeaten: Array.isArray(r.warlordsBeaten) ? [...new Set(r.warlordsBeaten.filter((a): a is AgeId => AGE_ORDER.includes(a as AgeId)))] : [],
    timeline: int(r.timeline, 1, 999, 1),
    owned: { ranged: ownedRanged, tank: ownedRanged && bool(owned.tank, false) },
    levels: {
      food: int(levels.food, 1, MAX_LEVEL, 1),
      walls: int(levels.walls, 1, MAX_LEVEL, 1),
      melee: int(levels.melee, 1, MAX_LEVEL, 1),
      ranged: int(levels.ranged, 1, MAX_LEVEL, 1),
      tank: int(levels.tank, 1, MAX_LEVEL, 1),
    },
    ftue: r.ftue && typeof r.ftue === 'object' ? Object.fromEntries(Object.entries(r.ftue as object).filter(([, v]) => typeof v === 'boolean')) : {},
    settings: {
      sound: bool(settings.sound, true),
      music: bool(settings.music, true),
      haptics: bool(settings.haptics, true),
      reduceMotion: bool(settings.reduceMotion, false),
      damageNumbers: bool(settings.damageNumbers, true),
      fast: bool(settings.fast, false),
    },
    lossStreak: int(r.lossStreak, 0, 1000, 0),
    lastSettledBattleId: typeof r.lastSettledBattleId === 'string' ? r.lastSettledBattleId : null,
    recentBattleIds: Array.isArray(r.recentBattleIds) ? r.recentBattleIds.filter((x): x is string => typeof x === 'string').slice(-RECENT_IDS) : [],
    pendingBattle:
      pending && typeof pending === 'object' && typeof pending.battleId === 'string'
        ? { battleId: pending.battleId, stageId: int(pending.stageId, 1, 30, Math.min(30, campaignStage)), goldEarned: int(pending.goldEarned, 0, 1e9, 0) }
        : null,
    stats: {
      battles: int(stats.battles, 0, 1e9, 0),
      victories: int(stats.victories, 0, 1e9, 0),
      goldEarned: int(stats.goldEarned, 0, Number.MAX_SAFE_INTEGER, 0),
      playSeconds: int(stats.playSeconds, 0, 1e12, 0),
    },
  };
}

/** Parses a stored string; on failure returns null so the caller can keep the raw copy before falling back. */
export function parseSave(text: string | null): SaveV1 | null {
  if (!text) return null;
  try {
    return migrate(JSON.parse(text));
  } catch {
    return null;
  }
}
