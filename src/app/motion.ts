import { computed, effect, signal } from '@preact/signals';
import { save } from './store';

/**
 * The one Reduce Motion switch (UX §9, ART_BIBLE §5.14 rule 5): the in-game toggle OR the OS setting. Everything that
 * moves asks here — camera shake, coin flights, confetti, banner slides, the storm wipe — and CSS reads the same
 * answer from `<html data-rm>`, so a stylesheet never needs its own media query.
 */

const query = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const osReduce = signal(!!query?.matches);
query?.addEventListener?.('change', (e) => (osReduce.value = e.matches));

export const reducedMotion = computed(() => save.value.settings.reduceMotion || osReduce.value);

/** Non-reactive read for event handlers and the Pixi frame loop. */
export const reduceMotion = (): boolean => reducedMotion.peek();

let installed = false;

/** Mirrors the switch onto `<html data-rm>` for CSS. */
export function installMotion() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  effect(() => {
    document.documentElement.toggleAttribute('data-rm', reducedMotion.value);
  });
}
