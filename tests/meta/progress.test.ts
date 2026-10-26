import { describe, expect, it } from 'vitest';
import {
  assistFor, battleInput, canEvolve, canPlayStage, evolve, evolvePrice, mustEvolve, recommendUpgrade, settleBattle, unlockSlot, upgrade,
} from '../../src/meta/progress';
import { migrate, newSave, parseSave } from '../../src/meta/save';
import { EVOLVE_PRICE, upgradePrice, victoryBonus } from '../../src/data/economy';

describe('progression', () => {
  it('settles a battle exactly once per battleId and pays the first-clear bonus once', () => {
    const s0 = newSave();
    const a = settleBattle(s0, 'b1', 1, 'victory', 23, 40);
    expect(a.settlement.total).toBe(23 + victoryBonus('stone', 0, false));
    expect(a.save.campaignStage).toBe(2);
    const again = settleBattle(a.save, 'b1', 1, 'victory', 23, 40);
    expect(again.save).toBe(a.save);
    const replay = settleBattle(a.save, 'b2', 1, 'victory', 5, 40);
    expect(replay.settlement.bonus).toBe(Math.floor(victoryBonus('stone', 0, false) / 2));
  });

  it('keeps battle Gold on defeat and counts the loss streak for the assist', () => {
    const r = settleBattle(newSave(), 'x', 1, 'defeat', 9, 30);
    expect(r.save.gold).toBe(9);
    expect(r.save.lossStreak).toBe(1);
    expect(battleInput(r.save, 1, 1).assist).toBeCloseTo(assistFor(1));
    expect(assistFor(100)).toBe(0.3);
  });

  it('guards unlocks and upgrades by Gold and prerequisites', () => {
    let s = { ...newSave(), gold: 100 };
    expect(unlockSlot(s, 'tank')).toBe(s); // needs Ranged first
    s = unlockSlot(s, 'ranged');
    expect(s.owned.ranged).toBe(true);
    expect(s.gold).toBe(70);
    const p = upgradePrice('food', 'stone', 1)!;
    s = upgrade(s, 'food');
    expect(s.levels.food).toBe(2);
    expect(s.gold).toBe(70 - p);
    expect(upgrade({ ...s, gold: 0 }, 'food').levels.food).toBe(2);
  });

  it('evolves for free after the Warlord, resetting the Camp but keeping Gold and slots', () => {
    const s = { ...newSave(), gold: 50, campaignStage: 6, owned: { ranged: true, tank: false }, levels: { food: 4, walls: 3, melee: 5, ranged: 2, tank: 1 } };
    expect(canEvolve(s)).toBe(false); // 50 Gold < early-Evolve price and the Warlord is not beaten
    const won = { ...s, warlordsBeaten: ['stone' as const] };
    expect(mustEvolve(won)).toBe(true);
    expect(evolvePrice(won)).toBe(0);
    const e = evolve(won);
    expect(e.armyAge).toBe('ancient');
    expect(e.levels).toEqual({ food: 1, walls: 1, melee: 1, ranged: 1, tank: 1 });
    expect(e.gold).toBe(50);
    expect(e.owned.ranged).toBe(true);
  });

  it('sells an early Evolve for Gold; the old Age (and its Warlord) is then fought with the new army', () => {
    const s = { ...newSave(), gold: EVOLVE_PRICE[0]! + 5, campaignStage: 3 };
    expect(evolvePrice(s)).toBe(180);
    const e = evolve(s);
    expect(e.armyAge).toBe('ancient');
    expect(e.gold).toBe(5);
    expect(e.campaignStage).toBe(3);
    expect(canPlayStage(e, 3)).toBe(true);
    // The army may lead the campaign frontier by one Age, never two.
    expect(evolvePrice({ ...e, gold: 10_000 })).toBeNull();
    // Beating the Stone Warlord with the Ancient army still pays its first-clear bonus.
    const won = settleBattle({ ...e, campaignStage: 5 }, 'w', 5, 'victory', 30, 100);
    expect(won.settlement.bonus).toBe(victoryBonus('stone', 4, true));
  });

  it('recommends exactly one affordable purchase, unlocks first, and nothing when broke', () => {
    expect(recommendUpgrade(newSave())).toBeNull();
    expect(recommendUpgrade({ ...newSave(), gold: 30 })).toEqual({ kind: 'unlock', slot: 'ranged', price: 30 });
    const r = recommendUpgrade({ ...newSave(), gold: 20, owned: { ranged: true, tank: false } });
    expect(r?.kind).toBe('upgrade');
    expect(r!.price).toBeLessThanOrEqual(20);
    const free = recommendUpgrade({ ...newSave(), campaignStage: 6, warlordsBeaten: ['stone'] });
    expect(free).toEqual({ kind: 'evolve', price: 0 });
  });

  it('settles a retreat like a defeat: Gold kept, no bonus, no progress', () => {
    const r = settleBattle(newSave(), 'r1', 1, 'retreat', 4, 20);
    expect(r.save.gold).toBe(4);
    expect(r.save.campaignStage).toBe(1);
    expect(r.settlement.bonus).toBe(0);
  });
});

describe('settlement and stage guards (QA regressions)', () => {
  it('never pays the same battle twice, even out of order', () => {
    let s = { ...newSave(), campaignStage: 3 };
    s = settleBattle(s, 'A', 3, 'defeat', 10, 30).save;
    s = settleBattle(s, 'B', 3, 'defeat', 12, 30).save;
    const again = settleBattle(s, 'A', 3, 'defeat', 10, 30);
    expect(again.save).toBe(s);
    expect(s.gold).toBe(22);
  });

  it('treats bad numbers as zero and refuses stages the player has not reached', () => {
    const r = settleBattle(newSave(), 'n', 1, 'defeat', Number.NaN, -40);
    expect(r.save.gold).toBe(0);
    expect(r.save.stats.playSeconds).toBe(0);
    const cheat = settleBattle(newSave(), 'x', 30, 'victory', 50, 60);
    expect(cheat.save).toEqual(newSave());
  });

  it('plays the campaign in order; Future replays open only after the campaign', () => {
    const s = { ...newSave(), campaignStage: 4 };
    expect(canPlayStage(s, 4)).toBe(true);
    expect(canPlayStage(s, 3)).toBe(false); // no Gold farming on earlier stages
    const done = { ...newSave(), campaignStage: 31, armyAge: 'future' as const };
    expect(canPlayStage(done, 27)).toBe(true);
    expect(canPlayStage(done, 12)).toBe(false);
  });
});

describe('save', () => {
  it('round-trips and repairs broken fields without losing the rest', () => {
    const s = { ...newSave(), gold: 123, campaignStage: 7 };
    expect(parseSave(JSON.stringify(s))).toEqual(s);
    const broken = migrate({ ...s, gold: -5, armyAge: 'banana', levels: { food: 99, melee: 'x' }, owned: { ranged: false, tank: true } });
    expect(broken.gold).toBe(0);
    expect(broken.armyAge).toBe('ancient'); // unknown Age → the campaign frontier's Age (stage 7 = Ancient)
    expect(broken.levels.food).toBe(10);
    expect(broken.levels.melee).toBe(1);
    expect(broken.owned.tank).toBe(false); // tank requires ranged
    expect(broken.campaignStage).toBe(7);
    expect(parseSave('{not json')).toBeNull();
    expect(migrate({ ...s, campaignStage: 2, armyAge: 'future' }).armyAge).toBe('ancient'); // at most one Age ahead
    expect(migrate({ ...s, campaignStage: 22, armyAge: 'stone' }).armyAge).toBe('gunpowder'); // at most one behind
  });
});
