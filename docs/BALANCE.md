# WeAreStorm — Balance & Economy (v1)

All numbers here are **prototype-checked starting values** (one throwaway sim, 40 campaigns). The real harness
(§4.7) runs the actual `src/sim` + `src/meta` code and must pass every CI threshold before any balance PR merges. Geometry
conversion (speeds ×1.3, edge-gap ranges) is in `GDD.md` → Reconciliation; the calibrator re-tunes stage budgets after it.
Every number lives in `src/data/*` and the UI reads the same functions as the sim (a test asserts equality).


### 4.1 Currencies and invariants (v1)

* **Food:** battle-local. Starts at 0, has no cap, is stored as integer milli-food, and is spent only on deploys.
* **Gold:** persistent integer. **Sources:** campaign battle kills, base damage and victory bonus, nothing else. **Sinks:** slot unlocks and Camp upgrades. Evolution is free.

Invariants, each enforced by a unit test or a harness assertion:

* Gold never goes negative.
* Every settlement is applied exactly once (`lastSettledBattleId`).
* Displayed prices and effects equal the values used in the sim, because the UI reads the same functions.
* Food shown equals `floor(sim food)`.
* A loss with at least one kill or any base damage pays more than 0. The harness asserts that zero-gold losses are under 5% in the casual cohort.

### 4.2 Core numbers

| Age | A (stat) | K (food) | Food/s at Lv 1 | Costs M/R/T | Melee HP/DMG | Ranged HP/DMG | Tank HP/DMG | Player base HP | Enemy bases (stages 1–5) |
|---|---|---|---|---|---|---|---|---|---|
| Stone | 1 | 1.0 | 1.0 | **5/8/12** | 60/12 | 40/18 | 260/22 | 400 | 400/440/480/520/700 |
| Ancient | 2.2 | 1.6 | 1.6 | 8/13/19 | 132/26 | 88/40 | 572/48* | 880 | 880/968/1,056/1,144/1,540 |
| Medieval | 4.8 | 2.4 | 2.4 | 12/19/29 | 288/58 | 192/86 | 1,248/106 | 1,920 | 1,920/2,112/2,304/2,496/3,360 |
| Gunpowder | 10.5 | 3.4 | 3.4 | 17/27/41 | 630/126 | 420/189* | 2,730*/231 | 4,200 | 4,200/4,620/5,040/5,460/7,350 |
| Industrial | 23 | 4.6 | 4.6 | 23/37/55 | 1,380/276 | 920/414* | 5,980/506* | 9,200 | 9,200/10,120/11,040/11,960/16,100 |
| Future | 50 | 6.0 | 6.0 | 30/48/72 | 3,000/600 | 2,000/900* | 13,000*/1,100 | 20,000 | 20,000/22,000/24,000/26,000/35,000 |

\*The trait modifier from §3.2 applies to the final value.

### 4.3 Gold income per battle (prototype, casual bot)

| Age | Regular win | Warlord win | Loss (kept) |
|---|---|---|---|
| Stone | 43–52 | ≈ 120 | 30–55 |
| Ancient | 51–70 | ≈ 138 | 35–50 |
| Medieval | 45–81 | ≈ 157 | 30–45 |
| Gunpowder | 52–75 | ≈ 164 | 30–50 |
| Industrial | 57–76 | ≈ 180 | 25–50 |
| Future | 63–91 | ≈ 194 | 30–50 |

Kill counts per battle run from 10 to 27. The flat kill Gold stays a third to a half of income all game, which is why the Camp resets every Age. Under persistent exponential prices, flat 1/5 kill Gold would become meaningless by the Gunpowder Age.

### 4.4 Pacing targets and prototype results

| Metric | Target (casual cohort) | Prototype result (40 runs) |
|---|---|---|
| Battle 1 win, lazy/slow-tapper bot | ≥ 98% | 100% (reaction 6–12 s per deploy) |
| Battle 1 duration | 30–55 s | 32–46 s |
| Battle duration (sim s), P50 / P90 / P99 | 60–90 / ≤ 120 / ≤ 150 | 86 / 119 / — |
| First-attempt win, regular stages | 80–95% | 1.0–1.6 attempts per stage (one outlier at 2.2) |
| First-attempt win, Warlords | 40–60% | 1.3–3.0 attempts |
| **First Evolution** | **P50 9–14 min**, P90 ≤ 18 | **11.9 / 13.5 min** |
| Ancient / Medieval / Gunpowder / Industrial cleared (P50) | — | 24.7 / 38.4 / 48.5 / 58.8 min |
| **Full run (Future Warlord)** | **P50 70–100 min**, P90 ≤ 130 | **72 / 77 min** (bots have less variance than humans) |
| Purchases per Age | 10–16 | ≈ 12–14 |
| Something affordable after a battle (first 30 min) | ≥ 80% | not measured in the prototype; becomes a harness metric |
| Max consecutive losses, P90 | ≤ 3 | Warlords up to 3 |

All times include 22 s of results and menu overhead per battle and assume ×1 speed. At ×2, wall-clock time is about 60% of that.

### 4.5 Why these structures (prototype lessons, kept as design rules)

