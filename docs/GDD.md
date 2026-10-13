# WeAreStorm — Game Design Document (v1)

Status: **design baseline for v1**, assembled 2026-10-13 from the "Feel First" proposal (game design) with the "Visual Craft"
proposal's lane geometry, reconciled below. Numbers marked as prototype values are recalibrated by the real harness
(`docs/BALANCE.md` §4.7) before release. Owner choices: **clean cartoon art everywhere** and **We Are Warriors-style core loop
first**, six Ages kept. Everything is original (names, art, text, code); WAW is a genre reference only.

## Reconciliation (authoritative where it differs from the sections below)

1. **Lane geometry (single source of truth for sim AND art).** 1 art unit = 1 world unit (wu). Player gate face at **x = 0**,
   enemy gate face at **x = 1000**. Player base footprint x ∈ [−260, 0]; enemy base mirrored at [1000, 1260]. Player units
   spawn at x = −20, enemy units at x = 1020. Visible world on a 390-pt phone: x ∈ [−170, 1170] (0.291 pt/wu); wider screens
   reveal more world at the sides, never stretch. Unit body widths: melee 40, ranged 36, tank 64, vehicle/quadruped tank 90,
   Warlord 150–200. Distances are **edge to edge**: `gap(a,b) = |xa − xb| − (wa + wb)/2`; the base edge is its gate face.
   Art heights: troop 150, tank 200, Warlord 380, base tower ≈ 520.
2. **Stat conversion to that geometry.** The §2/§3 tables were prototyped on a 760-u front-to-front lane with centre
   distances. Use: speed × 1.3 (melee 105, ranged 90, tank 65, Warlord 40 wu/s); ranges as edge gaps — melee 12, tank 16,
   ranged 300 (Bolter 310, Bombardier 290, Pulse Ranger 320), Landship 80, Warlord slam reach 30 with slam radius 70.
   Projectile speed 680 wu/s (arc) / 1100 (bolt, bullet, beam). All other stats unchanged. The calibrator re-tunes stage
   budgets after this conversion; Battle 1 targets in §4.7 are the acceptance bar.
3. **One v1 special:** **Stormcall** (§2.12). The per-Age "Storm Powers" in the art bible (§5.11 meteorRain …
   orbitalLance) are the **v1.2 Skills** roadmap; build only the Stormcall lightning VFX in v1.
