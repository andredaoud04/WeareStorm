# WeAreStorm — Balance & Economy (v1)

The numbers here match the code on `claude/m1b-sim` (PR #2): `src/data/{ages,units,economy,stages}.ts`,
`src/sim/battle.ts` and `src/meta/progress.ts`. Values marked *prototype* come from the earlier throwaway sim (40 campaigns)
and are kept only as history. The real harness (§4.7) runs the actual `src/sim` + `src/meta` code and must pass every CI
threshold before any balance PR merges; the measured values below are from PR #2. Geometry conversion (speeds ×1.3,
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
* A loss with at least one kill or any base or Warlord damage pays more than 0. The harness asserts that zero-Gold losses are under 5% of casual losses (measured 0%) and that a lost Warlord fight pays at least 20 Gold at P50 (measured 22).

### 4.2 Core numbers

| Age | A (stat) | K (food) | Food/s at Lv 1 | Costs M/R/T | Melee HP/DMG | Ranged HP/DMG | Tank HP/DMG | Player base HP | Enemy bases (stages 1–5) |
|---|---|---|---|---|---|---|---|---|---|
| Stone | 1 | 1.0 | 1.0 | **5/8/12** | 60/12 | 40/18 | 260/22 | 400 | 400/440/480/520/700 |
| Ancient | 2.2 | 1.6 | 1.6 | 8/13/19 | 132/26 | 88/40 | 572/48* | 880 | 880/968/1,056/1,144/1,540 |
| Medieval | 4.8 | 2.4 | 2.4 | 12/19/29 | 288/58 | 192/86 | 1,248/106 | 1,920 | 1,920/2,112/2,304/2,496/3,360 |
| Gunpowder | 10.5 | 3.4 | 3.4 | 17/27/41 | 630/126 | 420/189* | 2,730*/231 | 4,200 | 4,200/4,620/5,040/5,460/7,350 |
| Industrial | 23 | 4.6 | 4.6 | 23/37/55 | 1,380/276 | 920/414* | 5,980/506* | 9,200 | 9,200/10,120/11,040/11,960/16,100 |
| Future | 50 | 6.0 | 6.0 | 30/48/72 | 3,000/600 | 2,000/900* | 13,000*/1,100 | 20,000 | 20,000/22,000/24,000/26,000/35,000 |

\*The trait modifier from GDD §3.2 applies to the final value.

**Warlords and Stormcall per Age** (from `src/data/units.ts` and `economy.ts`):

| Age | Warlord base HP (4 × tank HP) | Calibrated bossMult → HP | Slam DMG (1.92 × tank DMG, fixed) | Lv 2 ranged HP | Stormcall (2 × Lv 1 melee HP; Warlord takes 50%) |
|---|---|---|---|---|---|
| Stone | 1,040 | 1.526 → 1,587 | 42 | 44 | 120 |
| Ancient | 2,288 | 2.522 → 5,770 | 93 | 97 | 264 |
| Medieval | 4,992 | 2.624 → 13,099 | 203 | 211 | 576 |
| Gunpowder | 9,828 | 2.654 → 26,084 | 444 | 462 | 1,260 |
| Industrial | 23,920 | 2.449 → 58,580 | 972 | 1,012 | 2,760 |
| Future | 46,800 | 3.739 → 174,985 | 2,112 | 2,200 | 6,000 |

The slam is 96% of a Lv 2 ranged troop's HP in every Age, so one ranged upgrade is the readable counter.

### 4.3 Gold income per battle (prototype, casual bot)

These are prototype figures under the old formulas (Warlord bonus 60 + 15·ageIdx and no ward Gold). v1.1 moves 20 Gold of
the Warlord bonus to ward Gold (40 + 15·ageIdx, plus up to 20 for damaging the warded Warlord), so a Warlord win pays about
the same and a Warlord loss pays more. The harness report (§4.7) is the current source; it measures Warlord-stage loss Gold
at P50 22.

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

| Metric | Target (casual cohort unless noted) | Measured, `harness:ci` on PR #2 | Prototype (40 runs) |
|---|---|---|---|
| Battle 1 win, lazy / slow-tapper bot | ≥ 98% | 100% / 100% (200 seeds each) | 100% |
| Battle 1, idle bot | always lost, P50 time-to-loss ≤ 60 s | lost 100%, P50 42 s | — |
| Battle duration (sim s), P50 / P99 | 45–100 / ≤ 165 | 93 / 128 | 86 / — |
| Storm Rising reached | ≤ 35% of regular-stage battles; Warlord battles are meant to reach it | 15% regular, 74% Warlord | — |
| First-attempt win, stage 1 of each later Age | ≥ 85% | 89% | — |
| First-attempt win, regular stages 2–4 | 75–97% overall, every stage ≥ 60% | 82% | 1.0–1.6 attempts per stage |
| First-attempt win, Warlords | 35–75% overall, every Warlord 25–80% | 39% | 1.3–3.0 attempts |
| **First Evolution** | **P50 8–14 min**, P90 ≤ 18 | **11.0 / 12.6 min** | 11.9 / 13.5 min |
| **Full run (Future Warlord)** | **P50 65–100 min**; every casual campaign completes | **72.3 min**, 30/30 | 72 / 77 min |
| Full run, lazy bot | completes; P90 ≤ 200 min; ≤ 12 attempts on any stage | 30/30; P90 167 min; max 6 attempts | — |
| Purchases per Age | 10–16 (not gated) | — | ≈ 12–14 |
| Something affordable after a battle (first 30 min) | ≥ 80% | 92% | — |
| Consecutive losses per stage, P90 | ≤ 3 | 1 | Warlords up to 3 |
| Zero-Gold losses | < 5% of losses | 0% | — |
| Warlord-stage loss Gold, P50 | ≥ 20 | 22 | — |

All times include 22 s of results and menu overhead per battle (plus 4 s per Evolve) and assume ×1 speed. At ×2, wall-clock time is about 60% of that. Bots have less variance than humans.

### 4.5 Why these structures (prototype lessons, kept as design rules)

1. **Ranged must be good value per Food**, or unlocking it makes the player weaker (seen in the prototype: 100% → 27%). Rule: each unlock must raise the casual bot's win rate on the next stage. This is a design rule checked in harness reports; it is not one of the 22 CI rows yet.
2. **Defenders spawn at their base, so attackers that arrive one at a time lose to clumps.** The lane naturally snowballs, which is why the rally and Storm Rising exist, and why the trickle after the assault spends only 0.45 × the Age's Lv 1 Food rate. Battle 1 has no rally and weakened enemies.
3. **A bad boss is a binary wall.** In the prototype a slam radius of 40–55 u (70 wu after conversion) was the sweet spot; larger radii wiped whole armies (0% win at any level). v1.1 sets Warlord HP = 4 × the Age's tank HP × `bossMult` and fixes the slam at 1.92 × the Age's tank DMG. The calibrator moves **only HP** (`bossMult` within [0.5, 8]). When `bossMult` also scaled damage, a 0.3% change flipped 77% of outcomes, because the slam crossed the "kills a Lv 2 ranged troop in one hit" breakpoint. With HP alone, win rate moves smoothly and calibration can aim.
4. **Win-rate targets drive battle length.** Close fights (60–70% win) ran over 120 s; targets of 80–93% (regular) and 50% (Warlord) keep the median at 93 s (measured), and Warlord fights are the ones that run into Storm Rising.
5. **Losing must fund the retry.** Warlord ward Gold (GDD §2.11) and the lose-forward assist (−6% enemy HP/DMG and assault budget per consecutive frontier loss, cap 30%) keep consecutive losses at P90 1 in the casual cohort.

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

| Bot | Deploy behaviour | Stormcall | Shopping | Purpose |
|---|---|---|---|---|
| `casual` | Cycles a deploy rotation for the owned slots; reaction 0.4–1.6 s once the card is affordable | Taps when the auto-aim would catch a weight ≥ 3 (the Warlord counts 3) | Unlocks first, then repeatedly the cheapest affordable track by price × its persona weight | Main pacing cohort; the calibrator's population |
| `lazy` | Same rotations; reaction 2–6 s | Never | `recommendUpgrade()` once per Hub visit | Floor for FTUE and accessibility |
| `slow` (slow-tapper) | Reaction 6–12 s | Never | Same as lazy | Battle 1 guarantee |
| `idle` | Never taps | Never | Never | Proves Battle 1 is lost when idle |
| `random` | A random owned card, reaction 1–4 s | Never | Random affordable tracks | Robustness / no softlock (reports only, not in CI) |
| `optimizer` | Not built yet (M2): saves for a tank before scripted waves; ideal timings | — | — | Ceiling: no stage should fall to a zero-upgrade optimizer when a sink is intended |

Every bot evolves as soon as Evolve is free and required; no bot buys an early Evolve yet.

**Personas.** Each simulated player has persistent habits drawn from its seed: a reaction-time multiplier (×0.7–1.3), one of three deploy rotations per slot set (for example `m,r,t,m,m,r` / `m,m,r,r,t` / `t,m,r,m,r` once the tank is owned), and shopping weights (Food 0.6–1.0, Walls 0.9–1.4, troop tracks 0.8–1.2; lower buys sooner). A homogeneous population played the same build at the same speed, so a stage's win rate cliffed from about 100% to about 0% across a tiny change in difficulty and the calibrator could not aim. Personas spread the population into a smooth curve.

**Outputs.** `npm run harness` (`tools/harness/run.ts [campaigns=30] [maxStage=30]`) prints, per cohort (casual, lazy, slow): campaigns completed, first Evolution P50/P90, total time P50, affordable-after-battle %, stuck stages, and per stage the first-try win rate, attempts P50/P90 and duration P50/P90/P99. Paste it into the balance PR description.

**CI gate** (`npm run harness:ci`, `tools/harness/ci.ts`). It runs in the `verify` job on every push and PR, takes about 25 s, and is deterministic (fixed seeds). Cohorts: Battle 1 rows use 200 seeds per bot, the idle row 20 seeds, and the campaign rows 30 casual and 30 lazy full campaigns. Measured values are from PR #2.

| # | Check | Threshold | Measured (PR #2) |
|---|---|---|---|
| 1 | Battle 1 win rate, lazy bot (200 seeds) | ≥ 98% | 100% |
| 2 | Battle 1 win rate, slow-tapper bot (200 seeds) | ≥ 98% | 100% |
| 3 | Battle 1, idle bot (20 seeds): always loses, P50 time-to-loss | lost 100%, ≤ 60 s | lost 100%, 42 s |
| 4 | Casual completes the campaign | 30/30 | 30/30 |
| 5 | First Evolution P50 (casual) | 8–14 min | 11.0 min |
| 6 | First Evolution P90 (casual) | ≤ 18 min | 12.6 min |
| 7 | Full run P50 (casual) | 65–100 min | 72.3 min |
| 8 | Lazy completes the campaign | 30/30 | 30/30 |
| 9 | Lazy full run P90 | ≤ 200 min | 167 min |
| 10 | Lazy max attempts on any stage | ≤ 12 | 6 |
| 11 | Battle duration P99 (casual, all battles) | ≤ 165 s | 128 s |
| 12 | Battle duration P50 (casual, all battles) | 45–100 s | 93 s |
| 13 | Storm Rising reached, regular-stage battles (Warlord share reported, not gated) | ≤ 35% | 15% (Warlord 74%) |
| 14 | Stage 1 of each later Age, first attempt (evolution spike) | ≥ 85% | 89% |
| 15 | Regular stages 2–4, first attempt | 75–97% | 82% |
| 16 | Warlord stages, first attempt | 35–75% | 39% |
| 17 | Every Warlord stage, first attempt | 25–80% each | pass (none outside) |
| 18 | Every regular stage, first attempt | ≥ 60% each | pass (none below) |
| 19 | Zero-Gold losses | < 5% of casual losses | 0% |
| 20 | Warlord-stage loss Gold P50 | ≥ 20 | 22 |
| 21 | Consecutive losses per stage P90 (casual) | ≤ 3 | 1 |
| 22 | Something affordable after a battle, first 30 min (casual) | ≥ 80% | 92% |

All six Ages' data already exist in `src/data` (PR #2), so every row runs from M1 onward, even though only Stone has final art. Determinism (same inputs and commands give an identical battle) and the "step never mutates its input" rule are Vitest tests (`tests/sim/battle.test.ts`), not harness rows. Trait ablations are a report item for M2.

**Calibrator** (`npx tsx tools/harness/calibrate.ts [population=60]`, offline, not in CI; `CAL_DEBUG=1` prints every probe):

1. Build a population of 60 casual campaigns, each with its own persona.
2. Walk the 30 stages in order. **Battle 1 is never calibrated**: its E is pinned at 0.6 so the slowest players always win it (CI rows 1–3 check that).
3. At each later stage, take every member's entry state (a free Evolve if one is required, then casual shopping) and binary-search **one knob** for 9 iterations so the cohort's first-attempt win rate hits the target:
   * regular stages: the budget E within [0.15, 5];
   * Warlord stages: the Warlord HP multiplier `bossMult` within [0.5, 8] (E stays at its seed of 0.30 / 0.35; HP only, see §4.5 rule 3).
4. **Targets** (casual, first attempt): Stone stages 2 / 3 / 4 = 0.90 / 0.85 / 0.80; stages 1–4 of every later Age = 0.93 / 0.85 / 0.85 / 0.80; Warlords = 0.50.
5. Advance every member through the stage (shop and retry, up to 25 attempts), then move on.
6. Write `src/data/stages.calibrated.json` (per-stage `budget` and `bossMult` overrides). It never changes anything else, and it can never remove an authored insert (GDD §2.9).
7. The diff goes into the PR **for review**, with the `npm run harness` report before and after. Human playtest logs can override a value with a recorded justification.

---

### 4.8 Tuning rules (from the craft proposal)


1. Change **one causal group** per experiment: waves for a stage, or price scale G for an Age, or one troop's stats. Log the hypothesis and the old and new values in `reports/balance/CHANGELOG.md`.
2. Re-run paired seeds and compare the deltas.
3. Never raise enemy HP to cover a broken Gold faucet. Fix the source.
4. Every number lives in `src/data/*`. The UI reads the same functions, so displayed numbers always equal sim numbers, and a test asserts this.

---