1. **Ranged must be good value per Food**, or unlocking it makes the player weaker (seen in the prototype: 100% → 27%). Rule: each unlock must raise the casual bot's win rate on the next stage. The harness asserts this.
2. **Defenders spawn at their base, so attackers that arrive one at a time lose to clumps.** The lane naturally snowballs, which is why the rally and Storm Rising exist. Battle 1 has no rally and weakened enemies.
3. **A bad boss is a binary wall.** Warlord HP ×4 with splash ×1.2 and a 40–55 u radius is the sweet spot. Larger radii wipe whole armies (0% win at any level in the prototype). The calibrator tunes the Warlord's HP multiplier within [3, 5].
4. **Win-rate targets drive battle length.** Close fights (60–70% win) ran over 120 s; targets of 80–95% (regular) and 50% (Warlord) keep the median around 85 s.

### 4.6 Difficulty curve inside each Age (the saw-tooth)

```
 difficulty │        ╱│        ╱│        ╱│
            │     ╱   │     ╱   │     ╱   │   stage 1 of an Age = "new toys" easy win
            │  ╱      │  ╱      │  ╱      │   stages 2–4 ramp (E ↑, roles/inserts ↑)
            │╱  W     │╱  W     │╱  W     │   W = Warlord spike (≈50% first try)
            └─────────┴─────────┴─────────┴── stages
```

### 4.7 Headless balance harness and auto-calibrator

**What it runs.** The exact `src/sim` and `src/meta` code under Node via `tsx`. There is no re-implementation, so the sim the harness tests is the sim players get.

**Bot cohorts** (`tools/harness/bots/*.ts`):

| Bot | Deploy behaviour | Stormcall | Shopping | Purpose |
|---|---|---|---|---|
| `casual` | Pattern by owned slots (`m,m,r` → `m,r,t,m,m,r`); reaction 0.4–1.6 s once affordable | Uses at ≥ 3 enemies in radius or Warlord in radius | Unlocks first, then the cheapest track (Food weighted ×0.8) | Main pacing cohort |
| `lazy` | Same pattern; reaction 2–6 s; one deploy per decision | Never | Only the coach-highlighted item | Floor for FTUE and accessibility |
| `slow-tapper` | Reaction 6–12 s | Never | Same as lazy | Battle 1–2 guarantee |
| `optimizer` | Saves for a tank before scripted waves (reads the stage script); ideal timings | Optimal | Greedy by marginal win-rate gain | Ceiling: no stage should fall to a zero-upgrade optimizer when a sink is intended |
| `random` | A random affordable card every 1–4 s | Random | Random | Robustness / no softlock |

**Outputs.** `reports/balance/<date>-<gitsha>.md` and a JSON file containing:

* the per-stage table (win rate with Wilson 95% CI, attempts P50/P90, duration P10/P50/P90/P99, gold won/lost);
* the per-Age clear times (P10/P50/P90);
* purchases per battle and "affordable after battle %";
* zero-gold-loss %, consecutive losses, and trait ablations.

**CI assertions** (`npm run harness:ci`: 60 campaigns per cohort, fixed seeds, under 60 s):

| Check | Threshold |
|---|---|
| Battle 1 win (lazy, slow-tapper) | ≥ 98% |
| Stage 1 of each Age, first-attempt win (casual) | ≥ 85% |
| Regular-stage first-attempt win (casual), every stage | 75–97% |
| Warlord first-attempt win (casual) | 35–65% |
| Duration P50 per stage | 45–95 s (Battle 1 ≥ 25 s) |
| Duration P99 | ≤ 150 s |
| First Evolution P50 / P90 | 9–14 / ≤ 18 min |
| Full run P50 / P90 (casual) | 70–100 / ≤ 130 min |
| Full run (lazy) | finishes; P90 ≤ 200 min, no stuck stage (> 12 attempts) |
| Each unlock raises next-stage win rate | yes |
| Trait ablation: no single trait moves its Age's clear time by > 25% | yes |
| Determinism: same seeds give identical report hash | yes |

**Calibrator** (`npm run calibrate`, offline, not in CI):

1. Simulate 200 casual campaigns up to stage n, using the parameters already calibrated for earlier stages.
2. Take the **P25 player state** at entry to stage n: Gold, levels and owned slots.
3. Binary-search the stage's `E` within [0.2, 2.5], plus the Warlord HP multiplier within [3, 5], to hit the target first-attempt win rate (0.97 for Battle 1 with lazy; 0.9 / 0.85 / 0.8 for stages 1–4 of each later Age; 0.5 for Warlords).
4. Write `src/data/stages.calibrated.json`, then rerun the whole population and repeat 2–3 passes until the pacing is inside its bands.
5. The diff goes into the PR **for review**, and every value change is logged with before/after metrics. Human playtest logs (§7.11) can override with a recorded justification.

---

### 4.8 Tuning rules (from the craft proposal)


1. Change **one causal group** per experiment: waves for a stage, or price scale G for an Age, or one troop's stats. Log the hypothesis and the old and new values in `reports/balance/CHANGELOG.md`.
2. Re-run paired seeds and compare the deltas.
3. Never raise enemy HP to cover a broken Gold faucet. Fix the source.
4. Every number lives in `src/data/*`. The UI reads the same functions, so displayed numbers always equal sim numbers, and a test asserts this.

---
