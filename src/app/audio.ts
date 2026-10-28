import { computed, effect } from '@preact/signals';
import { Haptics } from '../audio/haptics';
import { Mixer, type PlayOpts } from '../audio/mixer';
import { MusicDirector, type MusicMode } from '../audio/music';
import { isSilence, sfxFor, type SfxWorld, type UnitInfo } from '../audio/sfx';
import { SOUNDS, SOUND_IDS, type SoundId } from '../audio/sounds';
import type { SimEvent } from '../contracts';
import type { SaveV1 } from '../meta/save';
import { session, type BattleSession } from './battleController';
import { results, route, save, sheet, toasts } from './store';

/**
 * Wires audio to the app: battle events → SFX and haptics, routes and sheets → music, settings → buses, and a
 * delegated listener that gives every button press its sound (ART_BIBLE: every tap answers with a sound) without
 * touching each screen. The first gesture anywhere (the title tap) creates and unlocks the AudioContext.
 */

export const mixer = new Mixer();
export const music = new MusicDirector(mixer);
/** Set by the first real gesture: browsers refuse (and log) vibration before the user has touched the page. */
let gestured = false;
export const haptics = new Haptics({ enabled: () => gestured && save.value.settings.haptics });

export function uiSound(id: SoundId, o?: PlayOpts) {
  mixer.play(id, o);
}

/** Count-up tick for Results rows: call with the shown value and the target. */
export function countTick(shown: number, target: number) {
  if (shown > 0 && target > 0) mixer.play('coinTick', { param: Math.min(1, shown / target) });
}

// ---------------------------------------------------------------------------------------------------------------
// Card taps answer immediately (UX: ≤ 30 ms); the matching deployQueued a tick later then stays quiet.

const TAP_WINDOW_MS = 400;
let pendingTaps: number[] = [];
const nowMs = () => performance.now();

function cardTapTick() {
  const s = session.value;
  const q = s ? s.curr.queue.melee + s.curr.queue.ranged + s.curr.queue.tank : 0;
  const steps = [0, 2, 4, 5, 5];
  if (mixer.play('deployTick', { x: -40, pitch: steps[Math.min(4, q)] ?? 0 })) pendingTaps.push(nowMs());
}

