# WeAreStorm — Balance & Economy (v1)

The numbers here match the code on `claude/m1b-sim` at `e1c84e6` (PR #2): `src/data/{ages,units,economy,stages}.ts`,
`src/sim/battle.ts` and `src/meta/progress.ts`. Values marked *prototype* come from the earlier throwaway sim (40 campaigns)
and are kept only as history. The real harness (§4.7) runs the actual `src/sim` + `src/meta` code and must pass every CI
threshold before any balance PR merges; the measured values below are from `e1c84e6`. Geometry conversion (speeds ×1.3,
edge-gap ranges, areas ×1.3) is in `GDD.md` → Reconciliation. Every number lives in `src/data/*` and the UI reads the same
functions as the sim (a test asserts equality). `ageIdx` (0..5, Stone = 0) and `stageIdx` (0..4) are defined in GDD §3.1.


### 4.1 Currencies and invariants (v1)

* **Food:** battle-local. Starts at 0, has no cap, is stored as integer milli-food, and is spent only on deploys.
* **Gold:** persistent integer. **Sources:** campaign battle kills, base damage, Warlord ward Gold and the victory bonus, nothing else. **Sinks:** slot unlocks, Camp upgrades and the early Evolve (180 / 420 / 820 / 1,450 / 2,500 out of Stone … Industrial). Evolve is free once the army Age's Warlord is beaten.

Invariants, each enforced by a unit test or a harness assertion:

* Gold never goes negative.
* Every settlement is applied exactly once (`lastSettledBattleId`).
* Displayed prices and effects equal the values used in the sim, because the UI reads the same functions.
* Food shown equals `floor(sim food)`.
* A loss with at least one kill or any base or Warlord damage pays more than 0. The harness asserts that zero-Gold losses are under 5% of losses in the `average` cohort (measured 0%) and that a lost Warlord fight pays at least 20 Gold at P50 (measured 21).

### 4.2 Core numbers

| Age | A (stat) | K (food) | Food/s at Lv 1 | Costs M/R/T | Melee HP/DMG | Ranged HP/DMG | Tank HP/DMG | Player base HP | Enemy bases (stages 1–5, 0.8 × player base) |
|---|---|---|---|---|---|---|---|---|---|
| Stone | 1 | 1.0 | 1.0 | **5/8/12** | 60/12 | 40/18 | 260/22 | 400 | 320/352/384/416/560 |
| Ancient | 2.2 | 1.6 | 1.6 | 8/13/19 | 132/26 | 88/40 | 572/48* | 880 | 704/774/845/915/1,232 |
| Medieval | 4.8 | 2.4 | 2.4 | 12/19/29 | 288/58 | 192/86 | 1,248/106 | 1,920 | 1,536/1,690/1,843/1,997/2,688 |
| Gunpowder | 10.5 | 3.4 | 3.4 | 17/27/41 | 630/126 | 420/189* | 2,730*/231 | 4,200 | 3,360/3,696/4,032/4,368/5,880 |
| Industrial | 23 | 4.6 | 4.6 | 23/37/55 | 1,380/276 | 920/414* | 5,980/506* | 9,200 | 7,360/8,096/8,832/9,568/12,880 |
| Future | 50 | 6.0 | 6.0 | 30/48/72 | 3,000/600 | 2,000/900* | 13,000*/1,100 | 20,000 | 16,000/17,600/19,200/20,800/28,000 |

\*The trait modifier from GDD §3.2 applies to the final value.

Enemy bases are `ENEMY_BASE_SHARE` = 0.8 of the Age's base HP (+10% per stage, Warlord keep +25%), so the final push of a
won battle stays short. The player's base is unchanged. Base Gold is still +1 per 5%, so the smaller bases pay the same.

**Warlords and Stormcall per Age** (from `src/data/units.ts` and `economy.ts`):

| Age | Warlord base HP (4 × tank HP) | Calibrated bossMult → HP | Slam DMG (1.92 × tank DMG, fixed) | Lv 2 ranged HP | Stormcall (2 × Lv 1 melee HP; Warlord takes 50%) |
|---|---|---|---|---|---|
| Stone | 1,040 | 1.804 → 1,876 | 42 | 44 | 120 |
| Ancient | 2,288 | 3.196 → 7,312 | 93 | 97 | 264 |
| Medieval | 4,992 | 3.358 → 16,763 | 203 | 211 | 576 |
| Gunpowder | 9,828 | 2.962 → 29,111 | 444 | 462 | 1,260 |
| Industrial | 23,920 | 4.075 → 97,474 | 972 | 1,012 | 2,760 |
| Future | 46,800 | 3.519 → 164,689 | 2,112 | 2,200 | 6,000 |

The slam is 96% of a Lv 2 ranged troop's HP in every Age, so one ranged upgrade is the readable counter.

### 4.3 Gold income per battle (prototype, casual bot)

These are prototype figures under the old formulas (Warlord bonus 60 + 15·ageIdx and no ward Gold). v1.1 moves 20 Gold of
the Warlord bonus to ward Gold (40 + 15·ageIdx, plus up to 20 for damaging the warded Warlord), so a Warlord win pays about
the same and a Warlord loss pays more. The harness report (§4.7) is the current source; it measures Warlord-stage loss Gold
at P50 21.

| Age | Regular win | Warlord win | Loss (kept, prototype) |
|---|---|---|---|
| Stone | 43–52 | ≈ 120 | 30–55 |
| Ancient | 51–70 | ≈ 138 | 35–50 |
| Medieval | 45–81 | ≈ 157 | 30–45 |
| Gunpowder | 52–75 | ≈ 164 | 30–50 |
| Industrial | 57–76 | ≈ 180 | 25–50 |
| Future | 63–91 | ≈ 194 | 30–50 |

Kill counts per battle run from 10 to 27. The flat kill Gold stays a third to a half of income all game, which is why the Camp resets every Age. Under persistent exponential prices, flat 1/5 kill Gold would become meaningless by the Gunpowder Age.

### 4.4 Pacing targets and measured results

Pacing rows use the `casual` cohort; battle-feel, first-try and lose-forward rows use the `average` cohort (the typical
player the calibrator targets, §4.7).

| Metric | Target | Measured, `harness:ci` at `e1c84e6` | Prototype (40 runs) |
|---|---|---|---|
| Battle 1 win, lazy / slow-tapper bot | ≥ 98% | 100% / 100% (200 seeds each) | 100% |
| Battle 1, idle bot | always lost, P50 time-to-loss ≤ 60 s | lost 100%, P50 42 s | — |
| Regular battle duration (sim s), P50 / P99 | 45–100 / ≤ 160 | 82 / 131 | 86 / — (all battles) |
| Warlord battle duration (sim s), P50 / P99 | ≤ 130 / ≤ 190 | 116 / 163 | — |
| Storm Rising reached | ≤ 35% of regular-stage battles; Warlord battles are meant to reach it | 25% regular, 91% Warlord | — |
| First-attempt win, stage 1 of each later Age | ≥ 85% overall, each ≥ 75% | 95% | — |
| First-attempt win, regular stages 2–4 | 75–97% overall, every stage ≥ 60% | 85% | 1.0–1.6 attempts per stage |
| First-attempt win, Warlords | 35–75% overall, every Warlord 20–80% | 38% | 1.3–3.0 attempts |
| **First Evolution** (casual) | **P50 8–14 min**, P90 ≤ 18 | **11.7 / 14.5 min** | 11.9 / 13.5 min |
| **Full run (Future Warlord)** (casual) | **P50 65–100 min**; every campaign completes | **76.3 min**, 30/30 | 72 / 77 min |
| Full run, lazy bot | completes; P90 ≤ 200 min; ≤ 12 attempts on any stage | 30/30; P90 165 min; max 7 attempts | — |
| Purchases per Age | 10–16 (not gated) | — | ≈ 12–14 |
| Something affordable after a battle (first 30 min) | ≥ 80% | 92% | — |
| Consecutive losses per stage, P90 | ≤ 3 | 1 | Warlords up to 3 |
| Zero-Gold losses | < 5% of losses | 0% | — |
| Warlord-stage loss Gold, P50 | ≥ 20 | 21 | — |

All times include 22 s of results and menu overhead per battle (plus 4 s per Evolve) and assume ×1 speed. At ×2, wall-clock time is about 60% of that. Bots have less variance than humans; the lazy bot's first-try rates are an open question (§4.9).

### 4.5 Why these structures (prototype lessons, kept as design rules)

1. **Ranged must be good value per Food**, or unlocking it makes the player weaker (seen in the prototype: 100% → 27%). Rule: each unlock must raise the casual bot's win rate on the next stage. This is a design rule checked in harness reports; it is not one of the 24 CI rows yet.
2. **Defenders spawn at their base, so attackers that arrive one at a time lose to clumps.** The lane naturally snowballs, which is why the rally and Storm Rising exist, and why the trickle after the assault spends only 0.45 × the Age's Lv 1 Food rate. Battle 1 has no rally and weakened enemies.
3. **A bad boss is a binary wall.** In the prototype a slam radius of 40–55 u (70 wu after conversion) was the sweet spot; larger radii wiped whole armies (0% win at any level). v1.1 sets Warlord HP = 4 × the Age's tank HP × `bossMult` and fixes the slam at 1.92 × the Age's tank DMG. The calibrator moves **only HP** (`bossMult` within [0.5, 8]). When `bossMult` also scaled damage, a 0.3% change flipped 77% of outcomes, because the slam crossed the "kills a Lv 2 ranged troop in one hit" breakpoint. With HP alone, win rate moves smoothly and calibration can aim.
4. **Win-rate targets drive battle length.** Close fights (60–70% win) ran over 120 s; targets of 80–93% (regular) and 50% (Warlord) keep regular battles at a measured P50 of 82 s, and Warlord fights (P50 116 s) are the ones that run into Storm Rising.
5. **Losing must fund the retry.** Warlord ward Gold (GDD §2.11) and the lose-forward assist (−6% enemy HP/DMG and assault budget per consecutive frontier loss, cap 30%) keep consecutive losses at P90 1 in the `average` cohort.

### 4.6 Difficulty curve inside each Age (the saw-tooth)

```
 difficulty │        ╱│        ╱│        ╱│
            │     ╱   │     ╱   │     ╱   │   stage 1 of an Age = "new toys" easy win
            │  ╱      │  ╱      │  ╱      │   stages 2–4 ramp (E ↑, roles/inserts ↑)
            │╱  W     │╱  W     │╱  W     │   W = Warlord spike (≈50% first try)
            └─────────┴─────────┴─────────┴── stages
```

### 4.7 Headless balance harness and auto-calibrator

**What it runs.** The exact `src/sim` and `src/meta` code under Node via `tsx`. There is no re-implementation, so the sim the harness tests is the sim players get. The harness steps battles with `stepMut` (in place, TECH §3) for speed; the files are `tools/harness/campaign.ts` (bots, campaign runner), `run.ts` (report), `calibrate.ts` and `ci.ts`.

**Bot cohorts** (`tools/harness/campaign.ts`):

| Bot | Reaction once a card is affordable | Taps per reaction (burst) | Stormcall | Shopping | Purpose |
|---|---|---|---|---|---|
| `casual` | 0.4–1.6 s | 1 | Taps when the auto-aim would catch a weight ≥ 3 (the Warlord counts 3) | Unlocks first, then repeatedly the cheapest affordable track by price × its persona weight | Pacing cohort (first Evolution, full run) |
| `average` | 1–3 s | 2 | Same as casual | Same as casual | **The calibrator's cohort**: a typical player. Battle-feel, first-try and lose-forward CI rows use it |
| `lazy` | 2–6 s | 4 | Never | `recommendUpgrade()` once per Hub visit | Floor for FTUE and accessibility (a distracted player) |
| `slow` (slow-tapper) | 6–12 s | 4 | Never | Same as lazy | Battle 1 guarantee |
| `idle` | never taps | — | Never | Never | Proves Battle 1 is lost when idle |
| `random` | 1–4 s, a random owned card | 1 | Never | Random affordable tracks | Robustness / no softlock (reports only, not in CI) |
| `optimizer` | Not built yet (M2): saves for a tank before scripted waves; ideal timings | — | — | — | Ceiling: no stage should fall to a zero-upgrade optimizer when a sink is intended |

How every bot except `random` taps:
- It follows its deploy rotation. After its reaction time it taps up to its burst size in one go, following the rotation for
  as many cards as the Food covers (a player who looks away taps several cards when they look back, wasting no Food).
- **Emergency rule:** if an enemy is within 500 wu of the bot's own gate (x < 500) and the planned card is not affordable,
  it taps the cheapest affordable card instead.
- The rotation advances only on deploys the sim accepted (`deployQueued`), never on rejected taps.

Every bot evolves as soon as Evolve is free and required; no bot buys an early Evolve yet.

**Personas.** Each simulated player has persistent habits drawn from its seed: a reaction-time multiplier (×0.7–1.3), one of three deploy rotations per slot set (for example `m,r,t,m,m,r` / `m,m,r,r,t` / `t,m,r,m,r` once the tank is owned), and shopping weights (Food 0.6–1.0, Walls 0.9–1.4, troop tracks 0.8–1.2; lower buys sooner). A homogeneous population played the same build at the same speed, so a stage's win rate cliffed from about 100% to about 0% across a tiny change in difficulty and the calibrator could not aim. Personas spread the population into a smooth curve.

**Outputs.** `npm run harness` (`tools/harness/run.ts [campaigns=30] [maxStage=30] [bots]`, default bots casual, average, lazy, slow) prints, per cohort: campaigns completed, first Evolution P50/P90, total time P50, affordable-after-battle %, stuck stages, and per stage the first-try win rate, attempts P50/P90 and duration P50/P90/P99. Paste it into the balance PR description.

**CI gate** (`npm run harness:ci`, `tools/harness/ci.ts`). It runs in the `verify` job on every push and PR and is deterministic (fixed seeds). Cohorts: Battle 1 rows use 200 seeds per bot, the idle row 20 seeds, and the campaign rows 30 full campaigns each of `casual`, `average` and `lazy`. Measured values are from `e1c84e6`.

| # | Check (cohort) | Threshold | Measured |
|---|---|---|---|
| 1 | Battle 1 win rate, lazy bot (200 seeds) | ≥ 98% | 100% |
| 2 | Battle 1 win rate, slow-tapper bot (200 seeds) | ≥ 98% | 100% |
| 3 | Battle 1, idle bot (20 seeds): always loses, P50 time-to-loss | lost 100%, ≤ 60 s | lost 100%, 42 s |
| 4 | Casual completes the campaign | 30/30 | 30/30 |
| 5 | First Evolution P50 (casual) | 8–14 min | 11.7 min |
| 6 | First Evolution P90 (casual) | ≤ 18 min | 14.5 min |
| 7 | Full run P50 (casual) | 65–100 min | 76.3 min |
| 8 | Lazy completes the campaign | 30/30 | 30/30 |
| 9 | Lazy full run P90 | ≤ 200 min | 165 min |
| 10 | Lazy max attempts on any stage | ≤ 12 | 7 |
| 11 | Regular battle duration P50 (average) | 45–100 s | 82 s |
| 12 | Regular battle duration P99 (average) | ≤ 160 s | 131 s |
| 13 | Warlord battle duration P50 and P99 (average) | P50 ≤ 130 s, P99 ≤ 190 s | 116 s, 163 s |
| 14 | Storm Rising reached, regular-stage battles (average; Warlord share reported, not gated) | ≤ 35% | 25% (Warlord 91%) |
| 15 | Stage 1 of each later Age, first attempt (average; evolution spike) | ≥ 85% | 95% |
| 16 | Each Age opener (stages 6, 11, 16, 21, 26), first attempt (average) | ≥ 75% each | pass (none below) |
| 17 | Regular stages 2–4, first attempt (average) | 75–97% | 85% |
| 18 | Warlord stages, first attempt (average) | 35–75% | 38% |
| 19 | Every Warlord stage, first attempt (average) | 20–80% each | pass (none outside) |
| 20 | Every regular stage, first attempt (average) | ≥ 60% each | pass (none below) |
| 21 | Zero-Gold losses (average) | < 5% of losses | 0% |
| 22 | Warlord-stage loss Gold P50 (average) | ≥ 20 | 21 |
| 23 | Consecutive losses per stage P90 (average) | ≤ 3 | 1 |
| 24 | Something affordable after a battle, first 30 min (average) | ≥ 80% | 92% |

All six Ages' data already exist in `src/data`, so every row runs from M1 onward, even though only Stone has final art. Determinism, order independence (every tick matches with the unit list reversed) and the "step never mutates its input" rule are Vitest tests (`tests/sim/battle.test.ts`), not harness rows. Trait ablations are a report item for M2.

**Calibrator** (`npx tsx tools/harness/calibrate.ts [population=60]`, offline, not in CI; `CAL_DEBUG=1` prints every probe):

1. Build a population of 60 **`average`** campaigns (1–3 s reactions, burst 2, casual shopping), each with its own persona. The cohort is a typical player, not the near-optimal casual bot.
2. Walk the 30 stages in order. **Battle 1 is never calibrated**: its E is pinned at 0.6 so the slowest players always win it (CI rows 1–3 check that).
3. At each later stage, take every member's entry state (a free Evolve if one is required, then shopping) and binary-search **one knob** for 9 iterations so the cohort's first-attempt win rate hits the target:
   * regular stages: the budget E within [0.15, 5];
   * Warlord stages: the Warlord HP multiplier `bossMult` within [0.5, 8] (E stays at its seed of 0.30 / 0.35; HP only, see §4.5 rule 3).
4. **Targets** (`average`, first attempt): Stone stages 2 / 3 / 4 = 0.90 / 0.85 / 0.80; stages 1–4 of every later Age = 0.93 / 0.85 / 0.85 / 0.80; Warlords = 0.50.
5. Advance every member through the stage (shop and retry, up to 25 attempts), then move on.
6. Write `src/data/stages.calibrated.json` (per-stage `budget` and `bossMult` overrides; the current values are in GDD §3.4). It never changes anything else, and it can never remove an authored insert (GDD §2.9).
7. The diff goes into the PR **for review**, with the `npm run harness` report before and after. Human playtest logs can override a value with a recorded justification.

---

### 4.8 Tuning rules (from the craft proposal)


1. Change **one causal group** per experiment: waves for a stage, or price scale G for an Age, or one troop's stats. Log the hypothesis and the old and new values in `reports/balance/CHANGELOG.md`.
2. Re-run paired seeds and compare the deltas.
3. Never raise enemy HP to cover a broken Gold faucet. Fix the source.
4. Every number lives in `src/data/*`. The UI reads the same functions, so displayed numbers always equal sim numbers, and a test asserts this.

---

### 4.9 Open balance question: distracted players

**What the harness shows.** The `lazy` bot (2–6 s reactions, a distracted player) wins almost no new regular stage on the
first try: 0–10% on most stages from stage 4 on, and 20–70% on Warlords, even with the same upgrades as a typical player.
Stages are tuned near parity for the `average` player, so a few seconds of lost Food per deploy decide the fight. The
lazy bot still finishes the campaign through the lose-forward assist, in about 5 attempts per stage (full run P90 165 min,
CI rows 8–10).

**Tried and rejected:** assaults split into 3 waves. Battles got longer and lazy players did no better. The assault stays
one continuous stream (GDD §2.9).

**Candidate if playtests agree:** a modest gate guard for the player's base.

**Decision:** the owner decides after the G1 playtest (`OWNER_DECISIONS.md` #7). Until then nothing changes.
