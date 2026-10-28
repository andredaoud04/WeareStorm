import { batch, computed, signal } from '@preact/signals';
import type { BattleResult, Slot } from '../contracts';
import type { Track } from '../data/economy';
import { stageDef, STAGE_COUNT } from '../data/stages';
import {
  affordableCount, canEvolve, evolve, evolvePrice, mustEvolve, recommendUpgrade, settleBattle, unlockSlot, upgrade,
  type Recommendation, type Settlement,
} from '../meta/progress';
import { newSave, type SaveV1 } from '../meta/save';
import { nextAgeInBuild } from './build';
import { loadSave, writeSave } from './storage';

/** App-wide state as signals. Screens read these; only the actions below change them. */

export type Route = 'title' | 'hub' | 'battle' | 'army' | 'ages';
export type SheetKind = 'pause' | 'settings' | 'retreat' | null;
/** What the Army screen should bring into view and highlight (the Results "Upgrade" deep link). */
export type ArmyFocus = Exclude<Recommendation, { kind: 'evolve' }>;

export const save = signal<SaveV1>(newSave());
export const route = signal<Route>('title');
export const sheet = signal<SheetKind>(null);

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad' | 'storm';
}
export const toasts = signal<Toast[]>([]);
let toastId = 0;
export function toast(text: string, tone: Toast['tone'] = 'info', ms = 2000) {
  const t = { id: ++toastId, text, tone };
  toasts.value = [...toasts.value.slice(-2), t];
  setTimeout(() => (toasts.value = toasts.value.filter((x) => x.id !== t.id)), ms);
}

export interface ResultsView {
  battleId: string;
  stageId: number;
  result: BattleResult;
  settlement: Settlement;
  kills: number;
  /** Gold from kills and from base (or Warlord) damage; together they are the battle's Gold kept. */
  killGold: number;
  baseGold: number;
  seconds: number;
  warlord: boolean;
  next: Recommendation | null;
}
export const results = signal<ResultsView | null>(null);
/** Where the Results choreography is (ART_BIBLE §5.14): banner first, then the sheet, then the counts are done. */
export type ResultsPhase = 'hidden' | 'banner' | 'panel' | 'done';
export const resultsPhase = signal<ResultsPhase>('hidden');
export const armyFocus = signal<ArmyFocus | null>(null);

export type ResultsPrimary = 'evolve' | 'upgrade' | 'next' | 'retry';

/** The smart primary button on Results (GDD §1.3): Evolve after a Warlord, else Upgrade if affordable, else play on. */
export function resultsPrimary(r: ResultsView, s: SaveV1): ResultsPrimary {
  const win = r.result === 'victory';
  if (win && r.warlord && canEvolve(s) && nextAgeInBuild(s)) return 'evolve';
  if (r.next && r.next.kind !== 'evolve') return 'upgrade';
  return win ? 'next' : 'retry';
}

/** The battle the Hub's big button starts: the frontier stage (the last stage once the campaign is complete). */
export const nextStage = computed(() => Math.min(STAGE_COUNT, save.value.campaignStage));
export const campaignComplete = computed(() => save.value.campaignStage > STAGE_COUNT);
export const affordable = computed(() => affordableCount(save.value));
export const evolveReady = computed(() => nextAgeInBuild(save.value) && canEvolve(save.value) && (mustEvolve(save.value) || evolvePrice(save.value) === 0));

export function boot() {
  const s = loadSave();
  // A battle that was running when the app died is settled as a retreat: its Gold is kept (GDD §2.11).
  if (s.pendingBattle) {
    const p = s.pendingBattle;
    const settled = settleBattle(s, p.battleId, p.stageId, 'retreat', p.goldEarned, 0).save;
    commit(settled);
  } else save.value = s;
}

export function commit(next: SaveV1) {
  if (next === save.peek()) return;
  save.value = next;
  writeSave(next);
}

export function go(r: Route) {
  batch(() => {
    sheet.value = null;
    route.value = r;
  });
}

export function buyUpgrade(track: Track): boolean {
  const next = upgrade(save.value, track);
  if (next === save.value) return false;
  commit(next);
  return true;
}

export function buyUnlock(slot: Exclude<Slot, 'melee'>): boolean {
  const next = unlockSlot(save.value, slot);
  if (next === save.value) return false;
  commit(next);
  return true;
}

export function doEvolve(): boolean {
  const next = evolve(save.value);
  if (next === save.value) return false;
  commit(next);
  return true;
}

export function setSetting<K extends keyof SaveV1['settings']>(k: K, v: SaveV1['settings'][K]) {
  commit({ ...save.value, settings: { ...save.value.settings, [k]: v } });
}

/** Safe to call inside effects: it reads the save untracked, so the caller doesn't re-run on every save write. */
export function markFtue(flag: string) {
  const s = save.peek();
  if (s.ftue[flag]) return;
  commit({ ...s, ftue: { ...s.ftue, [flag]: true } });
}

/** Records the running battle so a crash or a closed tab still pays the Gold earned so far. */
export function markPending(battleId: string, stageId: number, goldEarned: number) {
  const p = save.value.pendingBattle;
  if (p && p.battleId === battleId && p.goldEarned === goldEarned) return;
  commit({ ...save.value, pendingBattle: { battleId, stageId, goldEarned } });
}

export function finishBattle(v: Omit<ResultsView, 'settlement' | 'next' | 'warlord'> & { goldEarned: number }) {
  const { save: next, settlement } = settleBattle(save.value, v.battleId, v.stageId, v.result, v.goldEarned, v.seconds);
  commit(next);
  results.value = {
    battleId: v.battleId,
    stageId: v.stageId,
    result: v.result,
    settlement,
    kills: v.kills,
    killGold: v.killGold,
    baseGold: v.baseGold,
    seconds: v.seconds,
    warlord: stageDef(v.stageId).warlord,
    next: recommendUpgrade(next),
  };
}
