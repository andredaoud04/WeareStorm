import { AGE_ORDER, type AgeId, type Slot } from '../contracts';
import { stageDef } from '../data/stages';
import { recommendUpgrade } from '../meta/progress';
import { newSave, type SaveV1 } from '../meta/save';
import { session, startBattle, type BattleSession } from './battleController';
import { FTUE_DONE, coachStep } from './ftue';
import { armyFocus, commit, go, results, resultsPhase, route, save, sheet } from './store';

/**
 * Test and screenshot hooks. `window.__ws` drives the real game (Playwright e2e, UX §10 matrix); `?scene=` puts the
 * app in a named state with a fixture save. Neither touches the sim's rules: battles are advanced through the same
 * BattleSession.frame() the renderer uses.
 */

declare global {
  interface Window {
    __ws?: Record<string, unknown>;
  }
}

const params = new URLSearchParams(location.search);
const enabled = import.meta.env.DEV || params.has('debug') || params.has('scene');

export function installDebug() {
  if (!enabled) return;
  window.__ws = {
    state: () => ({ route: route.value, save: save.value, hud: session.value?.hud.value ?? null, results: results.value, resultsPhase: resultsPhase.value, coach: coachStep.value?.id ?? null }),
    deploy: (slot: Slot) => session.value?.deploy(slot),
    stormcall: () => session.value?.command({ kind: 'stormcall' }),
    setSpeed: (n: number) => session.value && (session.value.speed = n),
    /** Advance the running battle by `seconds` of sim time with a simple deploy policy (screenshots / e2e). */
    play: (seconds: number, deploy = true) => session.value && fastForward(session.value, seconds, deploy),
    setSave: (s: Partial<SaveV1>) => commit({ ...newSave(), ...s }),
  };
}

function fastForward(s: BattleSession, seconds: number, deploy: boolean, until?: () => boolean, order: Slot[] = ['melee', 'melee', 'ranged', 'tank']) {
  let i = 0;
  for (let t = 0; t < seconds * 20 && !s.ended$.value && !until?.(); t++) {
    if (deploy) {
      const owned = order.filter((x) => x === 'melee' || s.state.input.owned[x as 'ranged' | 'tank']);
      const slot = owned[i % owned.length]!;
      if (s.foodNow() >= s.cost(slot)) {
        s.deploy(slot);
        i++;
      }
    }
    s.frame(50);
  }
}

const STONE_MID: Partial<SaveV1> = {
  gold: 64,
  campaignStage: 4,
  clearedStages: [1, 2, 3],
  owned: { ranged: true, tank: true },
  levels: { food: 3, walls: 2, melee: 3, ranged: 2, tank: 1 },
  stats: { battles: 6, victories: 3, goldEarned: 260, playSeconds: 420 },
  ftue: FTUE_DONE, // the regular screens are shot without Nimbus; the coach-* scenes show each step
};

/** FTUE fixtures (GDD §1.5): the save right after Battle N, with the coach flags a real player would have by then. */
const AFTER_1: Partial<SaveV1> = { gold: 40, campaignStage: 2, clearedStages: [1], stats: { battles: 1, victories: 1, goldEarned: 40, playSeconds: 45 }, ftue: { deploy1: true } };
const AFTER_1_BOUGHT: Partial<SaveV1> = { ...AFTER_1, gold: 10, owned: { ranged: true, tank: false }, ftue: { deploy1: true, recruit: true } };
const AFTER_2: Partial<SaveV1> = { ...AFTER_1_BOUGHT, gold: 34, campaignStage: 3, clearedStages: [1, 2], stats: { battles: 2, victories: 2, goldEarned: 88, playSeconds: 140 }, ftue: { deploy1: true, recruit: true, back: true, ranged: true } };
const AFTER_3: Partial<SaveV1> = { ...AFTER_2, gold: 84, campaignStage: 4, clearedStages: [1, 2, 3], levels: { food: 2, walls: 1, melee: 2, ranged: 1, tank: 1 }, ftue: { ...AFTER_2.ftue, speedUsed: true, speedSeen: true, 'food-upSeen': true } };
const AFTER_4: Partial<SaveV1> = { ...AFTER_3, gold: 30, campaignStage: 5, clearedStages: [1, 2, 3, 4], owned: { ranged: true, tank: true }, levels: { food: 3, walls: 2, melee: 3, ranged: 2, tank: 1 }, ftue: { ...AFTER_3.ftue, tankSeen: true, stormcall: true } };

