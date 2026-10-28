import { beforeEach, describe, expect, it } from 'vitest';
import { session, startBattle } from '../../src/app/battleController';
import { COACH, FTUE_DONE, coachStep, initFtue, selectCoach, type BattleFacts, type CoachFacts } from '../../src/app/ftue';
import { results, resultsPhase, route, save, sheet } from '../../src/app/store';
import { newSave, type SaveV1 } from '../../src/meta/save';

const battle = (o: Partial<BattleFacts> = {}): BattleFacts => ({
  stageId: 1, seconds: 2, ended: false, deploys: 0, meleeReady: false, rangedOwned: false, speedShown: false,
  stormReady: false, warlordIntroAt: null, ...o,
});
const facts = (s: Partial<SaveV1>, o: Partial<CoachFacts> = {}): CoachFacts => ({
  route: 'battle', sheetOpen: false, save: { ...newSave(), ...s }, battle: battle(), results: null, ...o,
});
const id = (f: CoachFacts) => selectCoach(f)?.id ?? null;

describe('FTUE coach step selection (GDD §1.5)', () => {
  it('Battle 1: explains Food first, points at the ready Clubber card, and is gone once deploy1 is learned', () => {
    expect(id(facts({}))).toBe('food');
    expect(id(facts({}, { battle: battle({ meleeReady: true }) }))).toBe('deploy');
    expect(selectCoach(facts({}, { battle: battle({ meleeReady: true }) }))).toBe(COACH.deploy);
    // between deploys (card refilling) Nimbus is quiet
    expect(id(facts({}, { battle: battle({ deploys: 1 }) }))).toBeNull();
    expect(id(facts({ ftue: { deploy1: true } }, { battle: battle({ meleeReady: true }) }))).toBeNull();
  });

  it('never shows during a sheet, after the battle ends, or outside the Stone tutorial', () => {
    expect(id(facts({}, { sheetOpen: true }))).toBeNull();
    expect(id(facts({}, { battle: battle({ ended: true }) }))).toBeNull();
    expect(id(facts({ campaignStage: 7, armyAge: 'ancient' }))).toBeNull();
  });

  it('teaches the Slinger, x2 speed, Stormcall and the Warlord once each', () => {
    const b2 = { stageId: 2, rangedOwned: true };
    const s = { ftue: { deploy1: true }, owned: { ranged: true, tank: false }, campaignStage: 2 };
    expect(id(facts(s, { battle: battle({ ...b2, seconds: 1 }) }))).toBeNull(); // let the intro banner pass
    expect(id(facts(s, { battle: battle(b2) }))).toBe('ranged');
    expect(id(facts({ ...s, ftue: { deploy1: true, ranged: true } }, { battle: battle(b2) }))).toBeNull();

    const b3 = { stageId: 3, rangedOwned: true, speedShown: true };
    const s3 = { ...s, ftue: { deploy1: true, ranged: true }, campaignStage: 3 };
    expect(id(facts(s3, { battle: battle({ ...b3, seconds: 3 }) }))).toBe('speed');
    expect(id(facts(s3, { battle: battle({ ...b3, seconds: 12 }) }))).toBeNull(); // brief: it sits over the sky
    expect(id(facts({ ...s3, ftue: { ...s3.ftue, speedUsed: true } }, { battle: battle({ ...b3, seconds: 3 }) }))).toBeNull();

    const s4 = { ...s3, ftue: { ...s3.ftue, speedSeen: true }, campaignStage: 4 };
    expect(id(facts(s4, { battle: battle({ ...b3, stageId: 4, seconds: 26, stormReady: true }) }))).toBe('stormcall');
    expect(id(facts({ ...s4, ftue: { ...s4.ftue, stormcall: true } }, { battle: battle({ ...b3, stageId: 4, seconds: 26, stormReady: true }) }))).toBeNull();

    const s5 = { ...s4, ftue: { ...s4.ftue, stormcall: true }, campaignStage: 5 };
    expect(id(facts(s5, { battle: battle({ ...b3, stageId: 5, seconds: 14, warlordIntroAt: 12 }) }))).toBe('warlord');
    expect(id(facts(s5, { battle: battle({ ...b3, stageId: 5, seconds: 30, warlordIntroAt: 12 }) }))).toBeNull();
  });

  it('after Battle 1: recruit in the Hub and Army, then "Back to battle!", then Food Lv 2 after Battle 2', () => {
    const after1 = { gold: 40, campaignStage: 2, clearedStages: [1], ftue: { deploy1: true } };
    expect(selectCoach(facts(after1, { route: 'hub' }))).toBe(COACH.recruitTab);
    expect(selectCoach(facts(after1, { route: 'army' }))).toBe(COACH.recruitArmy);
    expect(id(facts({ ...after1, gold: 10 }, { route: 'hub' }))).toBeNull(); // nothing to point at without the Gold
    // Results points the hand at Upgrade once the tally is done
    expect(selectCoach(facts(after1, { results: { phase: 'done', primary: 'upgrade', win: true } }))).toBe(COACH.upgradeResults);
    expect(id(facts(after1, { results: { phase: 'panel', primary: 'upgrade', win: true } }))).toBeNull();
    expect(id(facts(after1, { results: { phase: 'done', primary: 'upgrade', win: false } }))).toBeNull(); // the defeat tip says it

    const bought = { ...after1, gold: 10, owned: { ranged: true, tank: false }, ftue: { deploy1: true, recruit: true } };
    expect(selectCoach(facts(bought, { route: 'army' }))).toBe(COACH.backArmy);
    expect(selectCoach(facts(bought, { route: 'hub' }))).toBe(COACH.backHub);
    expect(id(facts({ ...bought, ftue: { ...bought.ftue, back: true } }, { route: 'hub' }))).toBeNull();

    const after2 = { ...bought, gold: 25, campaignStage: 3, clearedStages: [1, 2], ftue: { ...bought.ftue, back: true } };
    expect(selectCoach(facts(after2, { route: 'army' }))).toBe(COACH.foodArmy);
    expect(id(facts({ ...after2, levels: { ...newSave().levels, food: 2 } }, { route: 'army' }))).toBeNull();
    expect(id(facts({ ...after2, ftue: { ...after2.ftue, 'food-upSeen': true } }, { route: 'hub' }))).toBeNull();

    const after3 = { ...after2, gold: 80, campaignStage: 4, clearedStages: [1, 2, 3], levels: { ...newSave().levels, food: 2 } };
    expect(selectCoach(facts(after3, { route: 'hub' }))).toBe(COACH.tankTab);
    expect(selectCoach(facts(after3, { route: 'army' }))).toBe(COACH.tankArmy);
  });

  it('a fixture with every flag set shows no coach anywhere', () => {
    const s = { ftue: FTUE_DONE, gold: 500, campaignStage: 4, clearedStages: [1, 2, 3], owned: { ranged: true, tank: false } };
    for (const r of ['hub', 'army'] as const) expect(id(facts(s, { route: r }))).toBeNull();
    expect(id(facts(s, { battle: battle({ stageId: 4, rangedOwned: true, speedShown: true, stormReady: true, meleeReady: true }) }))).toBeNull();
  });
});

