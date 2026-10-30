import { effect, untracked } from '@preact/signals';
import { pixiHost } from '../render/pixi/app';
import { AGE_ORDER, type AgeId } from '../contracts';
import { stageDef } from '../data/stages';
import { kitForAge } from '../render/kits/ageKits';
import { preloadKits } from '../render/kits/loader';
import { BattleScene } from '../render/scenes/battleScene';
import { session } from './battleController';
import { reduceMotion } from './motion';
import { nextStage, route, save } from './store';

/**
 * Owns the Pixi world for the app's lifetime: one scene that is the Hub diorama when no battle runs and the lane
 * during a battle. The frame loop advances the running battle, then draws.
 */
let scene: BattleScene | null = null;

/**
 * Top of the bottom UI (deck or the Hub's CTA block), measured from the DOM so world and UI never disagree. It reads
 * the layout box (offsetTop), not the painted one, so an entrance animation (the deck sliding up) can't shift the lane.
 */
function uiTop(): number {
  const el = document.querySelector<HTMLElement>('[data-uitop]');
  if (!el) return innerHeight * 0.78;
  let y = 0;
  for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) y += e.offsetTop;
  return y;
}

/** Defeat desaturates the world (ART_BIBLE §5.14) — the canvas only, never the DOM HUD. */
export function setWorldMood(mood: 'defeat' | null) {
  document.getElementById('world')?.classList.toggle('mood-defeat', mood === 'defeat');
}

/** Your army's Age and the next stage's (the Hub diorama shows both). */
function hubAges(): { army: AgeId; field: AgeId } {
  return { army: save.value.armyAge, field: stageDef(nextStage.value).age };
}

/**
 * Art kits load on demand: the ones the Hub shows now plus the next Age's, so an Evolve or the next battle never waits.
 * Runs whenever the save changes (cheap: loaded kits are cached).
 */
function preloadArt() {
  const { army, field } = hubAges();
  const next = AGE_ORDER[Math.min(AGE_ORDER.length - 1, AGE_ORDER.indexOf(army) + 1)]!;
  preloadKits([army, field, next].map(kitForAge));
}

export async function startWorld() {
  effect(preloadArt);
  const host = await pixiHost();
  scene = new BattleScene(host, {
    uiTop,
    reduceMotion,
    damageNumbers: () => save.value.settings.damageNumbers,
    hubAges,
  });
  effect(() => {
    const s = session.value;
    const r = route.value;
    untracked(() => scene?.attach(r === 'battle' ? s : null)); // reads the save for the Hub's Ages: not a trigger
    setWorldMood(null);
    host.world.visible = true; // the title sits over the living diorama
    // the DOM moves when the route changes; re-measure after it lays out
    requestAnimationFrame(() => scene?.layout());
  });
  if (import.meta.env.DEV || location.search.includes('scene=')) (window as unknown as { __scene?: unknown }).__scene = scene;
  host.app.ticker.add((t) => {
    const dt = t.deltaMS;
    const s = session.value;
    if (s && route.value === 'battle') s.frame(dt);
    scene?.draw(dt);
  });
}

export function relayoutWorld() {
  scene?.layout();
}

export function worldToScreen(x: number, heightWu = 0) {
  return scene?.toScreen(x, heightWu) ?? { x: innerWidth / 2, y: innerHeight / 2 };
}
