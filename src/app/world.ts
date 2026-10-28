import { effect } from '@preact/signals';
import { pixiHost } from '../render/pixi/app';
import { bakePortraits } from '../render/art/portraits';
import { BattleScene } from '../render/scenes/battleScene';
import { session } from './battleController';
import { reduceMotion } from './motion';
import { route, save } from './store';

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

export async function startWorld() {
  const host = await pixiHost();
  scene = new BattleScene(host, {
    uiTop,
    reduceMotion,
    damageNumbers: () => save.value.settings.damageNumbers,
  });
  effect(() => {
    const s = session.value;
    const r = route.value;
    scene?.attach(r === 'battle' ? s : null);
    setWorldMood(null);
    host.world.visible = true; // the title sits over the living diorama
    // the DOM moves when the route changes; re-measure after it lays out
    requestAnimationFrame(() => scene?.layout());
  });
  if (import.meta.env.DEV || location.search.includes('scene=')) (window as unknown as { __scene?: unknown }).__scene = scene;
  bakePortraits();
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