describe('FTUE runtime (battle events → flags)', () => {
  beforeEach(() => {
    save.value = newSave();
    results.value = null;
    resultsPhase.value = 'hidden';
    sheet.value = null;
    session.value = null;
    initFtue();
  });

  it('shows the Battle 1 coach until the third deploy, then never again', () => {
    route.value = 'battle';
    const s = startBattle(1);
    expect(coachStep.value?.id).toBe('food');
    let deploys = 0;
    for (let t = 0; t < 20 * 60 && deploys < 3; t++) {
      // the coach reads the 10 Hz HUD, like the player does
      if (s.hud.value.food >= s.cost('melee') && s.hud.value.queue.melee === 0) {
        expect(coachStep.value?.id).toBe('deploy');
        s.deploy('melee');
        deploys++;
      }
      s.frame(50);
    }
    s.frame(50);
    expect(save.value.ftue.deploy1).toBe(true);
    expect(coachStep.value).toBeNull();
    session.value = null;
    route.value = 'title';
  });
});

describe('FTUE flags written from inside effects', () => {
  it('markFtue does not subscribe the calling effect to the save (QA 1E: the Warlord line was cut short)', async () => {
    const { effect } = await import('@preact/signals');
    const { markFtue } = await import('../../src/app/store');
    save.value = newSave();
    let runs = 0;
    const dispose = effect(() => {
      runs++;
      markFtue('qaProbe');
    });
    save.value = { ...save.value, gold: save.value.gold + 7 }; // e.g. a pending-Gold write mid-battle
    save.value = { ...save.value, gold: save.value.gold + 7 };
    dispose();
    expect(save.value.ftue['qaProbe']).toBe(true);
    expect(runs).toBe(1);
  });
});