/** Later-campaign fixtures for the per-Age art review scenes. */
const strong = { food: 8, walls: 8, melee: 8, ranged: 8, tank: 8 };
const lateSave = (stage: number): Partial<SaveV1> => {
  const age = stageDef(stage).age;
  const cleared = Array.from({ length: stage - 1 }, (_, i) => i + 1);
  return { ...STONE_MID, armyAge: age, campaignStage: stage, clearedStages: cleared, warlordsBeaten: [], levels: { food: 5, walls: 4, melee: 5, ranged: 4, tank: 3 } };
};

/** Named states for the screenshot matrix (UX §10). */
export function loadScene() {
  const scene = params.get('scene');
  if (!scene) return;
  const fixture = (s: Partial<SaveV1>) => commit({ ...newSave(), ...s });
  const battle = (stageId: number, seconds: number, deploy = true) => {
    const s = startBattle(stageId);
    go('battle');
    fastForward(s, seconds, deploy);
    return s;
  };
  /** A battle frozen at a moment (presentation and sim both hold), for coach screenshots. */
  const frozen = (stageId: number, seconds: number, deploy = false) => {
    const s = battle(stageId, seconds, deploy);
    s.frame(100); // publish the HUD at that moment
    s.paused = true;
    return s;
  };
  const later = (ms: number, fn: () => void) => setTimeout(fn, ms);
  const click = (id: string) => (document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null)?.click();
  switch (scene) {

    case 'base': {
      // ?scene=base&state=damaged|critical|ruins&stage=4: a strong army plays until the enemy base reaches the state
      const stage = Number(params.get('stage') ?? 4);
      const state = params.get('state') ?? 'damaged';
      fixture({ ...(stage > 5 ? lateSave(stage) : STONE_MID), levels: { food: 8, walls: 8, melee: 1, ranged: stage > 5 ? 7 : 1, tank: 1 } }); // weak shots: the HP walks down gently
      const limit = state === 'damaged' ? 0.66 : state === 'critical' ? 0.33 : 0; // stop on entering the state
      const s = startBattle(stage);
      go('battle');
      // ranged troops only: they shoot from range, so the base stays in view
      fastForward(s, 400, true, () => s.curr.enemyBase.hp / s.curr.enemyBase.maxHp <= limit, ['ranged']);
      later(800, () => (s.paused = true)); // hold the state for the screenshot once its crossfade has played
      break;
    }
    case 'gallery':
      fixture({});
      go('title');
      document.getElementById('app')!.style.display = 'none';
      void import('../render/scenes/gallery').then((g) => g.showGallery(params.get('kit') ?? undefined));
      break;
    case 'title':
      fixture({});
      go('title');
      break;
    case 'hub':
      fixture(STONE_MID);
      go('hub');
      break;
    case 'hub-boss':
      fixture({ ...STONE_MID, campaignStage: 5, clearedStages: [1, 2, 3, 4], gold: 140 });
      go('hub');
      break;
    case 'hub-evolve':
      fixture({ ...STONE_MID, campaignStage: 6, clearedStages: [1, 2, 3, 4, 5], warlordsBeaten: ['stone'], gold: 210 });
      go('hub');
      break;
    case 'army':
      fixture(STONE_MID);
      go('army');
      break;
    case 'army-new':
      fixture({ ...AFTER_1, gold: 36, ftue: FTUE_DONE });
      go('army');
      break;
    case 'army-focus': {
      // Results → Upgrade: the Army opens on the recommended row
      fixture({ ...STONE_MID, gold: 90 });
      const rec = recommendUpgrade(save.value);
      armyFocus.value = rec && rec.kind !== 'evolve' ? rec : null;
      go('army');
      break;
    }
    case 'purchase':
      fixture({ ...STONE_MID, gold: 120 });
      go('army');
      later(700, () => click('buy-food'));
      break;
    case 'unlock-reveal':
      fixture({ ...AFTER_1, ftue: FTUE_DONE });
      go('army');
      later(700, () => click('unlock-ranged'));
      break;
    // ---- FTUE coach steps (GDD §1.5)
    case 'coach-food':
      fixture({ ftue: {} });
      frozen(1, 2.2);
      break;
    case 'coach-deploy':
      fixture({ ftue: {} });
      frozen(1, 5.2);
      break;
    case 'coach-results':
      fixture({ ftue: {} });
      battle(1, 400);
      break;
    case 'coach-recruit':
      fixture(AFTER_1);
      go('hub');
      break;
    case 'coach-recruit-army':
      fixture(AFTER_1);
      go('army');
      break;
    case 'coach-back':
      fixture(AFTER_1_BOUGHT);
      go('army');
      break;
    case 'coach-ranged':
      fixture(AFTER_1_BOUGHT);
      frozen(2, 2.4);
      break;
    case 'coach-food-up':
      fixture(AFTER_2);
      go('army');
      break;
    case 'coach-speed':
      fixture({ ...AFTER_2, levels: { food: 2, walls: 1, melee: 1, ranged: 1, tank: 1 } });
      frozen(3, 2.4);
      break;
    case 'coach-tank':
      fixture(AFTER_3);
      go('hub');
      break;
    case 'coach-storm':
      fixture({ ...AFTER_3, owned: { ranged: true, tank: true }, ftue: { ...AFTER_3.ftue, tankSeen: true } });
      frozen(4, 25.5, true);
      break;
    case 'coach-warlord':
      fixture(AFTER_4);
      frozen(5, 13.5, true);
      break;
    // ---- battle choreography
    case 'intro-banner':
      fixture(STONE_MID);
      battle(4, 0);
      break;
    case 'intro-warlord':
      fixture({ ...STONE_MID, campaignStage: 5, clearedStages: [1, 2, 3, 4] });
      battle(5, 0);
      break;
    case 'warlord-banner':
      fixture({ ...STONE_MID, campaignStage: 5, clearedStages: [1, 2, 3, 4], levels: { food: 4, walls: 3, melee: 4, ranged: 3, tank: 2 } });
      battle(5, 11.6);
      break;
    case 'wipe':
      fixture(STONE_MID);
      go('hub');
      later(900, () => click('battle'));
      break;
    case 'battle-rm':
      fixture({ ...STONE_MID, settings: { ...newSave().settings, reduceMotion: true } });
      battle(4, 24);
      break;
    case 'ages':
      fixture({ ...STONE_MID, gold: 200 });
      go('ages');
      break;
    case 'ages-evolve':
      fixture({ ...STONE_MID, campaignStage: 6, clearedStages: [1, 2, 3, 4, 5], warlordsBeaten: ['stone'], gold: 210 });
      go('ages');
      break;
    case 'settings':
      fixture(STONE_MID);
      go('hub');
      sheet.value = 'settings';
      break;
    case 'battle-start':
      fixture({ ftue: {} });
      battle(1, 3, false);
      break;
    case 'battle':
      fixture(STONE_MID);
      battle(4, 24);
      break;
    case 'battle-warlord':
      fixture({ ...STONE_MID, campaignStage: 5, clearedStages: [1, 2, 3, 4], levels: { food: 4, walls: 3, melee: 4, ranged: 3, tank: 2 } });
      battle(5, 40);
      break;
    case 'pause': {
      fixture(STONE_MID);
      const s = battle(4, 12);
      s.paused = true;
      sheet.value = 'pause';
      break;
    }
    case 'victory':
      fixture({ ...STONE_MID, levels: { food: 6, walls: 5, melee: 7, ranged: 6, tank: 5 } });
      battle(4, 400);
      break;
    case 'defeat':
      fixture({ ...STONE_MID, levels: { food: 1, walls: 1, melee: 1, ranged: 1, tank: 1 }, owned: { ranged: false, tank: false } });
      battle(4, 400, false);
      break;
    default:
      ageBattle(scene);
      break;
  }

  /**
   * Art review scenes, one per Age kit: `battle-<age>` is a mid-campaign crowd (the Age's 4th stage),
   * `battle-warlord-<age>` its Warlord stage with a strong army, `army-<age>` / `ages-<age>` those screens. Ages: stone, ancient, medieval, gunpowder,
   * industrial, future (the kit names primal / eldritch work too).
   */
  function ageBattle(name: string) {
    const screen = /^(army|ages)-(\w+)$/.exec(name); // `army-<age>` / `ages-<age>`: those screens mid-Age
    if (screen) {
      const a = ({ primal: 'stone', eldritch: 'medieval' } as Record<string, AgeId>)[screen[2]!] ?? (screen[2] as AgeId);
      if (!AGE_ORDER.includes(a)) return;
      fixture({ ...lateSave(AGE_ORDER.indexOf(a) * 5 + 4), gold: 200 });
      go(screen[1] as 'army' | 'ages');
      return;
    }
    const m = /^battle-(warlord-)?(\w+)$/.exec(name);
    const alias: Record<string, AgeId> = { primal: 'stone', eldritch: 'medieval' };
    const key = m?.[2] ?? '';
    const age = alias[key] ?? (AGE_ORDER.includes(key as AgeId) ? (key as AgeId) : null);
    if (!m || !age) return;
    const first = AGE_ORDER.indexOf(age) * 5 + 1;
    if (m[1]) {
      fixture({ ...lateSave(first + 4), levels: strong });
      battle(first + 4, 22);
    } else {
      fixture(lateSave(first + 3));
      battle(first + 3, 24);
    }
  }
}
