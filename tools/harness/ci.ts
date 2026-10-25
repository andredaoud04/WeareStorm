/**
 * CI balance gate (BALANCE §4.7). Fixed seeds; fails the build when pacing leaves its bands.
 * Runs the real sim + meta through bot cohorts; see campaign.ts for the bots.
 */
import { persona, quantile, runCampaign, playBattle, rng, type BotKind, type CampaignReport } from './campaign';
import { STAGES } from '../../src/data/stages';
import { newSave } from '../../src/meta/save';

const N = 30;
const fails: string[] = [];
const check = (ok: boolean, msg: string) => {
  if (!ok) fails.push(msg);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
};
const pct = (x: number) => `${(100 * x).toFixed(0)}%`;

// Battle 1: every player who taps at all wins it; a player who never taps loses it quickly.
for (const bot of ['lazy', 'slow'] as BotKind[]) {
  let wins = 0;
  for (let i = 0; i < 200; i++) if (playBattle(newSave(), 1, bot, rng(500 + i), i, { persona: persona(500 + i) }).result === 'victory') wins++;
  check(wins / 200 >= 0.98, `Battle 1 ${bot} win rate ${pct(wins / 200)} ≥ 98% (200 seeds)`);
}
{
  const idle = Array.from({ length: 20 }, (_, i) => playBattle(newSave(), 1, 'idle', rng(900 + i), i));
  const lost = idle.every((r) => r.result !== 'victory');
  check(lost && quantile(idle.map((r) => r.seconds), 0.5) <= 60, `Battle 1 idle bot always loses, P50 time-to-loss ${quantile(idle.map((r) => r.seconds), 0.5).toFixed(0)} s ≤ 60`);
}

const casual = Array.from({ length: N }, (_, i) => runCampaign('casual', 1000 + i));
const lazy = Array.from({ length: N }, (_, i) => runCampaign('lazy', 2000 + i));

// Pacing
const fe = casual.map((r) => r.firstEvolveMin ?? Infinity);
const tot = casual.map((r) => r.totalMin);
check(casual.every((r) => r.completed), `casual completes the campaign (${casual.filter((r) => r.completed).length}/${N})`);
check(quantile(fe, 0.5) >= 8 && quantile(fe, 0.5) <= 14, `first Evolution P50 ${quantile(fe, 0.5).toFixed(1)} min in 8–14`);
check(quantile(fe, 0.9) <= 18, `first Evolution P90 ${quantile(fe, 0.9).toFixed(1)} ≤ 18 min`);
check(quantile(tot, 0.5) >= 65 && quantile(tot, 0.5) <= 100, `full run P50 ${quantile(tot, 0.5).toFixed(1)} min in 65–100`);
check(lazy.every((r) => r.completed), `lazy completes the campaign (${lazy.filter((r) => r.completed).length}/${N})`);
check(quantile(lazy.map((r) => r.totalMin), 0.9) <= 200, `lazy full run P90 ${quantile(lazy.map((r) => r.totalMin), 0.9).toFixed(0)} ≤ 200 min`);
const maxAttempts = Math.max(...lazy.flatMap((r) => r.stages.map((s) => s.attempts)));
check(maxAttempts <= 12, `lazy max attempts on any stage ${maxAttempts} ≤ 12`);

// Battle feel
const durs = casual.flatMap((r) => r.stages.flatMap((s) => s.durations));
check(quantile(durs, 0.99) <= 165, `battle duration P99 ${quantile(durs, 0.99).toFixed(0)} s ≤ 165`);
check(quantile(durs, 0.5) >= 45 && quantile(durs, 0.5) <= 100, `battle duration P50 ${quantile(durs, 0.5).toFixed(0)} s in 45–100`);
// Storm Rising must stay special on regular stages; Warlord fights are meant to run long and often reach it.
const stormShare = (warlord: boolean) => {
  const reps = casual.flatMap((r) => r.stages.filter((s) => STAGES[s.stage - 1]!.warlord === warlord));
  return reps.reduce((a, s) => a + s.stormRising, 0) / Math.max(1, reps.reduce((a, s) => a + s.attempts, 0));
};
check(stormShare(false) <= 0.35, `Storm Rising reached in ${pct(stormShare(false))} of regular-stage battles ≤ 35% (Warlord battles: ${pct(stormShare(true))})`);

// First-attempt win rates per stage slot (casual)
const firstTry = (filter: (stage: number) => boolean, runs: CampaignReport[]) => {
  const reps = runs.flatMap((r) => r.stages.filter((s) => filter(s.stage)));
  return reps.filter((s) => s.firstTryWin).length / Math.max(1, reps.length);
};
const st = (id: number) => STAGES[id - 1]!;
const ageOpeners = firstTry((id) => id > 1 && st(id).idx === 0, casual);
check(ageOpeners >= 0.85, `stage 1 of each later Age, first attempt ${pct(ageOpeners)} ≥ 85% (evolution spike)`);
const regular = firstTry((id) => st(id).idx >= 1 && !st(id).warlord, casual);
check(regular >= 0.75 && regular <= 0.97, `regular stages 2–4, first attempt ${pct(regular)} in 75–97%`);
const bosses = firstTry((id) => st(id).warlord, casual);
check(bosses >= 0.35 && bosses <= 0.75, `Warlord stages, first attempt ${pct(bosses)} in 35–75%`);
// Per stage, so an average can never hide one brutal (or free) fight.
const perStage = STAGES.map((x) => ({ x, rate: firstTry((id) => id === x.id, casual) }));
const badBoss = perStage.filter(({ x, rate }) => x.warlord && (rate < 0.25 || rate > 0.8));
check(!badBoss.length, `every Warlord first attempt in 25–80%${badBoss.length ? ` — off: ${badBoss.map(({ x, rate }) => `${x.id} ${pct(rate)}`).join(', ')}` : ''}`);
const badStage = perStage.filter(({ x, rate }) => !x.warlord && rate < 0.6);
check(!badStage.length, `every regular stage first attempt ≥ 60%${badStage.length ? ` — off: ${badStage.map(({ x, rate }) => `${x.id} ${pct(rate)}`).join(', ')}` : ''}`);

// Losing forward (GDD P3)
const losses = casual.flatMap((r) => r.stages.flatMap((s) => s.lossGold));
const zero = losses.filter((g) => g === 0).length / Math.max(1, losses.length);
check(zero < 0.05, `zero-Gold losses ${pct(zero)} < 5% of casual losses`);
const warlordLossGold = casual.flatMap((r) => r.stages.filter((s) => st(s.stage).warlord).flatMap((s) => s.lossGold));
check(quantile(warlordLossGold, 0.5) >= 20, `Warlord-stage loss Gold P50 ${quantile(warlordLossGold, 0.5)} ≥ 20 (a lost boss fight still buys most of an upgrade)`);
const streaks = casual.flatMap((r) => r.stages.map((s) => s.attempts - 1));
check(quantile(streaks, 0.9) <= 3, `consecutive losses per stage P90 ${quantile(streaks, 0.9)} ≤ 3 (casual)`);
const afford = casual.reduce((a, r) => a + r.affordableAfterBattle, 0) / N;
check(afford >= 0.8, `something affordable after ${pct(afford)} of battles in the first 30 min ≥ 80%`);

if (fails.length) {
  console.error(`\n${fails.length} balance check(s) failed`);
  process.exit(1);
}
console.log('\nbalance gate passed');
