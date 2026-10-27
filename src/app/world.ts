import { effect } from '@preact/signals';
import { pixiHost } from '../render/pixi/app';
import { BattleScene } from '../render/scenes/battleScene';
import { session } from './battleController';
import { route, save } from './store';

/**
 * Owns the Pixi world for the app's lifetime: one scene that is the Hub diorama when no battle runs and the lane
 * during a battle. The frame loop advances the running battle, then draws.
 */
let scene: BattleScene | null = null;

/** Top of the bottom UI (deck or the Hub's CTA block), measured from the DOM so world and UI never disagree. */
function uiTop(): number {
  const el = document.querySelector('[data-uitop]');
  return el ? el.getBoundingClientRect().top : innerHeight * 0.78;
}

export async function startWorld() {
  const host = await pixiHost();
  scene = new BattleScene(host, {
    uiTop,
    reduceMotion: () => save.value.settings.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches,
    damageNumbers: () => save.value.settings.damageNumbers,
  });
  effect(() => {
    const s = session.value;
    const r = route.value;
    scene?.attach(r === 'battle' ? s : null);
    host.world.visible = r !== 'title';
    // the DOM moves when the route changes; re-measure after it lays out
    requestAnimationFrame(() => scene?.layout());
  });
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
