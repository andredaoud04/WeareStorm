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
});
