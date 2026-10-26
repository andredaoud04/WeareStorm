/**
 * Headless campaign harness: plays the REAL src/sim + src/meta with seeded bot cohorts (BALANCE §4.7).
 */
import type { BattleResult, SimCommand, Slot } from '../../src/contracts';
import { TICKS_PER_SECOND } from '../../src/contracts';
import { STORM, TRACKS, type Track } from '../../src/data/economy';
import { STAGE_COUNT } from '../../src/data/stages';
import { rosterOf } from '../../src/data/units';
import { createBattle, stepMut, stormcallAim, type BattleState } from '../../src/sim/battle';
import {
  affordableCount, applyRecommendation, battleInput, canEvolve, canUnlock, canUpgrade, evolve, mustEvolve, priceFor,
  recommendUpgrade, settleBattle, unlockSlot, upgrade,
} from '../../src/meta/progress';
import { newSave, type SaveV1 } from '../../src/meta/save';

/**
 * casual: taps ~1 s after a card is ready, shops everything affordable, uses Stormcall on clumps.
 * average: the calibration target, a typical player: taps 1–3 s after a card is ready, shops like casual.
 * lazy: 2–6 s reactions, buys only the recommended item once per Hub visit. slow: 6–12 s reactions, same shopping.
 * random: random cards and random purchases. idle: never taps (Battle 1 must be lost).
 */
export type BotKind = 'casual' | 'average' | 'lazy' | 'slow' | 'random' | 'idle';

