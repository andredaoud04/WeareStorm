/**
 * Balance report. Usage: npx tsx tools/harness/run.ts [campaignsPerBot=30] [maxStage=30]
 * Prints per-stage first-try win rates, attempts and durations plus pacing for each bot cohort.
 */
import { quantile, runCampaign, type BotKind } from './campaign';

const N = Number(process.argv[2] ?? 30);
const MAX = Number(process.argv[3] ?? 30);
const BOTS: BotKind[] = (process.argv[4]?.split(',') as BotKind[] | undefined) ?? ['casual', 'average', 'lazy', 'slow'];

for (const bot of BOTS) {
  const runs = Array.from({ length: N }, (_, i) => runCampaign(bot, 1000 + i, { maxStage: MAX }));
  const done = runs.filter((r) => r.completed).length;
  const fe = runs.map((r) => r.firstEvolveMin).filter((x): x is number => x !== null);
  console.log(`\n== ${bot}: completed ${done}/${N} up to stage ${MAX}; first evolve P50 ${quantile(fe, 0.5)?.toFixed(1)} P90 ${quantile(fe, 0.9)?.toFixed(1)} min; total P50 ${quantile(runs.map((r) => r.totalMin), 0.5).toFixed(1)} min; affordable-after-battle ${(100 * runs.reduce((a, r) => a + r.affordableAfterBattle, 0) / N).toFixed(0)}%`);
  const stuck = runs.filter((r) => r.stuckStage).map((r) => r.stuckStage);
  if (stuck.length) console.log(`   stuck at stages: ${stuck.join(',')}`);
  const lines: string[] = [];
  for (let st = 1; st <= MAX; st++) {
    const reps = runs.map((r) => r.stages.find((x) => x.stage === st)).filter((x) => !!x);
    if (!reps.length) continue;
    const ftw = reps.filter((x) => x.firstTryWin).length / reps.length;
    const att = reps.map((x) => x.attempts);
    const dur = reps.flatMap((x) => x.durations);
    lines.push(`   st${String(st).padStart(2)} firstTry ${(ftw * 100).toFixed(0).padStart(3)}%  attempts P50 ${quantile(att, 0.5)} P90 ${quantile(att, 0.9)}  dur P50 ${quantile(dur, 0.5).toFixed(0)}s P90 ${quantile(dur, 0.9).toFixed(0)}s P99 ${quantile(dur, 0.99).toFixed(0)}s`);
  }
  console.log(lines.join('\n'));
}
