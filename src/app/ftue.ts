import { computed, effect, signal } from '@preact/signals';
import { TICKS_PER_SECOND } from '../contracts';
import { canUnlock, canUpgrade } from '../meta/progress';
import type { SaveV1 } from '../meta/save';
import { SPEED_UNLOCK_STAGE, session } from './battleController';
import { slotName } from '../ui/skin';
import {
  markFtue, results, resultsPhase, resultsPrimary, route, save, sheet,
  type ResultsPhase, type ResultsPrimary, type Route,
} from './store';

/**
 * The first-ten-minutes coach (GDD §1.5, UX §8). Steps are data; which one shows is a pure function of the save's
 * FTUE flags, the screen and a few battle facts, so a step survives a reload mid-way and never repeats once learned.
 * Nimbus never blocks input or pauses the sim: the coach layer is click-through and each step is dismissed by doing
 * the thing it teaches.
 */

export interface CoachStep {
  id: string;
  /** Nimbus's one-liner; null shows the hand alone. */
  text: string | null;
  /** `data-testid` of the element the coach points at. */
  target: string;
  hand: boolean;
  /** Which side of the target the hand sits on (it points at the target from there). */
  place: 'above' | 'below' | 'left';
  /** Put the bubble beside the hand instead of beyond it (keeps it off the lane). */
  side?: boolean;
  /** Show the bubble in free space at the top or bottom of the screen instead of next to the hand. */
  bubble?: 'top' | 'bottom';
}

const step = (s: CoachStep) => s;

/** The coach teaches in the Stone Age, where troops wear their kit names (src/ui/skin.ts). */
const MELEE = slotName('stone', 'melee');
const RANGED = slotName('stone', 'ranged');
const TANK = slotName('stone', 'tank');
const an = (w: string) => (/^[AEIOU]/i.test(w) ? 'An' : 'A');

/** GDD §1.5 copy where the GDD gives it. */
export const COACH = {
  food: step({ id: 'food', text: 'Food fills up. Troops cost Food!', target: 'food', hand: false, place: 'above' }),
  deploy: step({ id: 'deploy', text: `Tap to send ${an(MELEE).toLowerCase()} ${MELEE}!`, target: 'card-melee', hand: true, place: 'above' }),
  ranged: step({ id: 'ranged', text: `${RANGED}s shoot from behind your ${MELEE}s.`, target: 'card-ranged', hand: false, place: 'above' }),
  speed: step({ id: 'speed', text: 'Tap for ×2 speed!', target: 'speed', hand: true, place: 'below' }),
  stormcall: step({ id: 'stormcall', text: 'Call the storm!', target: 'stormcall', hand: true, place: 'above', side: true }),
  warlord: step({ id: 'warlord', text: 'Beat the Warlord to break the ward!', target: 'boss-bar', hand: false, place: 'below' }),
  recruitTab: step({ id: 'recruit', text: 'New recruit available!', target: 'tab-army', hand: true, place: 'above', bubble: 'top' }),
  recruitArmy: step({ id: 'recruit', text: 'New recruit available!', target: 'unlock-ranged', hand: true, place: 'above', bubble: 'bottom' }),
  upgradeResults: step({ id: 'results-upgrade', text: null, target: 'results-primary', hand: true, place: 'above' }),
  backHub: step({ id: 'back', text: 'Back to battle!', target: 'battle', hand: true, place: 'above' }),
  backArmy: step({ id: 'back', text: 'Back to battle!', target: 'tab-hub', hand: true, place: 'above' }),
  foodTab: step({ id: 'food-up', text: 'More Food = more troops!', target: 'tab-army', hand: true, place: 'above', bubble: 'top' }),
  foodArmy: step({ id: 'food-up', text: 'More Food = more troops!', target: 'buy-food', hand: true, place: 'left', bubble: 'bottom' }),
  tankTab: step({ id: 'tank', text: `${an(TANK)} ${TANK} can join you!`, target: 'tab-army', hand: true, place: 'above', bubble: 'top' }),
  tankArmy: step({ id: 'tank', text: `${an(TANK)} ${TANK} can join you!`, target: 'unlock-tank', hand: true, place: 'above', bubble: 'bottom' }),
} as const;

/** Every flag the coach writes; fixtures that should show no coach set them all. */
export const FTUE_FLAGS = ['deploy1', 'ranged', 'speedUsed', 'speedSeen', 'stormcall', 'warlord', 'recruit', 'back', 'food-upSeen', 'tankSeen'] as const;
export const FTUE_DONE: Record<string, boolean> = Object.fromEntries(FTUE_FLAGS.map((f) => [f, true]));

/** The ×2 tooltip shows from 0.8 s to this many seconds into the battle (it sits over the sky, so it is brief). */
export const SPEED_COACH_SEC = 9;
/** Nimbus's Warlord line stays this long after the Warlord walks in. */
export const WARLORD_COACH_SEC = 7;

export interface BattleFacts {
  stageId: number;
  seconds: number;
  ended: boolean;
  /** Deploys accepted this battle. */
  deploys: number;
  meleeReady: boolean;
  rangedOwned: boolean;
  speedShown: boolean;
  stormReady: boolean;
  /** Battle seconds at which the Warlord walked in, or null. */
  warlordIntroAt: number | null;
}

export interface CoachFacts {
  route: Route;
  sheetOpen: boolean;
  save: SaveV1;
  battle: BattleFacts | null;
  results: { phase: ResultsPhase; primary: ResultsPrimary; win: boolean } | null;
}

/** The coach covers the Stone Age only (Battles 1–5 and the first Evolve). */
export const inTutorial = (s: SaveV1) => s.armyAge === 'stone' && s.campaignStage <= 6;

