/**
 * Stage calibrator (BALANCE §4.7). Usage: npx tsx tools/harness/calibrate.ts [population=60]
 * Env: CAL_DEBUG=1 prints every probe; CAL_MAX=n stops after stage n.
 *
 * Walks a population of casual campaigns stage by stage. For each stage it binary-searches ONE knob so the casual
 * cohort's FIRST-attempt win rate hits the target: the enemy budget E on regular stages, the boss multiplier on
 * Warlord stages. Then it advances every campaign through the stage (retrying with shopping until it wins).
 * Battle 1 is not calibrated: its seed E is pinned so the slowest players always win it (CI checks that).
 * Writes src/data/stages.calibrated.json for review; it never changes anything else.
 */
import { writeFileSync } from 'node:fs';
import { STAGES, type StageDef } from '../../src/data/stages';
import { canEvolve, evolve, mustEvolve, settleBattle } from '../../src/meta/progress';
import { newSave, type SaveV1 } from '../../src/meta/save';
import { persona, playBattle, rng, shop, type BotKind, type Persona } from './campaign';

const POP = Number(process.argv[2] ?? 60);

/** First-attempt win targets for the casual cohort (BALANCE §4.7). */
function target(st: StageDef): number {
  if (st.warlord) return 0.5;
  if (st.age === 'stone') return [1, 0.9, 0.85, 0.8][st.idx]!;
  return [0.93, 0.85, 0.85, 0.8][st.idx]!; // stage 1 of an Age is the evolution payoff
}

interface Member { save: SaveV1; r: () => number; battles: number; who: Persona }

function entryState(m: Member): SaveV1 {
  let save = m.save;
  if (mustEvolve(save) && canEvolve(save)) save = evolve(save);
  return shop(save, COHORT, m.r, m.who).save;
}

/** Calibrated against a typical player (1–3 s reactions), not the near-optimal casual bot (QA finding). */
const COHORT: BotKind = 'average';

function firstTryWinRate(pop: Member[], st: StageDef): number {
  let wins = 0;
  pop.forEach((m, i) => {
    const save = entryState({ ...m, r: rng(9000 + i * 31 + st.id) });
    if (playBattle(save, st.id, COHORT, rng(7000 + i * 17 + st.id), i, { persona: m.who }).result === 'victory') wins++;
  });
  return wins / pop.length;
}

const pop: Member[] = Array.from({ length: POP }, (_, i) => ({ save: newSave(), r: rng(100 + i), battles: 0, who: persona(100 + i) }));
const out: Record<string, { budget: number; bossMult: number }> = {};

for (const st of STAGES.slice(0, Number(process.env.CAL_MAX ?? STAGES.length))) {
  const want = target(st);
  const mutable = st as StageDef;
  if (st.id === 1) {
    console.log(`stage  1 ${st.title.padEnd(22)} budget pinned at ${st.budget} (not calibrated)`);
    advance(st);
    continue;
  }
  // Search the knob that sets difficulty: budget for regular stages, bossMult for Warlord stages.
  const knob: 'budget' | 'bossMult' = st.warlord ? 'bossMult' : 'budget';
  let lo = st.warlord ? 0.5 : 0.15;
  let hi = st.warlord ? 8.0 : 5.0;
  let best = { v: mutable[knob], err: Infinity, rate: 0 };
  for (let it = 0; it < 9; it++) {
    const mid = Math.round(((lo + hi) / 2) * 1000) / 1000;
    mutable[knob] = mid;
    const rate = firstTryWinRate(pop, st);
    if (process.env.CAL_DEBUG) console.log(`   probe ${knob}=${mid} → ${(rate * 100).toFixed(0)}%`);
    const err = Math.abs(rate - want);
    if (err <= best.err) best = { v: mid, err, rate }; // ties: the later, more converged probe
    if (rate > want) lo = mid; // too easy → make it harder
    else hi = mid;
  }
  mutable[knob] = best.v;
  out[String(st.id)] = { budget: mutable.budget, bossMult: mutable.bossMult };
  console.log(`stage ${String(st.id).padStart(2)} ${st.title.padEnd(22)} ${knob}=${best.v.toFixed(3)} firstTry ${(best.rate * 100).toFixed(0)}% (target ${(want * 100).toFixed(0)}%)`);
  advance(st);
}

/** Advances every member through a stage (retrying with shopping until it wins). */
function advance(st: StageDef) {
  for (const m of pop) {
    let save = m.save;
    if (mustEvolve(save) && canEvolve(save)) save = evolve(save);
    for (let a = 0; a < 25 && save.campaignStage === st.id; a++) {
      save = shop(save, COHORT, m.r, m.who).save;
      const res = playBattle(save, st.id, COHORT, m.r, m.battles, { persona: m.who });
      m.battles++;
      save = settleBattle(save, `c${m.battles}`, st.id, res.result, res.gold, res.seconds).save;
    }
    m.save = save;
  }
}

writeFileSync(new URL('../../src/data/stages.calibrated.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log('wrote src/data/stages.calibrated.json');