export function rng(seed: number) {
  let a = seed | 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Taps per reaction: a player who looks away taps several cards when they look back, wasting no Food. */
const BURST: Record<BotKind, number> = { casual: 1, average: 2, lazy: 4, slow: 4, random: 1, idle: 0 };

const REACTION: Record<BotKind, [number, number]> = { casual: [0.4, 1.6], average: [1, 3], lazy: [2, 6], slow: [6, 12], random: [1, 4], idle: [0, 0] };

export interface BattleOutcome {
  result: BattleResult;
  seconds: number;
  gold: number;
  kills: number;
  stormRising: boolean; // reached Storm Rising overtime
}

/**
 * A simulated player's persistent habits. Without them every bot plays the same build at the same speed, so a
 * stage's win rate jumps from ~100% to ~0% across a tiny change in difficulty and calibration cannot aim.
 */
export interface Persona {
  react: number; // reaction-time multiplier
  mix: number; // which deploy rotation this player favours
  weights: Record<Track, number>; // shopping preference (lower = buys sooner)
}

export const NEUTRAL: Persona = { react: 1, mix: 0, weights: { food: 0.8, walls: 1, melee: 1, ranged: 1, tank: 1 } };

export function persona(seed: number): Persona {
  const r = rng(seed * 7919 + 13);
  return {
    react: 0.7 + 0.6 * r(),
    mix: Math.floor(r() * 3),
    weights: { food: 0.6 + 0.4 * r(), walls: 0.9 + 0.5 * r(), melee: 0.8 + 0.4 * r(), ranged: 0.8 + 0.4 * r(), tank: 0.8 + 0.4 * r() },
  };
}

const MIXES: Record<'tank' | 'ranged', Slot[][]> = {
  tank: [
    ['melee', 'ranged', 'tank', 'melee', 'melee', 'ranged'],
    ['melee', 'melee', 'ranged', 'ranged', 'tank'],
    ['tank', 'melee', 'ranged', 'melee', 'ranged'],
  ],
  ranged: [['melee', 'melee', 'ranged'], ['melee', 'ranged'], ['melee', 'melee', 'melee', 'ranged']],
};

export interface PlayOptions {
  persona?: Persona;
  onTick?: (s: BattleState) => void;
}

/** Plays one battle with a bot policy. */
export function playBattle(save: SaveV1, stageId: number, bot: BotKind, r: () => number, seed = 1, opts: PlayOptions = {}): BattleOutcome {
  const b = createBattle(battleInput(save, stageId, seed));
  const s: BattleState = b.state;
  const roster = rosterOf(save.armyAge);
  const who = opts.persona ?? NEUTRAL;
  const pattern: Slot[] = save.owned.tank ? MIXES.tank[who.mix]! : save.owned.ranged ? MIXES.ranged[who.mix]! : ['melee'];
  const [rmin, rmax] = REACTION[bot].map((x) => x * who.react) as [number, number];
  let i = 0;
  let readyAt = -1;
  let wait = 0;
  while (!s.result) {
    const cmds: SimCommand[] = [];
    if (bot === 'idle') {
      stepMut(s, cmds);
      continue;
    }
    const ownedSlots = (['melee', 'ranged', 'tank'] as Slot[]).filter((x) => x === 'melee' || save.owned[x as 'ranged' | 'tank']);
    let slot: Slot = bot === 'random' ? ownedSlots[i % 7 === 0 ? 0 : Math.floor(r() * ownedSlots.length)] ?? 'melee' : pattern[i % pattern.length]!;
    // Like a person: when enemies close in and the planned card is not affordable, tap the cheapest one that is.
    if (bot !== 'random' && s.food < roster[slot].cost * 1000 && s.units.some((u) => u.side === 'enemy' && u.x < 500_000)) {
      const cheapest = ownedSlots.filter((x) => s.food >= roster[x].cost * 1000).sort((a, b) => roster[a].cost - roster[b].cost)[0];
      if (cheapest) slot = cheapest;
    }
    if (s.food >= roster[slot].cost * 1000) {
      if (readyAt < 0) {
        readyAt = s.tick;
        wait = Math.round((rmin + r() * (rmax - rmin)) * TICKS_PER_SECOND);
      }
      if (s.tick - readyAt >= wait) {
        // follow the rotation for as many cards as the Food covers, up to this player's burst size
        let food = s.food;
        for (let k = 0; k < BURST[bot]; k++) {
          const sl = k === 0 || bot === 'random' ? slot : pattern[(i + k) % pattern.length]!;
          const cost = roster[sl].cost * 1000;
          if (food < cost) break;
          food -= cost;
          cmds.push({ kind: 'deploy', slot: sl });
        }
        readyAt = -1;
      }
    }
    if ((bot === 'casual' || bot === 'average') && s.stormcall.unlocked && s.tick >= s.stormcall.readyAt && s.stormcall.strikeAt < 0) {
      const aim = stormcallAim(s.units);
      if (aim && aim.weight >= 3) cmds.push({ kind: 'stormcall' });
    }
    const ev = stepMut(s, cmds);
    i += ev.filter((e) => e.kind === 'deployQueued').length; // the rotation only moves on for accepted deploys
    opts.onTick?.(s);
  }
  const seconds = s.tick / TICKS_PER_SECOND;
  return { result: s.result, seconds, gold: s.goldEarned, kills: s.stats.kills, stormRising: seconds >= STORM.risingSec };
}

/** Bot shopping between battles. */
export function shop(save: SaveV1, bot: BotKind, r: () => number, who: Persona = NEUTRAL): { save: SaveV1; purchases: number } {
  let s = save;
  let purchases = 0;
  const buyUnlocks = () => {
    for (const slot of ['ranged', 'tank'] as const) if (canUnlock(s, slot)) { s = unlockSlot(s, slot); purchases++; }
  };
  if (bot === 'idle') return { save: s, purchases };
  if (bot === 'lazy' || bot === 'slow') {
    const rec = recommendUpgrade(s);
    if (rec) return { save: applyRecommendation(s, rec), purchases: 1 };
    return { save: s, purchases };
  }
  buyUnlocks();
  for (;;) {
    if (bot === 'random') {
      const t = TRACKS.filter((x) => canUpgrade(s, x))[Math.floor(r() * 5)];
      if (!t) break;
      s = upgrade(s, t);
    } else {
      const t = TRACKS.filter((x) => canUpgrade(s, x)).sort((a, b) => priceFor(s, a)! * who.weights[a] - priceFor(s, b)! * who.weights[b])[0];
      if (!t) break;
      s = upgrade(s, t);
    }
    purchases++;
  }
  return { save: s, purchases };
}

export interface StageReport {
  stage: number;
  attempts: number;
  firstTryWin: boolean;
  durations: number[];
  lossGold: number[]; // Gold earned in each lost attempt
  stormRising: number; // attempts that reached Storm Rising
}

export interface CampaignReport {
  bot: BotKind;
  seed: number;
  completed: boolean;
  stages: StageReport[];
  firstEvolveMin: number | null;
  totalMin: number;
  stuckStage: number | null;
  affordableAfterBattle: number; // share of battles in the first 30 min after which something was affordable
}

const OVERHEAD_SEC = 22;

export function runCampaign(bot: BotKind, seed: number, opts: { maxStage?: number; maxAttempts?: number } = {}): CampaignReport {
  const r = rng(seed);
  const who = persona(seed);
  const maxStage = opts.maxStage ?? STAGE_COUNT;
  const maxAttempts = opts.maxAttempts ?? 25;
  let save = newSave();
  let clock = 0;
  let firstEvolve: number | null = null;
  let battlesEarly = 0;
  let affordableEarly = 0;
  const stages: StageReport[] = [];
  let battleNo = 0;
  while (save.campaignStage <= maxStage) {
    const stageId = save.campaignStage;
    if (mustEvolve(save)) {
      if (!canEvolve(save)) break;
      save = evolve(save);
      if (firstEvolve === null) firstEvolve = clock / 60;
      clock += 4;
    }
    const rep: StageReport = { stage: stageId, attempts: 0, firstTryWin: false, durations: [], lossGold: [], stormRising: 0 };
    stages.push(rep);
    while (save.campaignStage === stageId && rep.attempts < maxAttempts) {
      save = shop(save, bot, r, who).save;
      const out = playBattle(save, stageId, bot, r, seed * 1000 + battleNo, { persona: who });
      battleNo++;
      rep.attempts++;
      rep.durations.push(out.seconds);
      if (out.stormRising) rep.stormRising++;
      if (out.result !== 'victory') rep.lossGold.push(out.gold);
      if (rep.attempts === 1) rep.firstTryWin = out.result === 'victory';
      save = settleBattle(save, `b${battleNo}`, stageId, out.result, out.gold, out.seconds).save;
      clock += out.seconds + OVERHEAD_SEC;
      if (clock <= 30 * 60) {
        battlesEarly++;
        if (affordableCount(save) > 0) affordableEarly++;
      }
    }
    if (save.campaignStage === stageId) {
      return { bot, seed, completed: false, stages, firstEvolveMin: firstEvolve, totalMin: clock / 60, stuckStage: stageId, affordableAfterBattle: battlesEarly ? affordableEarly / battlesEarly : 0 };
    }
  }
  return {
    bot,
    seed,
    completed: save.campaignStage > maxStage,
    stages,
    firstEvolveMin: firstEvolve,
    totalMin: clock / 60,
    stuckStage: null,
    affordableAfterBattle: battlesEarly ? affordableEarly / battlesEarly : 0,
  };
}

export const quantile = (xs: number[], q: number) => {
  if (!xs.length) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(q * a.length))]!;
};