4. **Canonical names** are this GDD's (Clubber, Slinger, Rockhide, …; Warlords Chief Grumbo …). Art-bible base names
   (Totem Camp, Sun Ziggurat, Banner Keep, Star Bastion, Iron Works, Aegis Spire) are the canonical base names. Art-bible
   rig variants map to troops: quadruped = Tusker (and the Knight's horse), vehicle = Landship, mech = Titan.
5. **Age 3 is called "Medieval"** in UI copy (data id `medieval`).
6. **Flags/banners on bases:** owner decision (see `OWNER_DECISIONS.md`); default = small faction pennant on a pole beside
   the base, nothing hanging on the architecture.
7. **UI framework:** Preact + @preact/signals for DOM screens (see `TECH.md`), PixiJS v8 for world, battle HUD in-canvas
   where it must sync with the sim (deck fill, Food, base bars) — both read the same tokens.

---

## 0. TL;DR — the decisions that matter

1. **The whole lane is visible and the camera never scrolls.** One horizontal lane spans the screen width. Your base is at the left edge and the enemy base at the right. Units are about 40 pt tall on a phone. Each fight lasts 3–6 s, so a player can read it at a glance.
2. **Battles have three phases and always end.** First an *authored assault*: a finite script that runs for 40–50 s. Then a light *trickle* of reinforcements, plus one *rally* when the enemy base drops below 50%. Then **"Storm Rising"** overtime from 70 s: both sides deal more damage over time, and from 90 s bases take double damage. Median battle is about 85 s, P90 under 120 s, and every battle ends.
3. **The fixed-step sim resolves all hits at once.** It runs at 20 Hz (50 ms ticks). Food is stored as integer milli-food. Each attack has a windup, then an impact, then recovery. All damage in a tick is applied together. The renderer interpolates between ticks and uses the same windup timing, so the strike animation lands on the same frame as the damage.
4. **Locked rules are kept exactly.** Food starts at 0 and Stone Age makes 1 Food/s. Stone troops cost 5/8/12. Kills give 1 Gold (normal) or 5 Gold (tank), plus base-damage Gold. You keep Gold when you lose. Gold only comes from campaign battles. There are six Ages, at most three troop cards, and a new player owns only the Stone melee troop.
5. **The campaign is 30 stages: 6 Ages × 5 stages.** Stage 5 of each Age is a **Warlord** boss. The Warlord shields its base with a *ward* until you kill it. Beating the Warlord makes Evolution available, and Evolution is **free**.
6. **Gold buys an "Age Camp".** Each Age has five tracks: Food rate, Base HP, and training for Melee, Ranged and Tank (Lv 1–10 each). The tracks **reset on Evolution**, but each new Age's Lv 1 troops are stronger than the old Age's typical end state. Prices therefore restart low every Age, and the flat 1/5 kill Gold stays meaningful all game. Slot unlocks (Ranged 30 Gold, Tank 70 Gold) are bought once and are permanent.
7. **v1 has one special ability, "Stormcall".** It is a single on-brand lightning strike that unlocks at Battle 4. The full skills/cards/heroes/dungeons systems are designed (§3.7) but not built in v1.
8. **The art is "ShapeKit".** Every character, base, background and icon is written in a TypeScript shape DSL. ShapeKit has two outputs: Pixi Graphics, which get baked into texture atlases at load, and SVG, used for DOM portraits and tests. Every shape gets the same bold ink outline through a "stroke-under" pass, uses flat fills with one shade and one highlight, and is built as a chibi rig animated in code.
9. **The stack is TypeScript, Vite, PixiJS v8 (battle and world), and Preact with Signals for the UI.** Signals update the HUD at about 10 Hz without re-rendering the whole tree. Sim and data are pure TypeScript, run under Node for the harness, and have lint rules that keep them deterministic.
10. **Two agents build in parallel with strict file ownership.** Agent **SIM** owns gameplay, data, meta, audio, the harness and the configs. Agent **ART** owns ShapeKit art, the renderer, VFX and the UI. They share frozen contracts in `src/contracts/`. A Stone Age vertical slice at final quality is the first gate, before any other Age is built.

---

## 1. Pillars, core loop, session flow, FTUE

### 1.1 Pillars

| # | Pillar | What it means in practice | How we test it |
|---|---|---|---|
| P1 | **Tap → Clash → Crumble** | Every tap gives visible feedback in the same frame, and a unit steps out within 250 ms. Every hit flashes and shows a number. Every base falls with a big moment. | Input-latency e2e test; the polish checklist (§5.14) |
| P2 | **Always a next upgrade** | After at least 80% of battles in the first 30 minutes, the player can afford something. Numbers visibly go up. | Harness metric "affordable-after-battle %" |
| P3 | **Lose forward** | A defeat still pays Gold, and the defeat screen says what to upgrade. There are no timers, no energy and no paywalls. | Harness: no zero-gold losses; max consecutive losses at P90 ≤ 3 |
| P4 | **Ages you can feel** | Each Evolution brings a new world, base, troops, music and sounds, much bigger numbers, and a ceremony. | Evolution-spike assertion: stage 1 of each new Age has ≥ 85% first-attempt win rate |
| P5 | **One clean cartoon world** | One art bible and one UI kit cover everything, and everything is drawn in code. Bold outlines and bright flat colours look crisp at any DPR. | Screenshot matrix review; style lint (§5.4.7) |

### 1.2 Moment-to-moment loop (inside a battle)

```
 Food fills (visible meter + card fill) ──► Tap a card (choose WHAT + WHEN)
        ▲                                         │
        │                                         ▼
  Gold coins fly to counter ◄── Kill / hit base ◄── Units march, clash, trade hits
        │                                         │
        └──── Stormcall when charged (WHEN/WHERE it matters) ◄─┘
```

The player makes three real decisions in a battle:

1. **What to deploy.** Composition: a melee screen, ranged damage behind it, and a tank to soak hits.
2. **When to deploy.** Spend now or save. For example, hold food to drop a tank in front of an incoming wave. Food has no cap, so saving is always a valid choice.
3. **When to call the storm.** Clear a dangerous clump, finish a Warlord, or rescue a collapsing front line.

Optional: toggle ×2 speed when you are confident.

**Battle rhythm.** Every stage script is written to follow this shape:

| Time | Phase | What the player feels |
|---|---|---|
| 0–10 s | Build-up | Food ticks up. The first unit goes out at 5 s. The enemy's first unit appears at 6–10 s. |
| 10–45 s | Assault | The authored waves arrive and the front line moves back and forth. A tank or the Age's signature unit appears. |
| 45–70 s | Turning point | The script ends and the trickle starts. The player's army builds up. Hitting the enemy base below 50% triggers the **rally**. |
| 60–90 s | Push & Crumble | The enemy base breaks. The game slows down, the camera punches in, and the base collapses. VICTORY. |
| 70 s+ | Storm Rising | The sky darkens, rain falls, and damage ramps up for both sides so stalemates cannot drag on. |

### 1.3 Between-battle loop (meta)

```
 Battle ─► Results (gold tally, 4–7 s, skippable) ─► Smart CTA
   ▲                                                    │
   │      ┌── "UPGRADE" (if something affordable) ──► Army screen (Camp upgrades / unlocks)
   │      └── "NEXT BATTLE" (if nothing affordable) ─────────────────┐
   │                                                                  │
   └──────────────── Hub (Battle N, stage pips, big BATTLE button) ◄──┘
        Warlord beaten ─► "EVOLVE!" ─► Evolution ceremony ─► new Age Camp (Lv 1, cheap prices)
```

* **One tap to the next fight.** From Results, the primary button is either *Upgrade* or *Next Battle*, whichever is more useful. From the Hub, *BATTLE* starts immediately: no loadout screen, no confirmation.
* **The Gold sinks are visible every time.** The Army tab shows a red badge with the number of affordable upgrades. The Ages tab shows a glowing badge when Evolve is ready.

### 1.4 Session flow

* A loop (battle, results, upgrade) takes about **100–110 s** at ×1 speed and about 65 s at ×2.
* A typical session is **5–15 minutes, or 3–8 battles**. Age boundaries (the Warlord, then Evolution) are natural stopping points.
* There is no energy, no timers and no daily gate in v1. Cold start to battle takes under 3 s on a mid phone. Resuming the app returns the player exactly where they were. A battle in progress auto-pauses when the app is hidden (§2.13).

### 1.5 The first 10 minutes (FTUE) — "teach by playing"

**Rule: every one of the first five battles introduces exactly one new thing.** Coaching comes from **Nimbus**, a small storm-cloud mascot drawn in code. Nimbus speaks in one-line bubbles that never block input and never pause the sim, except for the single optional "tap here" moment in Battle 1.

| Clock (approx.) | Beat | What happens | New thing |
|---|---|---|---|
| 0:00 | Title | Logo, "TAP TO PLAY". The first tap also unlocks audio. **No menus before the first battle.** | — |
| 0:05 | **Battle 1 "First Hunt"** | The deck shows only the **Clubber** card. Food starts at 0 and the card fills from the bottom. At 5 Food the card pops "READY", a hand pointer appears and Nimbus says *"Tap to send a Clubber!"* After the third deploy the coach disappears. The first enemy appears at 10 s and enemies are weakened (×0.8). | Food, deploying, the lane |
| ≈0:45 | Victory | Slow-motion, camera punch and base collapse, then VICTORY with the Gold tally (≈ 40 Gold). The one button is "Continue". | Gold from kills and base damage |
| ≈1:10 | Hub, first visit | Nimbus: *"New recruit available!"* The Army tab pulses. The **Slinger unlock (30 Gold)** card pulses with a hand pointer. Buying it plays confetti and the card flips over. Nimbus: *"Back to battle!"* | Upgrades screen, unlocks |
| ≈1:40 | **Battle 2** | Two cards. One bubble: *"Slingers shoot from behind your Clubbers."* The enemy also fields slingers. | Ranged role |
| ≈3:00 | Results → Hub | Nimbus points at **Food Lv 2 (20 Gold)**: *"More Food = more troops!"* | Camp upgrades |
| ≈3:20 | **Battle 3** | The **×2 speed** button appears with a tooltip. | Speed-up |
| ≈4:40 | Results → Hub | The **Rockhide (tank) unlock, 70 Gold**, is usually affordable now or after Battle 4. If so, it is pointed out. | Tank role |
| ≈5:10 | **Battle 4** | The **Stormcall** ring appears and charges. When it is full, a hand pointer and *"Call the storm!"* appear, then lightning hits, enemies scatter and coins burst out. The enemy fields its first tank. | Stormcall |
| ≈6:40 | **Battle 5 — WARLORD** | At 20 s: slow-motion, a banner reading "CHIEF GRUMBO APPROACHES!", a boss HP bar, and a shimmering ward on the enemy base. Nimbus: *"Beat the Warlord to break the ward!"* | Bosses, ward |
| ≈8:00 | Win, or lose then retry | **Loss:** a calm DEFEAT screen: *"You keep 38 Gold — upgrade and try again!"* The primary button is UPGRADE, which teaches the lose → upgrade → retry loop. **Win:** "WARLORD DEFEATED", then a giant "EVOLVE!" button. | Losing forward |
| ≈9–13 min | **Evolution ceremony** | Storm clouds, lightning on the base, the troops transform, and the "ANCIENT AGE" title card slams in. | Ages |

The prototype puts the first Evolution at **P50 11.9 min and P90 13.5 min** (casual bot with 22 s of overhead per battle). The target band is 9–14 min.

### 1.6 Deliberately not in v1

Cards, skill collections, Heroes, Dungeons, Gems, a shop, ads and IAP, daily rewards, accounts and cloud save. Each has a designed place (§3.7, §6) so v1 layouts do not need rework later. The HUD reserves the space for the Hero ring and three skill rings, and the bottom nav reserves space for five tabs.

---

## 2. Battle rules

### 2.1 Coordinates and lane geometry

* **World units (u).** The lane runs from x = 0 to x = 1000. The ground line is y = 0, with +y pointing up in the art and converted for render.
* **Player base** occupies x ∈ [0, 120], with its **front at 120**. **Enemy base** occupies [880, 1000], with its front at 880. Spawn points are x = 122 and x = 878. The marching distance between fronts is **760 u**.
* **Depth band (cosmetic only).** Each unit gets a depth offset `d ∈ [−12, +12] u` from a hash of its id. It shifts the render y and the z-order and has **no gameplay effect**. Allies may overlap, and the depth offset keeps overlapping units readable.
* **Camera.** The camera is static and fits x ∈ [−40, 1040] (1080 u) to the screen width, clamped so the scale stays between 0.33 and 0.95 pt/u. At 390 pt wide that is 0.361 pt/u, so a melee unit (112 u) is about 40 pt tall. At 820 pt (iPad) it is 0.759 pt/u, so a melee unit is about 85 pt. Above that width, extra background shows at the sides.
* The **ground line sits at 72% of the battlefield height**. The rest of the vertical space is sky, where the storm and lightning happen. The ground strip below the line is capped at 140 pt.

### 2.2 Simulation clock

* **Tick = 50 ms (20 Hz).** All durations are integer ticks. A unit's windup is 7 ticks (0.35 s), for example.
* At **×1 speed** the sim runs 1 tick per 50 ms of real time. At **×2** it runs 2 ticks. Slow-motion moments run fewer ticks per real second: this changes **presentation only**, and the tick sequence stays identical.
* Catch-up is capped at 4 × speed ticks per frame to avoid a spiral of death. If the frame budget is exceeded, the sim slows down rather than skipping ticks.

### 2.3 Food

* Food starts at **0** every battle. It is stored as **integer milli-food** (1 Food = 1000 mf).
* Gain per tick is `round(ageBaseRate × (1 + 0.10 × (FoodLv − 1)) × 1000 / 20)`. Stone at Lv 1 gives exactly 50 mf/tick, or 1.0 Food/s.
* **There is no Food cap** (locked rule). The display shows `floor(food)` and the rate to one decimal ("+1.2/s").
* Food does not accrue while paused or hidden.

### 2.4 Deploying

* There are **at most three cards**: Melee, Ranged and Tank, in the slots the player owns. Locked slots are **absent** in battle, not shown as greyed-out.
* Tapping a card produces a `deploy(slot)` command, applied at the next tick boundary. If `food ≥ cost`, `queue < 4` and `fieldCount < 30`, the cost is deducted at once and the unit joins the **spawn queue**. The base releases one queued unit every **5 ticks (250 ms)**, which streams units out in a satisfying column. Queued units show as small pips on the card.
* A failed tap (not enough food, queue full, or army full) makes the card do a small shake, play a soft "nope" sound and flash its cost. Nothing else happens.
* Card states: **Ready** (bright; pops once when it first becomes affordable), **Filling** (desaturated, with a fill rising from the bottom showing `food / cost`), **Queued** (pips), **Army full** ("MAX" tag at 30 units on field).

### 2.5 Units, roles and the stat model

There are three roles plus the **Warlord** boss.

| Role | Purpose | Stone stats (Lv 1): Cost · HP · DMG · Interval · Windup · Range · Speed | Kill Gold (enemy) |
|---|---|---|---|
| **Melee** | Cheap front line that trades evenly | 5 · 60 · 12 · 1.0 s · 0.35 s · 30 u · 80 u/s | 1 |
| **Ranged** | Damage from behind the line; fragile | 8 · 40 · 18 · 1.2 s · 0.40 s · 250 u · 70 u/s (projectile 520 u/s) | 1 |
| **Tank** | Wall that soaks damage and hits hard | 12 · 260 · 22 · 1.5 s · 0.50 s · 36 u · 50 u/s | **5** |
| **Warlord** | Boss on stage 5 of each Age; telegraphed slam (area damage) | — · 4 × Tank HP · 1.2 × Tank DMG (slam, radius 55 u) · 2.6 s · **0.9 s telegraph** · 46 u · 30 u/s | 25 |

How the stats change:

* **Per Age.** HP and DMG are multiplied by the Age stat factor A = 1, 2.2, 4.8, 10.5, 23, 50. Food cost and Food rate are both scaled by the Age food factor K = 1, 1.6, 2.4, 3.4, 4.6, 6.0. Because both scale together, "seconds of Food per melee" stays at 5 s at Lv 1 in every Age, while the numbers keep growing.
* **Per training level.** Each level adds +10% HP and +10% DMG, so Lv 5 = ×1.4 and Lv 10 = ×1.9.
* **Signature traits.** One trait per unit at most, from Ancient onward; see §3.3. Traits are data and can be toggled in tests.

The value per Food is deliberately different for each role:

* Melee gives the most DPS per Food (2.4).
* Ranged gives 1.9 DPS per Food, but survives behind the line.
* Tank gives the most HP per Food (21.7).

The prototype confirmed that each unlock makes the player *stronger*. An earlier version had a weak Ranged that lowered win rate from 100% to 27%; that is why the Ranged numbers were raised.

### 2.6 Movement and targeting (two-phase, order-independent)

Each tick runs in two phases.

* **SENSE.** This phase reads only the positions at the start of the tick. For each unit:
  * **Target** = the nearest hostile unit by |dx| that is within `range`. Ties go to the lower id.
  * Otherwise, the hostile **base**, if its front is within `range`.
  * Otherwise, no target.
* **ACT.**
  * A unit that is mid-attack stays committed and does not move.
  * A unit with a target and its cooldown at 0 starts an attack.
  * A unit with no target moves forward `speed / 20` u, clamped so it never passes the hostile base front.
  * Units **do not collide with allies**. They **cannot pass enemies**, because they stop as soon as an enemy is in range.

Since the nearest hostile is always the front-most one, ranged units naturally shoot the front line and then the base.

### 2.7 Attack resolution

* **Attack cycle:** `windup` ticks, then an **IMPACT** tick, then `interval − windup` ticks of recovery. The sim emits `attackStart(id, target, impactTick)` so the renderer can time the anticipation pose and land the strike frame exactly on the impact tick.
* **Re-check at impact.** If the original target is still alive and within `range + 10 u`, hit it. Otherwise hit the current nearest valid target in range. If there is none, the attack whiffs: a VFX-only swoosh, and the full recovery still applies. This is forgiving: units rarely "waste" a swing, and it looks right.
* **Melee and slam** produce a damage event straight away.
* **Ranged** fires a homing projectile with `flightTicks = max(2, round(dist / projSpeed × 20))`.
  * On arrival it hits if the target is still alive. Otherwise it fizzles (lands and puffs dust, VFX only).
  * A **splash** projectile explodes at the target's current position, or its last known x, and hits every hostile within the radius. It hits the base too if the base front is within the radius.
* **Damage applied** = `round(dmg × stormMult × (1 − armor))`, with a minimum of 1. HP is an integer.
* **Tick order (fixed):**
  1. Apply commands.
  2. Release the spawn queue.
  3. Enemy script spawns.
  4. Food.
  5. SENSE.
  6. ACT (move, start attacks).
  7. Impacts produce damage events.
  8. Projectile arrivals produce damage events.
  9. **APPLY all damage events at once.**
  10. Remove deaths together and grant rewards.
  11. Base state, ward and rally checks.
  12. Win/lose check.

  Two units that hit each other in the same tick both take damage and can both die, regardless of processing order.
* If **both bases fall in the same tick, the player wins** (generous by design).
* There is **no knockback in the sim**. Recoil is visual only, so positions stay simple and deterministic.

### 2.8 Bases

* **Player base HP** = Age base HP × (1 + 0.15 × (BaseLv − 1)). Age base HP: Stone 400, Ancient 880, Medieval 1,920, Gunpowder 4,200, Industrial 9,200, Future 20,000.
* **Enemy base HP** = Age base HP × (1 + 0.1 × stageIdx), and × 1.25 on Warlord stages. stageIdx runs 0–4. Stone values: 400 / 440 / 480 / 520 / 700.
* **Bases are passive in v1** (no turrets). This keeps the fighting in the middle of the lane. A "Base Cannon" upgrade is a possible later sink.
* **Damage states** (visual): Intact > 66%, Cracked 66–33%, Burning < 33%, then a collapse sequence at 0 (§5.7).
* **Warlord ward.** On Warlord stages the enemy base is invulnerable until the Warlord dies. It shows a pulsing red hex bubble, and hits on it produce "ting" sparks and no numbers. When the Warlord dies the ward **shatters** and a "WARD BROKEN!" toast appears. Base-damage Gold only starts after the ward is gone.

### 2.9 Enemy spawning — authored, finite and calibrated

Each stage is a data record (§7.3 schema):

* **Assault window** `[start, end]`, for example 7–42 s. A **budget rate** `E` (a multiple of the player's Lv 1 Food rate for that Age) is spent following a **pattern string** such as `"mmrmt"`. The generator expands this into exact spawn ticks when the stage loads: virtual food accrues at E × rate, and the next unit in the pattern is bought when affordable. The output is deterministic and can be checked against a golden snapshot.
* **Inserts.** Authored set pieces, for example "tank at 30 s" or "3 slingers together at 25 s".
* **Trickle.** After the assault ends, one unit every 6 s cycling through `"mmr"`. Battle 1 uses every 10 s.
* **Rally.** Once, when enemy base HP first drops below 50% (from Battle 2 onward), a pack of 2–5 units spawns at once with a horn sound and an "ENEMY RALLY!" toast.
* **Warlord.** Spawns at 20 s on stage 5 of each Age, with an intro (§6.3.4).
* **Enemy field cap: 30.** Enemy units use the stage's Age roster at Lv 1 × the stage stat multiplier: 0.8 on Battle 1, otherwise 1.0. Later Timelines multiply further (§3.7).

The authored part is finite and the trickle is bounded and weak, so **a player who keeps deploying always wins eventually**. The old repo had endless 3.5 s spawns that a 1 Food/s player could not beat; this structure cannot repeat that. The rally and Storm Rising prevent "dead" endings and stalemates.

### 2.10 Overtime — "Storm Rising" (anti-stalemate, on-brand)

* From **70 s**, all units deal **× (1 + 0.2·k)** damage, where k = 1 + floor((t − 70 s) / 10 s). So ×1.2 at 70 s, ×1.4 at 80 s, and so on.
* From **90 s**, bases take **×2** damage.
* Presentation: the sky darkens in steps, rain starts, thunder rolls, and a small "STORM RISING ⚡1/2/3" chip appears under the stage label. The rule is symmetric. It makes long battles dramatic instead of dull, and keeps sim time at P99 under 150 s.

### 2.11 Win, lose, retreat and rewards

* **Victory:** enemy base HP ≤ 0. **Defeat:** player base HP ≤ 0. **Retreat** (pause menu, with a confirm) counts as a defeat.
* **Gold earned during the battle is always kept** (locked rule):
  * **Kills:** 1 Gold per normal kill, 5 per tank, 25 per Warlord.
  * **Base damage:** +1 Gold for each full 5% of enemy base max HP removed, up to 20. Not earned while the ward is up.
  * **Victory bonus (first clear only):** regular stages 12 + 4·idx + 3·age; Warlord stages 60 + 15·age. Replays (only possible after the campaign ends or in Storm Surge, §3.7) pay 50%.
* **Settlement is atomic** and keyed by `battleId`, so it is idempotent (§7.7). A battle in progress writes a checkpoint of earned Gold every 5 s. If the app is killed, the next launch settles it as a retreat with that Gold. A crash never costs progress.

### 2.12 Stormcall (the one v1 special)

* **Unlocks** before Battle 4. It lives in the ring slot at the right of the deck's top row.
* **Charge:** starts empty and is ready at 25 s. The cooldown after use is 30 s. The ring fills clockwise and pulses plus chimes when full.
* **Use:** one tap, auto-targeted at the **hostile unit nearest the player's base** (the biggest threat). After a 0.5 s gather (clouds build, ground marker), it strikes **once**:
  * All hostile units within 80 u of that point take `2 × (Age melee base HP)`: 120 in Stone, enough to kill a melee or ranged Lv 1 unit and to half-kill a tank.
  * The Warlord takes 50%.
  * Bases are immune.
  * Visually it is three bolts over 0.4 s; the damage is a single impact event.
* No upgrades in v1; it scales with Army Age. If it is not unlocked, no ring is shown. The harness bot uses it when at least 3 enemies or the Warlord are in the radius.
* **Why it is in v1:** lane battlers can feel passive when Food is low. One dramatic, readable, comeback-capable button adds a "clutch" moment every 30 s. The HUD already reserves the ring. It is built **after** the core passes gate G1 and sits behind a feature flag (§8).

### 2.13 Speed-up and pause

* **×2 speed** unlocks at Battle 3. The toggle is in the top-right of the HUD, and the choice is remembered. ×2 doubles the ticks per real second, so outcomes are identical; this is tested.
* **Pause:** a top-right button or `visibilitychange`/`blur` (auto-pause). It opens a sheet with **Resume**, **Retreat** (confirm: "You keep your 23 Gold"), **Sound**, **Music**, **Haptics** and **Reduce Motion**. The sim stops and so does food; the presentation clock freezes. On resume there is a 0.5 s fade back in with no lost input.

### 2.14 Gameplay-side readability rules

* At most 30 units per side, so the lane never turns into mud.
* Role silhouettes must differ: melee is medium-width and upright, ranged is lanky with a long weapon or bow, the tank is wide and about 1.35× taller, and the Warlord is about 2.2× taller.
* Faction colour covers at least 30% of each unit's silhouette (blue for the player, red for the enemy). Facing direction gives a second cue, and enemy faces have angry brows as a third.
* A unit's HP bar appears only after it takes damage and fades out 2 s after the last hit. Enemy base and Warlord bars are always visible.
* Damage numbers appear **only for damage dealt by the player** (to enemy units and the enemy base). Hits on the same target within 150 ms are merged into one number. This keeps the screen readable and makes the player feel powerful.
* Every Warlord slam has a red ground ring telegraph that grows over its 0.9 s windup.

---

## 3. Content

### 3.1 The six Ages

| # | Age | World mood (background) | Base | Music mood | Warlord (stage 5) | Signature trait unit |
|---|---|---|---|---|---|---|
| 1 | **Stone** | "Sunny Valley": green hills, snowy peaks, sun | Cave Camp: rock mouth, log palisade, bone totem | Bouncy marimba and log drums, 112 bpm, major | **Chief Grumbo** on a woolly mammoth | — (learn the basics) |
| 2 | **Ancient** | "Golden Coast": sea, mesas, temple ruins, cypress | Temple Keep: stepped sandstone, columns, brazier | Lyre-like pluck, frame drum, 104 bpm, Dorian | **The Bronze Colossus** | Tusker: *Cleave* |
| 3 | **Medieval** | "Green Kingdom": castles, forests, fields | Castle Keep: stone keep, conical roof, gate | Fife plus snare march, 120 bpm, Mixolydian | **Baron Blackmace** | Knight: *Charge* |
| 4 | **Gunpowder** | "Harbor Dusk": sunset sea, ships, cliffs, windmill | Bastion: star-fort wall, cannon port, barrels | Accordion-ish squeeze plus "boom" drum, 6/8 shanty, 116 bpm | **Admiral Kaboom** | Bombardier: *Splash*; Ironclad: *Armor* |
| 5 | **Industrial** | "Smoke & Steel": hazy amber skyline, chimneys, rails | Foundry Fort: brick, riveted gate, chimney stacks | Clanky percussion, brass stabs, 124 bpm | **The Iron Juggernaut** | Gunner: *Rapid*; Landship: *Splash* |
| 6 | **Future** | "Neon Night": dark violet sky, towers, holo-arches | Arc Citadel: dome, energy ring, antenna | Synth arps, side-chained pad, 128 bpm | **OMEGA Core** | Pulse Ranger: *Pierce*; Titan: *Armor* |

The player's faction is **Storm**: blue with a gold lightning crest. The enemy is **Ember**: red with a dark flame crest. Both factions exist in every Age and are rival clans through history.

### 3.2 Troops (18) and Warlords (6)

Stats are Lv 1. **Cost** is Food. HP/DMG = base role stats × Age factor × trait modifier.

| Age | Slot | Name | Role | Cost | HP | DMG | Interval | Range | Speed | Trait | Visual concept |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Stone | Melee | **Clubber** | Melee | 5 | 60 | 12 | 1.0 s | 30 | 80 | — | Stocky caveman, faction-coloured spotted hide tunic, huge bone club, messy hair tuft |
| Stone | Ranged | **Slinger** | Ranged | 8 | 40 | 18 | 1.2 s | 250 | 70 | — | Lanky kid with a headband, spins a sling overhead; pebble projectile with a small trail |
| Stone | Tank | **Rockhide** | Tank | 12 | 260 | 22 | 1.5 s | 36 | 50 | — | Big round brute in a mammoth-fur cape, flat stone slab shield, rock hammer; ground thump on hit |
| Ancient | Melee | **Hoplite** | Melee | 8 | 132 | 26 | 1.0 s | 30 | 80 | — | Bronze crested helmet (crest = faction colour), round shield with crest emblem, short spear |
| Ancient | Ranged | **Javelineer** | Ranged | 13 | 88 | 40 | 1.2 s | 250 | 70 | — | Light tunic, laurel, throws javelins on a high arc |
| Ancient | Tank | **Tusker** | Tank | 19 | 572 | 41 | 1.5 s | 40 | 50 | **Cleave 40 u** (DMG ×0.85) | Small cartoon war elephant with a faction-coloured saddle cloth and a tiny rider; trunk swipe |
| Medieval | Melee | **Footman** | Melee | 12 | 288 | 58 | 1.0 s | 30 | 80 | — | Kettle helm, faction tabard, kite shield, sword |
| Medieval | Ranged | **Bolter** | Ranged | 19 | 192 | 86 | 1.2 s | 260 | 70 | — | Crossbowman with a padded gambeson and a big crossbow; fast flat bolts |
| Medieval | Tank | **Knight** | Tank | 29 | 1,248 | 106 | 1.5 s | 40 | 50 (×1.4 until first contact) | **Charge** (first hit ×2.5) | Barded horse with faction caparison, knight with plumed great helm and lance; dust trail on charge |
| Gunpowder | Melee | **Corsair** | Melee | 17 | 630 | 126 | 1.0 s | 30 | 80 | — | Bandana, striped shirt in faction colour, cutlass, peg-leg optional (variety toggle) |
| Gunpowder | Ranged | **Bombardier** | Ranged | 27 | 420 | 132 | 1.3 s | 240 | 70 | **Splash 45 u** (DMG ×0.7, arcing) | Tricorn hat, lobs round fuse bombs; big cartoon explosion |
| Gunpowder | Tank | **Ironclad** | Tank | 41 | 2,457 | 231 | 1.5 s | 38 | 50 | **Armor 25%** (HP ×0.9) | Giant sailor in a steel cuirass swinging a ship's anchor |
| Industrial | Melee | **Trencher** | Melee | 23 | 1,380 | 276 | 1.0 s | 30 | 80 | — | Brodie helmet, goggles, faction scarf, trench shovel |
| Industrial | Ranged | **Gunner** | Ranged | 37 | 920 | 138 ×3 | 0.4 s per shot | 250 | 70 | **Rapid** (3 shots per 1.2 s cycle) | Lying-prone feel is avoided: stands with a tripod gun; tracer lines and muzzle flashes |
| Industrial | Tank | **Landship** | Tank | 55 | 5,980 | 405 | 1.6 s | 70 | 45 | **Splash 40 u** (DMG ×0.8) | Rhomboid tracked tank with a faction stripe and a stubby cannon; recoil and smoke ring |
| Future | Melee | **Voltblade** | Melee | 30 | 3,000 | 600 | 0.9 s | 30 | 95 | — | Sleek android with a visor, energy sword glowing faction cyan-blue or red |
| Future | Ranged | **Pulse Ranger** | Ranged | 48 | 2,000 | 720 | 1.2 s | 270 | 70 | **Pierce 2** (DMG ×0.8) | Hover boots, long rifle; beam goes through the first two targets |
| Future | Tank | **Titan** | Tank | 72 | 11,700 | 1,100 | 1.5 s | 40 | 45 | **Armor 30%** (HP ×0.9) | Chunky bipedal mech with a hex energy shield on its forearm |

| Warlord | Age | Concept | Slam style |
|---|---|---|---|
| **Chief Grumbo** | Stone | Woolly mammoth (round fuzzy body, curly tusks) with a tiny chief on top waving a club | Mammoth stomp: dust ring and cracked earth |
| **The Bronze Colossus** | Ancient | Walking bronze statue warrior with crest and shield, slightly turquoise patina | Shield slam: bronze shockwave |
| **Baron Blackmace** | Medieval | Towering knight in charcoal armour (red trim when enemy), spiked mace | Overhead mace smash with sparks |
| **Admiral Kaboom** | Gunpowder | Huge admiral with a cannon-arm, bicorne hat, epaulettes | Point-blank cannon blast: smoke cloud and flash |
| **The Iron Juggernaut** | Industrial | Treaded locomotive-war-machine hybrid with a face-like grille and smokestacks | Piston ram: steam burst |
| **OMEGA Core** | Future | Floating spherical AI core inside a mech frame, single giant eye | Gravity pulse: inverted ring and screen chroma |

The player never fields Warlords in v1; they are boss-only. **Heroes** later reuse Warlord-scale rigs for the player's side (§3.7).

**Variety inside a squad** (cosmetic, seeded from the unit id):

* 4 skin tones;
* 2 accessory toggles per unit (hair tuft or bone, laurel or none, peg-leg or boot, and so on);
* scale 0.97–1.03.

Faction colours never vary.

### 3.3 Trait toolkit (data-driven, one trait per unit max)

| Trait | Rule | Readable cue |
|---|---|---|
| `cleave(r)` | A melee impact also hits every other hostile within r of the primary target | Wide swoosh arc VFX |
| `charge(mult, speedMult)` | Moves at speed × speedMult until its first attack; the first impact deals DMG × mult | Dust trail, then a big "CHARGE" hit with heavier hitstop |
| `splash(r)` | The projectile explodes at the target and hits all hostiles within r, plus the base if in r | Cartoon explosion with a ring |
| `armor(p)` | Incoming damage × (1 − p) | Metallic "tink" sparks, and the damage number is grey-blue |
| `rapid(n)` | Fires n shots in one attack cycle (n impacts spread evenly across the cycle) | Muzzle flashes and tracer lines |
| `pierce(n)` | The projectile hits the first n hostiles along the line, in order of distance | A beam that passes through |
| `slam(r)` | Warlord only: area impact with radius r around its front | Telegraph ring and shockwave |

Enemy units of the same Age have the same traits; the game is symmetric. Every trait has unit tests and a harness ablation run (trait on/off) to confirm it is neither useless nor dominant.

### 3.4 Campaign: 30 stages

* **Stage n maps to Age ⌈n/5⌉.** Stage 5k is the Warlord of Age k.
* The Hub shows **"Battle N"** with a subtitle and five pips for the current Age (the fifth is a skull).

| # | Age | Title | Enemy pattern (assault) | Seed budget E* | Notes / new thing |
|---|---|---|---|---|---|
| 1 | Stone | First Hunt | `m` | **0.40** (enemy ×0.8, first spawn 10 s, trickle every 10 s, no rally) | Tutorial win; lazy and slow-tapper bots must win ≥ 98% |
| 2 | Stone | Sling Ridge | `mmr` | 0.85 | Enemy slingers |
| 3 | Stone | Boulder Pass | `mmrmr` | 0.75 | ×2 speed unlocked |
| 4 | Stone | Rockhide Rumble | `mmrtmr` | 0.80 | First enemy tank; Stormcall unlocked |
| 5 | Stone | **WARLORD: Chief Grumbo** | `mmrmr` + Warlord at 20 s | 0.30 | Ward, boss bar |
| 6 | Ancient | Bronze Dawn | `mmrmt` | 1.05 | Evolution showcase; must feel easy (≥ 85% first try) |
| 7 | Ancient | Javelin Shore | `mrmrt` | 1.15 | Javelin arcs |
| 8 | Ancient | Temple Steps | `mmrtr` | 1.20 | Insert: two Tuskers at 28 s (Cleave lesson) |
| 9 | Ancient | Tusker Trail | `mrtmrt` | 1.20 | |
| 10 | Ancient | **WARLORD: Bronze Colossus** | `mmrmr` + Warlord | 0.35 | |
| 11–15 | Medieval | Banner Hill · Bolt Woods · Moat Crossing · Lance Charge · **WARLORD: Baron Blackmace** | same idx pattern set | 1.05 · 1.15 · 1.20 · 1.20 · 0.35 | Knight Charge insert on stage 12 |
| 16–20 | Gunpowder | Powder Bay · Bomb Bluff · Corsair Cove · Anchor's Edge · **WARLORD: Admiral Kaboom** | ″ | ″ | Bombardier splash insert on stage 17 (teaches "don't clump", read via explosions) |
| 21–25 | Industrial | Smoke Yard · Rail Junction · Gear Works · Landship Ridge · **WARLORD: Iron Juggernaut** | ″ | ″ | Gunner nest insert on stage 22 |
| 26–30 | Future | Neon Outskirts · Pulse Plaza · Arc Bridge · Titan Foundry · **WARLORD: OMEGA Core** | ″ | ″ | Final stage: Warlord spawns at 15 s, ward plus a second rally |

\*E is a multiple of the player's Lv 1 Food rate for that Age, spent during the assault window (start 6–10 s, end 40 + 2·age s). The seeds are smoothed from the prototype calibrator (raw output in Appendix B) and **must be recalibrated** by the real harness (§4.7). They are not hand-tuned.

### 3.5 Evolution rules

* **Requirement:** you have defeated the Warlord of your current Army Age. **Cost: free.**
* **Trigger:** the explicit "EVOLVE!" button. It is the primary call to action on the Warlord victory screen, the Hub and the Ages tab. Winning never evolves silently. **Next-Age battles cannot start until you Evolve**, which avoids confusing mixed states in v1.
* **Effects:**
  * `armyAge + 1`.
  * The Camp tracks (Food, Base, Melee, Ranged, Tank) reset to Lv 1 in the new Age.
  * Owned slots carry over: if you owned Ranged in Stone, you own Javelineer now.
  * The base, roster, Food rate and costs switch to the new Age.
  * **Gold is kept.**
* **The evolution spike is guaranteed by data:** new-Age Lv 1 troops have about 1.6× the HP/DMG of old-Age Lv 5 troops. For example, Clubber Lv 5 has 84 HP; Hoplite Lv 1 has 132 HP. Together with the cheap new prices and carried Gold (the Warlord pays 110–200), the player typically buys 3–5 upgrades immediately. The harness asserts that Age stage 1 has ≥ 85% first-try wins.
* **Data model:** `armyAge` and `campaignStage` are stored separately. In v1 they move together. Storm Surge and Dungeons later let them diverge, as the brief requires.

### 3.6 Upgrades — what Gold buys

**Army screen ("Camp")**

| Item | Effect per level | Max | Base price p0 (Stone) | Notes |
|---|---|---|---|---|
| **Unlock Ranged slot** | Adds the Ranged card | once | **30** | Permanent across Ages and Storm Surge |
| **Unlock Tank slot** | Adds the Tank card | once | **70** | Requires Ranged first; permanent |
| **Food (Hearth)** | +10% of Age base Food rate | Lv 10 | 20 | Resets per Age |
| **Base (Walls)** | +15% base HP | Lv 10 | 15 | Resets per Age |
| **Melee training** | +10% HP & DMG | Lv 10 | 12 | Resets per Age |
| **Ranged training** | +10% HP & DMG | Lv 10 | 16 | Needs the slot; resets per Age |
| **Tank training** | +10% HP & DMG | Lv 10 | 22 | Needs the slot; resets per Age |

**Price** = `round(p0 × ageMult × 1.3^(Lv − 1))` with `ageMult = 1 + 0.25 × (age − 1)`, giving 1.0, 1.25, 1.5, 1.75, 2.0, 2.25.

Stone price ladder (Lv → Lv+1):

| Track | 1→2 | 2→3 | 3→4 | 4→5 | 5→6 | 6→7 | 7→8 | 8→9 | 9→10 | Σ to max |
|---|---|---|---|---|---|---|---|---|---|---|
| Food | 20 | 26 | 34 | 44 | 57 | 74 | 97 | 125 | 163 | 640 |
| Base | 15 | 20 | 25 | 33 | 43 | 56 | 72 | 94 | 122 | 480 |
| Melee | 12 | 16 | 20 | 26 | 34 | 45 | 58 | 75 | 98 | 384 |
| Ranged | 16 | 21 | 27 | 35 | 46 | 59 | 77 | 100 | 131 | 512 |
| Tank | 22 | 29 | 37 | 48 | 63 | 82 | 106 | 138 | 179 | 704 |

In the prototype, a typical player at the Warlord had about Food 3–4, Base 4, Melee 5, Ranged 3–4 and Tank 2: roughly 12–14 purchases per Age, about two per battle. Maxing everything (2,720 Gold in Stone) is optional and acts as a buffer for players who struggle.

### 3.7 Systems roadmap — v1 versus later

| Release | System | Design summary | Hooks reserved in v1 |
|---|---|---|---|
| **v1.0** | Core loop | 6 Ages, 30 stages, 18 troops, 6 Warlords, Camp upgrades, slot unlocks, Evolution, Stormcall, ×2, pause, local save, audio, FTUE | — |
| **v1.1** | **Storm Surge (prestige / Timelines)** | After the OMEGA Core falls with a Future army you may Surge: back to Stone, Camp reset, slot unlocks kept, `timeline + 1`. Enemies get ×1.35^(T−1) HP/DMG and a rotating modifier (Swift / Fortified / Frenzy). Each Surge grants **Storm Shards** (a new permanent currency, never Gold) and a permanent +10% Gold gain (capped). Cleared stages become replayable at 50% bonus. | `timeline` field in save; stage-scaling hook in sim; replay flag |
| v1.2 | **Skills** | Stormcall becomes skill slot 1; two more slots. Candidates: Rally Horn (+30% DMG for 6 s, refresh never stacks), Frost Snap (slow 40% for 4 s; Warlords 50% resistant), Meteor (delayed big area damage). Upgraded with Shards using **bounded curves** (asymptotic duration, see the old doc's lessons). | Ring slots in deck row A (§6.3.3); `abilities[]` in sim input |
| v1.3 | **Cards** | Permanent passive collection (+Food %, +HP %, +Gold %, +Base %), levelled with duplicates. Sources are Dungeons and Surge milestones only. Disclosed odds and **hard pity**. No Gold sources (locked). | Multiplier pipeline in stat calc (`globalMods`) |
| v1.4 | **Heroes** | One Hero ring: deploy once per battle, a unique Warlord-scale unit per Age family. The first Hero is granted on the first Storm Surge. | Hero ring position (deck row A left), `deployHero` command in the contract (rejected in v1) |
| v1.5 | **Dungeons** | Rush (survive 45 s), Boss Gauntlet, Survival (carried base HP with cash-out). They reward Shards and Cards, **never Gold**, and use Keys. | Bottom nav has 5 positions, 3 used in v1 |
| later | Cosmetics / monetisation | Base skins, troop skins, Nimbus outfits. Real store integration only through Capacitor billing after validation. **No fake purchases or ads, ever.** | Skin IDs in art keys (`age/unit/faction/skin`) |

---
