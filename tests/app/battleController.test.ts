import { beforeEach, describe, expect, it } from 'vitest';
import { BattleSession } from '../../src/app/battleController';
import { results, save } from '../../src/app/store';
import { newSave } from '../../src/meta/save';

describe('battle controller clock (TECH §4)', () => {
  beforeEach(() => {
    save.value = newSave();
    results.value = null;
  });

  it('runs exactly one 20 Hz tick per 50 ms at x1 and two at x2', () => {
    const s = new BattleSession(1, 7);
    s.frame(50);
    expect(s.state.tick).toBe(1);
    s.frame(25);
    expect(s.state.tick).toBe(1);
    expect(s.alpha).toBeCloseTo(0.5);
    s.speed = 2;
    s.frame(50);
    expect(s.state.tick).toBe(3);
  });

  it('stops time while paused and does not owe it back afterwards', () => {
    const s = new BattleSession(1, 7);
    s.paused = true;
    s.frame(200);
    s.frame(200);
    expect(s.state.tick).toBe(0);
    s.paused = false;
    s.frame(50);
    expect(s.state.tick).toBe(1);
  });

  it('freezes presentation during hit-stop without changing the outcome clock', () => {
    const s = new BattleSession(1, 7);
    s.hitStop(100);
    s.frame(50);
    s.frame(50);
    expect(s.state.tick).toBe(0);
    s.frame(50);
    expect(s.state.tick).toBe(1);
  });

  it('never runs more than 4 ticks per frame per speed step, and a huge frame delta is clamped', () => {
    const s = new BattleSession(1, 7);
    s.frame(5000);
    expect(s.state.tick).toBeLessThanOrEqual(4);
  });

  it('saves the Gold earned so far within half a second of sim time (a reload pays it)', () => {
    const s = new BattleSession(1, 7);
    const history: number[] = [];
    let checked = 0;
    for (let i = 0; i < 20 * 120 && !s.ended$.value; i++) {
      if (i % 10 === 0 && s.foodNow() >= s.cost('melee')) s.deploy('melee');
      s.frame(50);
      history[s.state.tick] = s.state.goldEarned;
      const p = save.value.pendingBattle;
      if (!p || p.battleId !== s.id || s.state.tick < 11) continue;
      // the saved figure is never older than 10 ticks
      expect(history.slice(s.state.tick - 10, s.state.tick + 1)).toContain(p.goldEarned);
      checked++;
    }
    expect(Math.max(...history.filter((g) => g !== undefined))).toBeGreaterThan(0);
    expect(checked).toBeGreaterThan(100);
  });

  it('refreshes the HUD at 10 Hz of real time at x1 and x2 alike', () => {
    for (const speed of [1, 2]) {
      const s = new BattleSession(1, 7);
      s.speed = speed;
      let updates = 0;
      const off = s.hud.subscribe(() => updates++);
      updates = 0;
      for (let i = 0; i < 60; i++) s.frame(1000 / 60); // one second at 60 fps
      off();
      expect(updates).toBeGreaterThanOrEqual(9);
      expect(updates).toBeLessThanOrEqual(11);
    }
  });

  it('starts at x2 only when the player chose it and the stage allows it (GDD §2.13)', () => {
    save.value = { ...newSave(), settings: { ...newSave().settings, fast: true } };
    expect(new BattleSession(1, 7).speed).toBe(1);
    expect(new BattleSession(3, 7).speed).toBe(2);
    save.value = newSave();
    expect(new BattleSession(3, 7).speed).toBe(1);
  });

  it('settles a retreat at once: Gold kept, results shown, pending battle cleared', () => {
    const s = new BattleSession(1, 7);
    for (let i = 0; i < 40; i++) s.frame(50);
    expect(save.value.pendingBattle?.battleId).toBe(s.id);
    s.retreat();
    expect(s.ended$.value).toBe(true);
    expect(results.value?.result).toBe('retreat');
    expect(save.value.pendingBattle).toBeNull();
    expect(save.value.stats.battles).toBe(1);
  });

  it('ignores player commands while paused or after the end', () => {
    const s = new BattleSession(1, 7);
    s.state.food = 50_000;
    s.paused = true;
    s.deploy('melee');
    s.paused = false;
    s.frame(50);
    expect(s.curr.queue.melee + s.curr.units.filter((u) => u.side === 'player').length).toBe(0);
  });

  it('splits the battle Gold into kills and base damage without touching the outcome (Results rows)', () => {
    for (const stageId of [1, 5]) {
      save.value = { ...newSave(), campaignStage: stageId, owned: { ranged: true, tank: true }, levels: { food: 6, walls: 5, melee: 7, ranged: 6, tank: 5 } };
      const s = new BattleSession(stageId, 11);
      const order = ['melee', 'ranged', 'tank'] as const;
      for (let i = 0; i < 20 * 400 && !s.ended$.value; i++) {
        const slot = order[i % 3]!;
        if (i % 7 === 0 && s.foodNow() >= s.cost(slot)) s.deploy(slot);
        s.frame(50);
      }
      expect(s.ended$.value).toBe(true);
      expect(s.killGold).toBeGreaterThan(0);
      expect(s.baseGold).toBeGreaterThan(0);
      expect(s.killGold + s.baseGold).toBe(s.state.goldEarned);
      expect(results.value?.killGold).toBe(s.killGold);
      expect(results.value?.baseGold).toBe(s.baseGold);
      expect(results.value!.killGold + results.value!.baseGold).toBe(results.value!.settlement.goldKept);
    }
  });
});