function consumeTapTick(): boolean {
  const t = nowMs();
  pendingTaps = pendingTaps.filter((x) => t - x < TAP_WINDOW_MS);
  if (!pendingTaps.length) return false;
  pendingTaps.shift();
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Battle

let hot = false;

function onBattleEvent(e: SimEvent, w: SfxWorld) {
  const out = sfxFor(e, w);
  if (!isSilence(out)) {
    for (const c of out) {
      if (c.id === 'deployTick' && consumeTapTick()) continue;
      mixer.play(c.id, c);
    }
  }
  switch (e.kind) {
    case 'deployQueued':
      haptics.pulse('light');
      break;
    case 'hit':
      if (e.targetId === 'base' && e.targetSide === 'player' && e.amount > 0) haptics.pulse('medium');
      break;
    case 'end':
      if (e.result !== 'retreat') haptics.pulse('heavy');
      break;
    case 'stormRising':
    case 'warlordIntro':
      if (!hot) {
        hot = true;
        music.set({ hot: true });
      }
      break;
    default:
      break;
  }
}

function attachBattle(s: BattleSession): () => void {
  const known = new Map<number, UnitInfo>();
  const world: SfxWorld = { unit: (id) => known.get(id), tick: 0, speed: 1 };
  const off = s.onEvents((events, tick) => {
    for (const u of s.curr.units) {
      const k = known.get(u.id);
      if (k) k.x = u.x;
      else known.set(u.id, { x: u.x, role: u.role, side: u.side });
    }
    world.tick = tick;
    world.speed = s.speed;
    for (const e of events) onBattleEvent(e, world);
    for (const e of events) if (e.kind === 'death') known.delete(e.id);
  });
  return () => {
    off();
  };
}

// ---------------------------------------------------------------------------------------------------------------
// UI taps (delegated): buttons, tabs, toggles, deck cards, the Stormcall ring. `data-sfx="none"` opts out and
// `data-sfx="<sound id>"` picks a different sound.

function onPointerDown(ev: PointerEvent) {
  if (ev.button > 0) return;
  const t = ev.target as Element | null;
  const el = (t && typeof t.closest === 'function' ? t.closest('button, [data-sfx]') : null) as HTMLElement | null;
  if (!el) return;
  const custom = el.dataset.sfx;
  if (custom === 'none') return;
  if (custom && custom in SOUNDS) return uiSound(custom as SoundId);
  const cl = el.classList;
  if (cl.contains('card')) {
    if (cl.contains('ready') && !cl.contains('full') && !cl.contains('busy')) cardTapTick(); // a full army or queue refuses the tap
    else uiSound('nope');
    return;
  }
  if (cl.contains('storm-ring')) return cl.contains('ready') ? uiSound('stormTap') : uiSound('nope', { gain: 0.6 });
  if (el.getAttribute('aria-disabled') === 'true') return uiSound('nope');
  if (cl.contains('tab')) return uiSound(cl.contains('on') ? 'tap' : 'tab');
  if (cl.contains('toggle')) return uiSound(el.getAttribute('aria-pressed') === 'true' ? 'toggleOff' : 'toggleOn');
  uiSound('tap');
}

// ---------------------------------------------------------------------------------------------------------------

const levelSum = (s: SaveV1) => s.levels.food + s.levels.walls + s.levels.melee + s.levels.ranged + s.levels.tank;

let installed = false;

export function initAudio() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  // Unlock: create the context inside the first gesture, resume on any later one until it runs.
  const gesture = () => {
    gestured = true;
    const first = !mixer.ctx;
    mixer.unlock();
    if (first && mixer.ctx) music.start();
  };
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown', 'mousedown']) {
    window.addEventListener(type, gesture, { capture: true, passive: true });
  }
  document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => (document.hidden ? mixer.suspend() : mixer.resume()));

  // Per-setting computeds: the effects re-run when that setting changes, not on every save write.
  const soundOn = computed(() => save.value.settings.sound);
  const musicOn = computed(() => save.value.settings.music);
  effect(() => mixer.setSoundEnabled(soundOn.value));
  effect(() => {
    mixer.setMusicEnabled(musicOn.value);
    music.apply();
  });

  // Battles: subscribe to each session's events; reset the intensity per battle.
  let off: (() => void) | null = null;
  effect(() => {
    const s = session.value;
    off?.();
    off = s ? attachBattle(s) : null;
    hot = false;
    pendingTaps = [];
    music.set({ hot: false });
  });

  // Music follows the route, the pause sheet and the results screen.
  let prevRoute = route.peek();
  effect(() => {
    const r = route.value;
    const sh = sheet.value;
    const s = session.value;
    const res = results.value;
    const mode: MusicMode = r === 'battle' ? (res && s && res.battleId === s.id ? 'results' : 'battle') : r === 'title' ? 'title' : 'hub';
    music.set({ mode, paused: r === 'battle' && (sh === 'pause' || sh === 'retreat') });
    if (prevRoute === 'title' && r !== 'title') mixer.play('start');
    prevRoute = r;
  });
  effect(() => {
    const age = save.value.armyAge;
    if (music.current.age !== age) music.set({ age });
  });

  // Sheets swish open and closed.
  let prevSheet = sheet.peek();
  effect(() => {
    const sh = sheet.value;
    if (sh === prevSheet) return;
    uiSound(sh ? 'sheetOpen' : 'sheetClose');
    prevSheet = sh;
  });

  // Toasts pop (battle toasts already come with their own sting).
  let lastToast = 0;
  effect(() => {
    const ts = toasts.value;
    const t = ts[ts.length - 1];
    if (!t || t.id <= lastToast) return;
    lastToast = t.id;
    if (route.peek() !== 'battle' && t.tone !== 'storm') uiSound('toastPop');
  });

  // Purchases, unlocks and Evolve, read from the save so no screen needs to know about audio.
  let prevSave = save.peek();
  effect(() => {
    const s = save.value;
    const p = prevSave;
    prevSave = s;
    if (s === p) return;
    const r = route.peek();
    if (r === 'title' || r === 'battle') return;
    if (s.armyAge !== p.armyAge) uiSound('evolve');
    else if ((s.owned.ranged && !p.owned.ranged) || (s.owned.tank && !p.owned.tank)) uiSound('unlock');
    else if (s.gold < p.gold && levelSum(s) > levelSum(p)) uiSound('purchase');
  });

  installDebugAudio();
}

declare global {
  interface Window {
    __audio?: Record<string, unknown>;
  }
}

/** Measurement hooks for the audio verification script (debug builds and ?debug only). */
function installDebugAudio() {
  const params = new URLSearchParams(location.search);
  if (!(import.meta.env.DEV || params.has('debug') || params.has('scene'))) return;
  window.__audio = {
    mixer,
    music,
    haptics,
    ids: SOUND_IDS,
    play: (id: SoundId, o?: PlayOpts) => mixer.play(id, o),
    taps: () => mixer.debugTaps(),
    state: () => ({
      ctx: mixer.ctx ? (mixer.ctx as AudioContext).state : 'none',
      music: { playing: music.seq.playing, level: music.seq.currentLevel, scheduled: music.seq.scheduled, ...music.current },
      stats: mixer.stats,
    }),
  };
}
