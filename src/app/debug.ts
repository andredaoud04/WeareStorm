import type { Slot } from '../contracts';
import { newSave, type SaveV1 } from '../meta/save';
import { session, startBattle, type BattleSession } from './battleController';
import { commit, go, results, route, save, sheet } from './store';

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
    state: () => ({ route: route.value, save: save.value, hud: session.value?.hud.value ?? null, results: results.value }),
    deploy: (slot: Slot) => session.value?.deploy(slot),
    stormcall: () => session.value?.command({ kind: 'stormcall' }),
    setSpeed: (n: number) => session.value && (session.value.speed = n),
    /** Advance the running battle by `seconds` of sim time with a simple deploy policy (screenshots / e2e). */
    play: (seconds: number, deploy = true) => session.value && fastForward(session.value, seconds, deploy),
    setSave: (s: Partial<SaveV1>) => commit({ ...newSave(), ...s }),
  };
}

function fastForward(s: BattleSession, seconds: number, deploy: boolean) {
  const order: Slot[] = ['melee', 'melee', 'ranged', 'tank'];
  let i = 0;
  for (let t = 0; t < seconds * 20 && !s.ended$.value; t++) {
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
  ftue: { deploy1: true },
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
  switch (scene) {
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
      fixture({ gold: 36, campaignStage: 2, clearedStages: [1], stats: { battles: 1, victories: 1, goldEarned: 36, playSeconds: 40 }, ftue: { deploy1: true } });
      go('army');
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
      break;
  }
}