export function selectCoach(f: CoachFacts): CoachStep | null {
  const s = f.save;
  if (f.sheetOpen || !inTutorial(s)) return null;
  const ftue = s.ftue;
  if (f.route === 'battle') {
    if (f.results && f.results.phase !== 'hidden') {
      // after a loss the sheet's own tip says what to buy; the hand would only cover it
      if (f.results.phase !== 'done' || f.results.primary !== 'upgrade' || !f.results.win) return null;
      const camp = campCoach(s, 'army');
      return camp && camp.id !== 'back' ? COACH.upgradeResults : null;
    }
    const b = f.battle;
    if (!b || b.ended) return null;
    if (b.stageId === 1 && !ftue.deploy1) return b.meleeReady ? COACH.deploy : b.deploys === 0 ? COACH.food : null;
    if (b.stormReady && !ftue.stormcall) return COACH.stormcall;
    if (b.warlordIntroAt !== null && !ftue.warlord && b.seconds - b.warlordIntroAt < WARLORD_COACH_SEC) return COACH.warlord;
    if (b.speedShown && !ftue.speedUsed && !ftue.speedSeen && !ftue.speed && b.seconds >= 0.8 && b.seconds < SPEED_COACH_SEC) return COACH.speed;
    if (b.rangedOwned && !ftue.ranged && b.seconds >= 1.5) return COACH.ranged;
    return null;
  }
  if (f.route === 'hub' || f.route === 'army') return campCoach(s, f.route);
  return null;
}

/** Hub and Army: the recruit → back-to-battle beat after Battle 1, then Food Lv 2 and the Rockhide (GDD §1.5). */
function campCoach(s: SaveV1, r: 'hub' | 'army'): CoachStep | null {
  const ftue = s.ftue;
  const army = r === 'army';
  if (ftue.recruit && !ftue.back && s.owned.ranged) return army ? COACH.backArmy : COACH.backHub;
  if (!s.owned.ranged && canUnlock(s, 'ranged')) return army ? COACH.recruitArmy : COACH.recruitTab;
  if (s.owned.ranged && !s.owned.tank && !ftue.tankSeen && s.clearedStages.includes(3) && canUnlock(s, 'tank')) return army ? COACH.tankArmy : COACH.tankTab;
  if (s.owned.ranged && s.levels.food === 1 && !ftue['food-upSeen'] && s.clearedStages.includes(2) && canUpgrade(s, 'food')) return army ? COACH.foodArmy : COACH.foodTab;
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Runtime: battle facts from events, flags written when a lesson is learned.

interface LiveFacts {
  battleId: string | null;
  deploys: number;
  warlordIntroAt: number | null;
}
const live = signal<LiveFacts>({ battleId: null, deploys: 0, warlordIntroAt: null });

export const coachStep = computed<CoachStep | null>(() => {
  const s = session.value;
  const hud = s?.hud.value;
  const r = results.value;
  const st = save.value;
  const l = live.value;
  const battle: BattleFacts | null =
    s && hud
      ? {
          stageId: s.stage.id,
          seconds: hud.seconds,
          ended: s.ended$.value,
          deploys: l.battleId === s.id ? l.deploys : 0,
          meleeReady: hud.food >= s.cost('melee') && !hud.full,
          rangedOwned: s.state.input.owned.ranged,
          speedShown: s.stage.id >= SPEED_UNLOCK_STAGE,
          stormReady: hud.stormcall.unlocked && hud.stormcall.ready,
          warlordIntroAt: l.battleId === s.id ? l.warlordIntroAt : null,
        }
      : null;
  return selectCoach({
    route: route.value,
    sheetOpen: sheet.value !== null,
    save: st,
    battle,
    results: r && s && r.battleId === s.id ? { phase: resultsPhase.value, primary: resultsPrimary(r, st), win: r.result === 'victory' } : null,
  });
});

let installed = false;

export function initFtue() {
  if (installed) return;
  installed = true;
  let off: (() => void) | null = null;
  effect(() => {
    const s = session.value;
    off?.();
    off = null;
    live.value = { battleId: s?.id ?? null, deploys: 0, warlordIntroAt: null };
    if (!s) return;
    if (save.peek().ftue.recruit) markFtue('back'); // "Back to battle!" is done once a battle starts
    off = s.onEvents((events) => {
      for (const e of events) {
        if (e.kind === 'deployQueued') {
          const deploys = live.peek().deploys + 1;
          live.value = { ...live.peek(), deploys };
          if (s.stage.id === 1 && deploys >= 3) markFtue('deploy1'); // the Battle 1 coach leaves after the third deploy
          if (e.slot === 'ranged') markFtue('ranged');
        } else if (e.kind === 'stormcallCast') markFtue('stormcall');
        else if (e.kind === 'warlordIntro') live.value = { ...live.peek(), warlordIntroAt: s.curr.tick / TICKS_PER_SECOND };
        else if (e.kind === 'wardBroken' && live.peek().warlordIntroAt !== null) markFtue('warlord');
        else if (e.kind === 'end') {
          if (live.peek().warlordIntroAt !== null) markFtue('warlord');
          if (s.stage.id >= SPEED_UNLOCK_STAGE) markFtue('speedSeen');
        }
      }
    });
  });
  // A pointer the player saw in the Army and walked away from is not repeated (the recruit one stays until bought).
  let lastArmyStep: string | null = null;
  effect(() => {
    const r = route.value;
    const c = coachStep.value;
    if (r === 'army') lastArmyStep = c?.id ?? lastArmyStep;
    else if (lastArmyStep) {
      if (lastArmyStep === 'food-up' || lastArmyStep === 'tank') markFtue(`${lastArmyStep}Seen`);
      lastArmyStep = null;
    }
  });
}
