# WeAreStorm — Game Design Document (v1)

Status: **design baseline for v1**, assembled 2026-10-13 from the "Feel First" proposal (game design) with the "Visual Craft"
proposal's lane geometry, reconciled below. Revision 1.1 of the pack (2026-10-25) applies the lead's decisions after the critic review; the
gameplay numbers now match the code on `claude/m1b-sim` at `e1c84e6` (`src/data/*.ts`, `src/sim/battle.ts`, `src/meta/progress.ts`) and
are calibrated by the real harness (`docs/BALANCE.md` §4.7). Owner choices: **clean cartoon art everywhere** and **We Are
Warriors-style core loop first**, six Ages kept. Everything is original (names, art, text, code); WAW is a genre reference only.

## Reconciliation (authoritative where it differs from the sections below)

1. **Lane geometry (single source of truth for sim AND art).** 1 art unit = 1 world unit (wu). Player gate face at **x = 0**,
   enemy gate face at **x = 1000**. Player base footprint x ∈ [−260, 0]; enemy base mirrored at [1000, 1260]. Units spawn
   fully behind their own gate: player x = min(−20, −width/2), enemy x = max(1020, 1000 + width/2), so a new unit never
   overlaps a hostile standing at the gate. Sim body widths are the art's bounding width minus 4 wu, so clashing heads
   never overlap: **melee 60, ranged 52, tank 88, quadruped/vehicle 120** (Tusker, Knight, Landship), **Warlord 210**.
   Distances are **edge to edge**: `gap(a,b) = |xa − xb| − (wa + wb)/2`; the base edge is its gate face. Art heights:
   troop 150, tank 200, Warlord 380, base tower ≈ 520.
1b. **Camera and vertical layout.** `ptPerWu = clamp(viewportW / 1340, 0.27, 0.467)`; the camera is centred on x = 500 and
   the visible half-width is `viewportW / (2·ptPerWu)`. That gives x ∈ [−170, 1170] on phones (troops 42 pt at 375 wide,
   44 pt at 390, 48 pt at 430) and troops of 70 pt at 820, 1024 and landscape, where more world shows at the sides.
   Nothing ever stretches. `groundY = deckTop − clamp(0.10 × viewportH, 48, 120)` pt. Art and rig space is y-up-negative
   (the Canvas convention); the sim has no y.
   **Rank spread (presentation only, the sim is unaffected):** same-side units whose sim x is within 8 wu are ranked by
   id; `renderX = simX − rank × 16 wu` (ranks 0–2, then the cycle repeats); a depth band of ±30 wu offsets render y; units
   z-sort by render y. Background parallax layers are seamlessly tileable strips (period 1024 wu), so any width is covered.
2. **Stat conversion to that geometry.** The prototype ran on a 760-u front-to-front lane with centre distances; the
   §2.5/§3.2 tables below are already converted. Speeds × 1.3: melee 105, ranged 90, tank 65 wu/s; non-role speeds
   Voltblade 124, Landship 58, Titan 58, Knight charge 91 (65 × 1.4). The Warlord walks at 48 wu/s. Ranges are edge gaps:
   melee 12, tank 16 (Tusker and Knight 20), ranged 300 (Bolter 310, Bombardier 290, Pulse Ranger 320), Landship 80,
   Warlord slam reach 30 with slam radius 70 (measured from its body edge, so the telegraph ring is 70 + half its width).
   Areas × 1.3: Stormcall radius 104, Cleave 52, Bombardier splash 58, Landship splash 52, impact re-check slack 13.
   Projectile speed 680 wu/s (arc) / 1100 (bolt, bullet, beam). HP, DMG, costs and intervals are unchanged.
3. **One v1 special:** **Stormcall** (§2.12), built in M1. The per-Age "Storm Powers" in the art bible (§5.11 meteorRain …
   orbitalLance) are the **v1.2 Skills** roadmap; build only the Stormcall lightning VFX in v1.
4. **Canonical names** are this GDD's (Clubber, Slinger, Rockhide, …; Warlords Chief Grumbo …). Art-bible base names
   (Totem Camp, Sun Ziggurat, Banner Keep, Star Bastion, Iron Works, Aegis Spire) are the canonical base names. Art-bible
   rig variants map to troops: tank biped = Rockhide, Ironclad; quadruped = Tusker, the Knight's horse and Chief Grumbo's
   mammoth; vehicle = Landship; mech = Titan (OMEGA Core reuses the frame).
4b. **Background display names** are the art bible's (Dawnvale, Sunreach, Bannerhold, Powder Coast, Ironworks, Neon
   Frontier); data ids are `stone` … `future`.
5. **Age 3 is called "Medieval"** in UI copy and in the art bible (data id `medieval`).
6. **Flags/banners on bases:** owner decision (see `OWNER_DECISIONS.md`); default = a faction pennant on a free-standing
   pole behind the base (ART_BIBLE §5.9 composition grid). No cloth, banners or flags on architecture in any Age.
7. **UI framework:** Preact + @preact/signals for all DOM screens **and the battle HUD** (deck, Food panel, base bars,
   Stormcall ring, pause, speed), layered on top of the Pixi canvas (see `TECH.md`). The Pixi world draws only the lane,
   units, bases and effects. Per-frame card fills are written straight to CSS variables, never through a Preact render.
   Both layers read the same tokens. World-anchored overlays (coin flights, coach marks that point at a unit or base) get
   their screen position from the camera's world-to-screen function through `src/app/layoutRegistry.ts` (TECH §2).
8. **UI strings contain no emoji or arrows.** Every string in `src/data/strings.en.ts` must match
   `/^[\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2026\u2212]*$/` (printable ASCII, Latin-1, en and em dash, ellipsis, minus), checked
   by a Vitest test. Lilita One and Nunito have no emoji glyphs, and iOS would fall back to Apple Color Emoji. The bolt,
   skull, drumstick and arrows are kit SVG icons (ART_BIBLE §5.13).

---

## 0. TL;DR — the decisions that matter

1. **The whole lane is visible and the camera never scrolls.** One horizontal lane spans the screen width. Your base is at the left edge and the enemy base at the right. Troops are about 44 pt tall on a phone and 70 pt on iPad. Each fight lasts 3–6 s, so a player can read it at a glance.
2. **Battles have three phases and always end.** First an *authored assault*: a finite script whose window ends at 30–40 s. Then a light *trickle* of reinforcements, plus one *rally* when the enemy base drops below 50%. Then **"Storm Rising"** overtime from 100 s: both sides deal more damage over time, and from 120 s bases take double damage and the trickle stops. A 600 s hard stop counts as a defeat. The harness measures regular battles at P50 82 s / P99 131 s and Warlord battles at P50 116 s / P99 163 s; Storm Rising is reached in 25% of regular battles and 91% of Warlord battles.
3. **The fixed-step sim resolves all hits at once.** It runs at 20 Hz (50 ms ticks). Food is stored as integer milli-food. Each attack has a windup, then an impact, then recovery. All damage in a tick is applied together. The renderer interpolates between ticks and uses the same windup timing, so the strike animation lands on the same frame as the damage.
4. **Locked rules are kept exactly.** Food starts at 0 and Stone Age makes 1 Food/s. Stone troops cost 5/8/12. Kills give 1 Gold (normal) or 5 Gold (tank), plus base-damage Gold. You keep Gold when you lose. Gold only comes from campaign battles. There are six Ages, at most three troop cards, and a new player owns only the Stone melee troop.
5. **The campaign is 30 stages: 6 Ages × 5 stages.** Stage 5 of each Age is a **Warlord** boss. The Warlord shields its base with a *ward* until you kill it. Beating the Warlord makes Evolution **free**; before that, an early Evolve costs Gold (180 / 420 / 820 / 1,450 / 2,500), so saving up to evolve is a real Gold goal.
6. **Gold buys an "Age Camp".** Each Age has five tracks: Food rate, Base HP, and training for Melee, Ranged and Tank (Lv 1–10 each). The tracks **reset on Evolution**, so prices restart low every Age and the flat 1/5 kill Gold stays meaningful all game. Enemies scale by the same Age factor as your troops, so the evolution power spike comes from the stage instead: stage 1 of each new Age fields the *previous* Age's enemy roster (§3.5). Slot unlocks (Ranged 30 Gold, Tank 70 Gold) are bought once and are permanent.
7. **v1 has one special ability, "Stormcall".** It is a single on-brand lightning strike, available from Battle 4 once stage 3 is cleared, and it is built in M1. The full skills/cards/heroes/dungeons systems are designed (§3.7) but not built in v1.
8. **The art is "ShapeKit".** Every character, base and background is drawn by TypeScript painter recipes on Canvas2D `Path2D` (analytic anti-aliasing, `clip()` for the cel crescent), then baked into texture atlases at three resolution tiers (TECH §5). There are no Pixi Graphics bakes and no SVG output for art; DOM screens show static busts extracted from the same bakes. Icons are a separate SVG set (ART_BIBLE §5.13). Every shape gets the same bold ink outline through a "stroke-under" pass, uses flat fills with one shade and one highlight, and is built as a chibi rig animated in code.
9. **The stack is TypeScript, Vite, PixiJS v8 (battle and world), and Preact with Signals for the UI.** Signals update the HUD at about 10 Hz without re-rendering the whole tree. Sim and data are pure TypeScript, run under Node for the harness, and have lint rules that keep them deterministic.
10. **Two agents build in parallel with strict file ownership.** Agent **SYS** owns gameplay (`src/data`, `src/sim`, `src/meta`), `src/audio/**`, the harness and the configs. Agent **ART** owns `src/render/**` (art, anim, VFX, scenes, Pixi), `src/ui/**` and `src/app/battleController.ts`. They share frozen contracts in `src/contracts/`. A Stone Age vertical slice at final quality is the first gate, before any other Age is built.

---

## 1. Pillars, core loop, session flow, FTUE

### 1.1 Pillars

| # | Pillar | What it means in practice | How we test it |
|---|---|---|---|
| P1 | **Tap → Clash → Crumble** | Every tap gives visible feedback in the same frame, and a unit steps out within 250 ms. Every hit flashes; hits the player deals also show a number (§2.14). Every base falls with a big moment. | Input-latency e2e test; the polish checklist (ART_BIBLE §5.17) |
| P2 | **Always a next upgrade** | After at least 80% of battles in the first 30 minutes, the player can afford something. Numbers visibly go up. | Harness CI row "affordable after battle ≥ 80%" (measured 92%) |
| P3 | **Lose forward** | A defeat still pays Gold, and the defeat screen says what to upgrade. Each consecutive loss on the frontier stage weakens the next attempt (§2.11). There are no timers, no energy and no paywalls. | Harness CI: zero-Gold losses < 5%; Warlord-stage loss Gold P50 ≥ 20; consecutive losses P90 ≤ 3 |
| P4 | **Ages you can feel** | Each Evolution brings a new world, base, troops, music and sounds, much bigger numbers, and a ceremony. The first stage of the new Age is visibly easier (§3.5). | Evolution-spike assertion: stage 1 of each later Age has ≥ 85% first-attempt win rate, each ≥ 75% (measured 95%) |
| P5 | **One clean cartoon world** | One art bible and one UI kit cover everything, and everything is drawn in code. Bold outlines and bright flat colours look crisp at any DPR. | Screenshot matrix review; `npm run art:lint` (ART_BIBLE §5.16 step 5) |

### 1.2 Moment-to-moment loop (inside a battle)

```
 Food fills (visible meter + card fill) ──► Tap a card (choose WHAT + WHEN)
        ▲                                         │
        │                                         ▼
  Gold coins fly to counter ◄── Kill / hit base ◄── Units march, clash, trade hits
        │                                         │
        └──── Stormcall when charged (WHEN it matters) ◄───────┘
```

The player makes three real decisions in a battle:

1. **What to deploy.** Composition: a melee screen, ranged damage behind it, and a tank to soak hits.
2. **When to deploy.** Spend now or save. For example, hold food to drop a tank in front of an incoming wave. Food has no cap, so saving is always a valid choice.
3. **When to call the storm.** Clear a dangerous clump, hurt a Warlord, or rescue a collapsing front line. The strike aims itself at the biggest clump (§2.12), so the choice is timing.

Optional: toggle ×2 speed when you are confident.

**Battle rhythm.** Every stage script is written to follow this shape:

| Time | Phase | What the player feels |
|---|---|---|
| 0–10 s | Build-up | Food ticks up. The first unit goes out at 5 s. The enemy's first unit appears exactly at the assault start, 6–10 s. |
| 6–40 s | Assault | The authored waves arrive and the front line moves back and forth. A tank or the Age's signature unit appears. The window ends at 30 + 2·ageIdx s. |
| 30–60 s | Turning point | The script ends and the trickle starts, spending less than half the player's Lv 1 Food rate. The player's army builds up. Hitting the enemy base below 50% triggers the **rally**. |
| 60–100 s | Push & Crumble | The enemy base breaks. The game slows down, the camera punches in, and the base collapses. VICTORY. |
| 100 s+ | Storm Rising | The sky darkens, rain falls, and damage ramps up for both sides so stalemates cannot drag on (25% of regular battles get here; 91% of Warlord battles do). |

### 1.3 Between-battle loop (meta)

```
 Battle ─► Results (gold tally, 4–7 s, skippable) ─► Smart CTA
   ▲                                                    │
   │      ┌── "UPGRADE" (if something affordable) ──► Army screen (Camp upgrades / unlocks)
   │      └── "NEXT BATTLE" (if nothing affordable) ─────────────────┐
   │                                                                  │
   └──────────────── Hub (Battle N, stage pips, big BATTLE button) ◄──┘
        Warlord beaten ─► "EVOLVE!" (free) ─► Evolution ceremony ─► new Age Camp (Lv 1, cheap prices)
        (or, any time: Ages tab ─► early Evolve for Gold, §3.5)
```

* **One tap to the next fight.** From Results, the primary button is either *Upgrade* or *Next Battle*, whichever is more useful. From the Hub, *BATTLE* starts immediately: no loadout screen, no confirmation.
* **The Gold sinks are visible every time.** The Army tab shows a red badge with the number of affordable upgrades. The Ages tab shows a glowing badge when Evolve is ready.

### 1.4 Session flow

* A loop (battle, results, upgrade) takes about **105 s** at ×1 speed (an 82 s median regular battle plus about 22 s of results and menus) and about 65 s at ×2.
* A typical session is **5–15 minutes, or 3–8 battles**. Age boundaries (the Warlord, then Evolution) are natural stopping points.
* There is no energy, no timers and no daily gate in v1. Cold start to battle takes under 3 s on a mid phone. Resuming the app returns the player exactly where they were. A battle in progress auto-pauses when the app is hidden (§2.13).

### 1.5 The first 10 minutes (FTUE) — "teach by playing"

**Rule: every one of the first five battles introduces exactly one new thing.** Coaching comes from **Nimbus**, a small storm-cloud mascot drawn in code. Nimbus speaks in one-line bubbles that never block input and never pause the sim, except for the single optional "tap here" moment in Battle 1.

| Clock (approx.) | Beat | What happens | New thing |
|---|---|---|---|
| 0:00 | Title | Logo, "TAP TO PLAY". The first tap also unlocks audio. **No menus before the first battle.** | — |
| 0:05 | **Battle 1 "First Hunt"** | The deck shows only the **Clubber** card. Food starts at 0 and the card fills from the bottom. At 5 Food the card pops "READY", a hand pointer appears and Nimbus says *"Tap to send a Clubber!"* After the third deploy the coach disappears. The first enemy Clubber arrives at exactly 10 s, two more follow by 27 s, and after the assault one Clubber comes every 10 s. Enemies are weakened (×0.8). | Food, deploying, the lane |
| ≈0:45 | Victory | Slow-motion, camera punch and base collapse, then VICTORY with the Gold tally (≈ 35 Gold: 20 for base damage, a 12 victory bonus and the kills). The one button is "Continue". | Gold from kills and base damage |
| ≈1:10 | Hub, first visit | Nimbus: *"New recruit available!"* The Army tab pulses. The **Slinger unlock (30 Gold)** card pulses with a hand pointer. Buying it plays confetti and the card flips over. Nimbus: *"Back to battle!"* | Upgrades screen, unlocks |
| ≈1:40 | **Battle 2** | Two cards. One bubble: *"Slingers shoot from behind your Clubbers."* The enemy also fields slingers. | Ranged role |
| ≈3:00 | Results → Hub | Nimbus points at the item `recommendUpgrade()` picks (§3.6). On a fresh Stone Camp that is **Melee Lv 2 (12 Gold)**: *"Upgrades make every troop stronger!"* | Camp upgrades |
| ≈3:20 | **Battle 3** | The **×2 speed** button appears with a tooltip. | Speed-up |
| ≈4:40 | Results → Hub | The **Rockhide (tank) unlock, 70 Gold**, is usually affordable now or after Battle 4. If so, it is pointed out (unlocks come first in `recommendUpgrade()`). | Tank role |
| ≈5:10 | **Battle 4** | The **Stormcall** ring appears and charges (it unlocks once stage 3 is cleared). When it is full, a hand pointer and *"Call the storm!"* appear, then lightning hits, enemies scatter and coins burst out. At 30 s the enemy fields its first tank, an authored insert (§3.4). | Stormcall |
| ≈6:40 | **Battle 5 — WARLORD** | At 12 s: slow-motion, a banner reading "CHIEF GRUMBO APPROACHES!", a boss HP bar, and a shimmering ward on the enemy base. Nimbus: *"Beat the Warlord to break the ward!"* Hits on Grumbo pay Gold even while the ward holds (§2.11). | Bosses, ward |
| ≈8:00 | Win, or lose then retry | **Loss:** a calm DEFEAT screen: *"You keep 21 Gold — upgrade and try again!"* (a lost Warlord fight pays about 20–25 Gold; the harness measures P50 21). The primary button is UPGRADE, which teaches the lose, upgrade, retry loop, and the retry is 6% easier (§2.11). **Win:** "WARLORD DEFEATED", then a giant "EVOLVE!" button. | Losing forward |
| ≈9–13 min | **Evolution ceremony** | Storm clouds, lightning on the base, the troops transform, and the "ANCIENT AGE" title card slams in. | Ages |

The harness (`e1c84e6`, 30 casual campaigns, 22 s of overhead per battle) measures the first Evolution at **P50 11.7 min and P90 14.5 min**. The CI band is P50 8–14 min and P90 ≤ 18 min (BALANCE §4.7).

### 1.6 Deliberately not in v1

Cards, skill collections, Heroes, Dungeons, Gems, a shop, ads and IAP, daily rewards, accounts and cloud save. Each has a designed place (§3.7) so v1 layouts do not need rework later. The HUD reserves the space for the Hero ring and three skill rings, and the bottom nav reserves space for five tabs.

---

## 2. Battle rules

### 2.1 Coordinates and lane geometry

The numbers live in Reconciliation §1–1b; this is the summary.

* **World units (wu).** The sim is one-dimensional: every unit and base has an x and nothing else. Positions are stored as integer milli-wu.
* **Player gate face at x = 0, enemy gate face at x = 1000.** Units spawn fully behind their own gate (player x = min(−20, −width/2), enemy x = max(1020, 1000 + width/2)), so the marching distance between gate faces is 1000 wu. Distances are edge gaps between body widths (melee 60, ranged 52, tank 88, quadruped/vehicle 120, Warlord 210).
* **Rank spread and depth band (cosmetic only).** Same-side units within 8 wu of each other are drawn up to 3 ranks deep (16 wu apart), with a ±30 wu render-y depth band and z-sort by render y. This has **no gameplay effect**; it keeps a growing army readable.
* **Camera.** Static, centred on x = 500, with `ptPerWu = clamp(viewportW / 1340, 0.27, 0.467)`: troops are 44 pt tall at 390 pt wide and 70 pt on iPad. Wider screens show more world at the sides.
* **Ground line:** `groundY = deckTop − clamp(0.10 × viewportH, 48, 120)` pt. The space above is sky, where the storm and lightning happen.

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
* Tapping a card produces a `deploy(slot)` command, applied at the next tick boundary. If `food ≥ cost`, `queue < 4` and `fieldCount < 30`, the cost is deducted at once, the sim emits `deployQueued` (with `foodSpent`, which drives the "−5" float) and the unit joins the **spawn queue**. The base releases one queued unit every **5 ticks (250 ms)**, which streams units out in a satisfying column. Queued units show as small pips on the card.
* A failed tap (not enough food, queue full, army full, or a locked slot) emits `deployRejected` with that reason and makes the card do a small shake, play a soft "nope" sound and flash its cost. Nothing else happens.
* Card states: **Ready** (bright; pops once when it first becomes affordable), **Filling** (desaturated, with a fill rising from the bottom showing `food / cost`), **Queued** (pips), **Army full** ("MAX" tag at 30 units on field).

### 2.5 Units, roles and the stat model

There are three roles plus the **Warlord** boss.

| Role | Purpose | Stone stats (Lv 1): Cost · HP · DMG · Interval · Windup · Range (edge gap) · Speed | Kill Gold (enemy) |
|---|---|---|---|
| **Melee** | Cheap front line that trades evenly | 5 · 60 · 12 · 1.0 s · 0.35 s · 12 wu · 105 wu/s | 1 |
| **Ranged** | Damage from behind the line; fragile | 8 · 40 · 18 · 1.2 s · 0.40 s · 300 wu · 90 wu/s (projectile 680 wu/s) | 1 |
| **Tank** | Wall that soaks damage and hits hard | 12 · 260 · 22 · 1.5 s · 0.50 s · 16 wu · 65 wu/s | **5** |
| **Warlord** | Boss on stage 5 of each Age; telegraphed slam (area damage) | — · 4 × Tank HP × bossMult (Stone base 1,040) · **fixed** 1.92 × Tank DMG (Stone 42; slam radius 70 wu from its edge) · 2.6 s · **0.9 s telegraph** · 30 wu · 48 wu/s | 25 |

The Warlord's calibrated `bossMult` scales **HP only**. The slam is fixed at 1.92 × the Age's tank DMG, which is 96% of a Lv 2 ranged troop's HP in every Age (Stone: 42 against a Lv 2 Slinger's 44), so one ranged upgrade is the readable counter: Lv 1 Slingers die to a slam and Lv 2 Slingers survive it. When `bossMult` also scaled damage, a 0.3% change in it flipped 77% of outcomes because the slam crossed that breakpoint.

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
  * **Target** = the nearest hostile unit by edge gap that is within `range`. Ties go to the lower id.
  * Otherwise, the hostile **base**, if its gate face is within `range`.
  * Otherwise, no target.
* **ACT** runs in two passes, so the result never depends on the order of the unit list (a regression test replays every tick with the list reversed):
  * **Pass A:** every impact and every new attack start is resolved against the **start-of-tick positions**; nobody has moved yet. A unit that is mid-attack stays committed and does not move. A unit with a target and its cooldown at 0 starts an attack.
  * **Pass B:** every unit with no target moves forward `speed / 20` wu, clamped so it never passes the hostile gate face or a hostile unit's start-of-tick position.
  * Units **do not collide with allies**, so allies can share an x; the rank spread (Reconciliation §1b) keeps them readable. They **cannot pass enemies**, because they stop as soon as an enemy is in range.

Since the nearest hostile is always the front-most one, ranged units naturally shoot the front line and then the base.

### 2.7 Attack resolution

* **Attack cycle:** `windup` ticks, then an **IMPACT** tick, then `interval − windup` ticks of recovery. The sim emits `attackStart(id, target, impactTick)` so the renderer can time the anticipation pose and land the strike frame exactly on the impact tick. A Warlord's `attackStart` also carries `area {x, r}` for the slam telegraph ring.
* **Re-check at impact.** If the original target is still alive and within `range + 13 wu`, hit it. Otherwise hit the current nearest valid target in range, or the base if it is in reach. If there is none, the attack whiffs (`whiff` event): a VFX-only swoosh, and the full recovery still applies. This is forgiving: units rarely "waste" a swing, and it looks right.
* **Melee and slam** produce a damage event straight away.
* **Ranged** fires a homing projectile (`projectile` event with its own `projId`) with `flightTicks = max(2, round(dist / projSpeed × 20))`.
  * On arrival it hits if the target is still alive. Otherwise it fizzles (lands and puffs dust, VFX only). Either way the sim emits `projectileEnd {projId, x, result}`.
  * A **splash** projectile explodes at the target's current position, or its last known x, and hits every hostile within the radius (`projectileEnd` result `explode` with `r`). It hits the base too if the gate face is within the radius.
* **Damage applied** = `round(dmg × stormMult × (1 − armor))`, with a minimum of 1. HP is an integer.
* **Tick order (fixed):**
  1. Apply commands (a retreat ends the tick at once; commands after it in the same tick are ignored).
  2. Release the spawn queue.
  3. Enemy script spawns.
  4. Food.
  5. SENSE.
  6. ACT pass A: impacts produce damage events and new attacks start, all against start-of-tick positions.
  7. ACT pass B: free units move.
  8. Projectile arrivals and the Stormcall strike produce damage events.
  9. **APPLY all damage events at once.**
  10. Remove deaths together and grant rewards.
  11. Base state, ward and Warlord Gold, rally checks.
  12. Win/lose check.

  Two units that hit each other in the same tick both take damage and can both die, regardless of processing order.
* If **both bases fall in the same tick, the player wins** (generous by design; the result is victory).
* There is **no knockback in the sim**. Recoil is visual only (a 6 wu recoil on heavy hits, ART_BIBLE §5.8), so positions stay simple and deterministic.

### 2.8 Bases

* **Player base HP** = Age base HP × (1 + 0.15 × (BaseLv − 1)). Age base HP: Stone 400, Ancient 880, Medieval 1,920, Gunpowder 4,200, Industrial 9,200, Future 20,000.
* **Enemy base HP** = Age base HP × `ENEMY_BASE_SHARE` (0.8) × (1 + 0.1 × stageIdx), and × 1.25 on Warlord stages. stageIdx runs 0–4. Stone values: 320 / 352 / 384 / 416 / 560. The final push is the payoff of a won battle, so it is kept short; base Gold is still per 5%.
* **Bases are passive in v1** (no turrets). This keeps the fighting in the middle of the lane. A "Base Cannon" upgrade is a possible later sink.
* **Damage states** (visual): Intact > 66%, Cracked 66–33%, Burning < 33%, then a collapse sequence at 0 (ART_BIBLE §5.9).
* **Warlord ward.** On Warlord stages the enemy base is invulnerable until the Warlord dies. It shows a pulsing red hex bubble, and hits on it produce "ting" sparks and no numbers (the `hit` event carries `blocked: 'ward'` and amount 0). When the Warlord dies the ward **shatters** and a "WARD BROKEN!" toast appears. While the ward holds, damage to the Warlord pays Gold instead of base damage (§2.11).

### 2.9 Enemy spawning — authored, finite and calibrated

Each stage is a data record (`StageDef` in `src/data/stages.ts`, TECH §3). Stage-local indices are 0-based (§3.1).

* **Assault window** `[assaultStartSec, 30 + 2·ageIdx]` s. `assaultStartSec` is 10 on Battle 1 and `6 + stageIdx` on every other stage. A **budget rate** `E` (a multiple of the player's Lv 1 Food rate for the stage's Age) is spent following a **pattern string** such as `"mmrmt"`. The generator expands this into exact spawn ticks when the stage loads: virtual Food accrues at E × rate, and the next unit in the pattern is bought when affordable. Virtual Food **starts holding the first pattern unit's cost**, so the first enemy lands exactly at the window start (Battle 1: 10.0 s, tick 200). The output is deterministic and is checked by golden tests.
* **Pattern tokens.** `m`, `r` and `t` are the melee, ranged and tank of the stage's `enemyAge` roster; `M` is the stage Age's own melee. `enemyAge` is the stage's Age everywhere except stage 1 of each later Age (§3.4, §3.5).
* **Inserts.** Authored set pieces added on top of the budget, so a calibrator change to E can never delete them: stage 4 one Rockhide at 30 s; stage 8 two tanks at 28 s; stage 12 one tank at 25 s; stages 17 and 22 two ranged at 25 s.
* **Trickle.** After the assault ends, the enemy cycles the stage pattern with tanks removed, spending `TRICKLE_SHARE = 0.45` × the stage Age's Lv 1 Food rate, with at least 4 s between units (Stone stage 3: one unit about every 14 s). The share is independent of E, so after the assault the player always out-produces the enemy. Battle 1: one Clubber every 10 s, never a Slinger. The trickle stops when bases start taking double damage (120 s).
* **Rally.** Once, when enemy base HP first drops below 50%, a pack of `min(4, 1 + stageIdx)` units spawns at once (none in Battle 1) with a horn sound and an "ENEMY RALLY!" toast. The pack is capped by the 30-unit enemy field limit (the `rally` event reports the real size), never spawns on the tick the enemy base falls, and is staggered outward behind the gate (+30 wu per rank, three ranks).
* **Warlord.** Spawns at 12 s on stage 5 of each Age (OMEGA Core at 10 s), with an intro banner (UX §3) and the `warlordIntro` clip (ART_BIBLE §5.8).
* **Enemy field cap: 30.** Enemy units use the `enemyAge` roster at Lv 1 × the stage stat multiplier: 0.8 on Battle 1, otherwise 1.0. The lose-forward assist (§2.11) and later Timelines (§3.7) multiply further.

The authored part is finite and the trickle spends less than half of a Lv 1 player's Food rate, so **a player who keeps deploying always wins eventually**. The old repo had endless 3.5 s spawns that a 1 Food/s player could not beat; this structure cannot repeat that. The rally and Storm Rising prevent "dead" endings and stalemates. **The assault stays one continuous stream.** Wave-based assaults (three separate waves) were tried and rejected: battles got longer and distracted players did no better (BALANCE §4.9).

### 2.10 Overtime — "Storm Rising" (anti-stalemate, on-brand)

* From **100 s**, all damage is multiplied by **(1 + 0.2·k)**, where k = 1 + floor((t − 100 s) / 10 s). So ×1.2 at 100 s, ×1.4 at 110 s, and so on.
* From **120 s**, bases take **×2** damage and the enemy trickle stops.
* At **600 s** the battle hard-stops and counts as a defeat. This is a safety stop, far beyond the measured P99.
* Presentation: the sky darkens in steps, rain starts, thunder rolls, and a small "STORM RISING 1/2/3" chip with the kit bolt icon appears under the stage chip. The rule is symmetric. It makes long battles dramatic instead of dull. The harness measures it in 25% of regular-stage battles and 91% of Warlord battles: the storm is meant to rise during boss fights and stay special elsewhere. Regular battles end at P99 131 s (CI bar ≤ 160 s) and Warlord battles at P99 163 s (bar ≤ 190 s).

### 2.11 Win, lose, retreat and rewards

* **Victory:** enemy base HP ≤ 0 (also when both bases fall on the same tick). **Defeat:** player base HP ≤ 0, or the 600 s hard stop. **Retreat** (pause menu, with a confirm) is its own result, `'retreat'`: Gold earned is kept, no bonus is paid, there is no progress, and it counts as a loss for the assist.
* **Gold earned during the battle is always kept** (locked rule):
  * **Kills:** 1 Gold per normal kill, 5 per tank, 25 per Warlord.
  * **Base damage:** +1 Gold for each full 5% of enemy base max HP removed, up to 20.
  * **Warlord ward Gold:** while the ward is up, damage to the Warlord pays instead: +1 Gold per full 5% of the Warlord's max HP removed (max 20; killing it pays any of the 20 not yet paid), plus the 25 kill Gold. After the ward breaks, base damage pays the normal +1 per 5% (max 20). A lost Warlord fight therefore still pays about 20–25 Gold (harness P50 21).
  * **Victory bonus (first clear only):** regular stages **12 + 4·stageIdx + 3·ageIdx**; Warlord stages **40 + 15·ageIdx** (Stone 40, Future 115). Replays pay 50% (rounded down). **The campaign is played in order:** only the frontier stage (or a retry of it) can be started; earlier stages cannot be replayed for Gold. Once stage 30 is cleared, the Future stages 26–30 open as replays (§3.4); Storm Surge adds more (§3.7).
* **Lose-forward assist.** Each consecutive loss (or retreat) on the current frontier stage takes 6% off the enemy's HP and DMG **and** 6% off its assault budget, capped at 30% (five losses). It resets on a win and applies only on the frontier stage, never on replays.
* **Settlement is atomic** and keyed by `battleId`, so it is idempotent: the last 16 battle ids are remembered, a non-finite or negative Gold or duration counts as 0, and a stage the player has not reached is refused (TECH §6). A battle in progress writes a checkpoint of earned Gold every 5 s. If the app is killed, the next launch settles it as a retreat with that Gold. A crash never costs progress.

### 2.12 Stormcall (the one v1 special)

* **Unlocks** once stage 3 is cleared, so it is available from Battle 4. It is a 64-pt ring button straddling the deck's top edge at the right margin (UX §3).
* **Charge:** starts empty and is first ready at 25 s. The cooldown after each strike is 30 s. The ring fills clockwise and pulses plus chimes when full (`stormcallCharged`).
* **Use:** one tap, **auto-aimed at the x that catches the most hostiles within the radius** (the Warlord counts as 3; ties go to the point nearer the player base). The candidate centres are each hostile's x and x + radius, so the strike can centre on a clump instead of its lead unit. With no hostile on the lane the tap does nothing but emit `stormcallNoTarget`: the ring stays charged and shakes. Otherwise the tap starts a 0.5 s gather (clouds build, ground marker): the sim emits `stormcallCast {x, radius, strikeTick}`, then strikes **once** (`stormcallStrike`):
  * Every hostile unit within 104 wu of that x (plus half its body width) takes **2 × the army Age's Lv 1 melee HP** (2 × 60 × A): 120 in Stone, enough to kill a melee or ranged Lv 1 unit and to half-kill a tank.
  * The Warlord takes **50% of that damage** (60 in Stone, about 3% of Chief Grumbo's 1,876 HP at the calibrated `bossMult` 1.804).
  * Bases are immune.
  * Visually it is three bolts over 0.4 s; the damage is a single impact event.
* No upgrades in v1; it scales with Army Age. If it is not unlocked, no ring is shown. The casual and average harness bots tap it when the aim would catch a weight of at least 3.
* **Why it is in v1:** lane battlers can feel passive when Food is low. One dramatic, readable, comeback-capable button adds a "clutch" moment every 30 s. It is **built in M1** (sim in 1B, ring and VFX in 1C/1D, juice in 1E; BUILD_PLAN) and is not behind a feature flag.

### 2.13 Speed-up and pause

* **×2 speed** unlocks at Battle 3. The toggle is in the top-right of the HUD, and the choice is remembered. ×2 doubles the ticks per real second, so outcomes are identical; this is tested.
* **Pause:** a top-right button or `visibilitychange`/`blur` (auto-pause). It opens a sheet with the stage name, **Resume**, **Retreat** (confirm: "You keep your 23 Gold"), **Sound**, **Music**, **Haptics** (hidden when `!('vibrate' in navigator)`, as on iOS Safari) and **Reduce Motion**. The sim stops and so does food; the presentation clock freezes. On resume there is a 0.5 s fade back in with no lost input.

### 2.14 Gameplay-side readability rules

* At most 30 units per side, and the rank spread (Reconciliation §1b) staggers allies that share an x, so the lane never turns into mud.
* Role silhouettes must differ: melee is medium-width and upright, ranged is lanky with a long weapon or bow, the tank is wide and about 1.35× taller (200 wu against 150), and the Warlord is about 2.5× taller (380 wu).
* Faction colour covers at least 20% of each unit's silhouette (blue for the player, red for the enemy); `npm run art:lint` measures it (ART_BIBLE §5.16). Facing direction gives a second cue, and enemy faces have angry brows as a third.
* A unit's HP bar appears only after it takes damage and fades out 2 s after the last hit. Enemy base and Warlord bars are always visible.
* Damage numbers appear **only for damage dealt by the player** (to enemy units and the enemy base). Hits on the same target within 150 ms are merged into one number, and at most 12 numbers are alive at once (the oldest is recycled). This keeps the screen readable and makes the player feel powerful.
* Every Warlord slam has a red ground ring telegraph (`attackStart.area` / `slamTelegraph`, radius 70 + half its width) that grows over its 0.9 s windup.

---

## 3. Content

### 3.1 The six Ages

**Indices.** `ageIdx` ∈ 0..5 is the Age's 0-based index (Stone = 0, Future = 5) and `stageIdx` ∈ 0..4 is the stage's 0-based index inside its Age (the Warlord is stageIdx 4). Every formula in this pack uses these two; "stage n" and "Battle N" are the 1-based campaign numbers (1–30) shown to the player.

| ageIdx | Age (data id) | World mood (background) | Base | Music mood | Warlord (stage 5) | Signature trait unit |
|---|---|---|---|---|---|---|
| 0 | **Stone** (`stone`) | "Dawnvale": green hills, snowy peaks, a far volcano, sun | Totem Camp: hide-and-timber hut, palisade stakes, totem pole | Bouncy marimba and log drums, 112 bpm, major | **Chief Grumbo** on a woolly mammoth | — (learn the basics) |
| 1 | **Ancient** (`ancient`) | "Sunreach": sea, mesas, temple ruins, cypress | Sun Ziggurat: stepped sandstone, columned gate, braziers | Lyre-like pluck, frame drum, 104 bpm, Dorian | **The Bronze Colossus** | Tusker: *Cleave* |
| 2 | **Medieval** (`medieval`) | "Bannerhold": castles, forests, fields | Banner Keep: stone keep, conical tile roof, portcullis gate | Fife plus snare march, 120 bpm, Mixolydian | **Baron Blackmace** | Knight: *Charge* |
| 3 | **Gunpowder** (`gunpowder`) | "Powder Coast": sunset sea, ships, cliffs, windmill | Star Bastion: angled brick bastion, cannon ports | Accordion-ish squeeze plus "boom" drum, 6/8 shanty, 116 bpm | **Admiral Kaboom** | Bombardier: *Splash*; Ironclad: *Armor* |
| 4 | **Industrial** (`industrial`) | "Ironworks": hazy amber skyline, chimneys, rails | Iron Works: brick factory, riveted gate, smokestacks | Clanky percussion, brass stabs, 124 bpm | **The Iron Juggernaut** | Gunner: *Rapid*; Landship: *Splash* |
| 5 | **Future** (`future`) | "Neon Frontier": dark violet sky, towers, holo-arches | Aegis Spire: white curved tower, floating ring, shield dome | Synth arps, side-chained pad, 128 bpm | **OMEGA Core** | Pulse Ranger: *Pierce*; Titan: *Armor* |

The player's faction is **Storm**: blue with a gold lightning crest. The enemy is **Ember**: red with a dark flame crest. Both factions exist in every Age and are rival clans through history.

### 3.2 Troops (18) and Warlords (6)

Stats are Lv 1. **Cost** is Food. HP/DMG = base role stats × Age factor × trait modifier. Range is the edge gap in wu and Speed is wu/s, both converted to the reconciled lane (Reconciliation §2); the values match `src/data/units.ts`.

| Age | Slot | Name | Role | Cost | HP | DMG | Interval | Range | Speed | Trait | Visual concept |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Stone | Melee | **Clubber** | Melee | 5 | 60 | 12 | 1.0 s | 12 | 105 | — | Stocky caveman, faction-coloured spotted hide tunic, huge bone club, messy hair tuft |
| Stone | Ranged | **Slinger** | Ranged | 8 | 40 | 18 | 1.2 s | 300 | 90 | — | Lanky kid with a headband, spins a sling overhead; pebble projectile with a small trail |
| Stone | Tank | **Rockhide** | Tank | 12 | 260 | 22 | 1.5 s | 16 | 65 | — | Big round brute in a mammoth-fur cape, flat stone slab shield, rock hammer; ground thump on hit |
| Ancient | Melee | **Hoplite** | Melee | 8 | 132 | 26 | 1.0 s | 12 | 105 | — | Bronze crested helmet (crest = faction colour), round shield with crest emblem, short spear |
| Ancient | Ranged | **Javelineer** | Ranged | 13 | 88 | 40 | 1.2 s | 300 | 90 | — | Light tunic, laurel, throws javelins on a high arc |
| Ancient | Tank | **Tusker** | Tank | 19 | 572 | 41 | 1.5 s | 20 | 65 | **Cleave 52 wu** (DMG ×0.85) | Small cartoon war elephant with a faction-coloured saddle cloth and a tiny rider; trunk swipe |
| Medieval | Melee | **Footman** | Melee | 12 | 288 | 58 | 1.0 s | 12 | 105 | — | Kettle helm, faction tabard, kite shield, sword |
| Medieval | Ranged | **Bolter** | Ranged | 19 | 192 | 86 | 1.2 s | 310 | 90 | — | Crossbowman with a padded gambeson and a big crossbow; fast flat bolts |
| Medieval | Tank | **Knight** | Tank | 29 | 1,248 | 106 | 1.5 s | 20 | 65 (91 until first contact) | **Charge** (first hit ×2.5) | Barded horse with faction caparison, knight with plumed great helm and lance; dust trail on charge |
| Gunpowder | Melee | **Corsair** | Melee | 17 | 630 | 126 | 1.0 s | 12 | 105 | — | Bandana, striped shirt in faction colour, cutlass, peg-leg optional (variety toggle) |
| Gunpowder | Ranged | **Bombardier** | Ranged | 27 | 420 | 132 | 1.3 s | 290 | 90 | **Splash 58 wu** (DMG ×0.7, arcing) | Tricorn hat, lobs round fuse bombs; big cartoon explosion |
| Gunpowder | Tank | **Ironclad** | Tank | 41 | 2,457 | 231 | 1.5 s | 16 | 65 | **Armor 25%** (HP ×0.9) | Giant sailor in a steel cuirass swinging a ship's anchor |
| Industrial | Melee | **Trencher** | Melee | 23 | 1,380 | 276 | 1.0 s | 12 | 105 | — | Brodie helmet, goggles, faction scarf, trench shovel |
| Industrial | Ranged | **Gunner** | Ranged | 37 | 920 | 138 ×3 | 0.4 s per shot | 300 | 90 | **Rapid** (3 shots per 1.2 s cycle) | Lying-prone feel is avoided: stands with a tripod gun; tracer lines and muzzle flashes |
| Industrial | Tank | **Landship** | Tank | 55 | 5,980 | 405 | 1.6 s | 80 | 58 | **Splash 52 wu** (DMG ×0.8) | Rhomboid tracked tank with a faction stripe and a stubby cannon; recoil and smoke ring |
| Future | Melee | **Voltblade** | Melee | 30 | 3,000 | 600 | 0.9 s | 12 | 124 | — | Sleek android with a visor, energy sword glowing faction cyan-blue or red |
| Future | Ranged | **Pulse Ranger** | Ranged | 48 | 2,000 | 720 | 1.2 s | 320 | 90 | **Pierce 2** (DMG ×0.8) | Hover boots, long rifle; beam goes through the first two targets |
| Future | Tank | **Titan** | Tank | 72 | 11,700 | 1,100 | 1.5 s | 16 | 58 | **Armor 30%** (HP ×0.9) | Chunky bipedal mech with a hex energy shield on its forearm |

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
| `slam(r)` | Warlord only: area impact on every hostile whose edge gap to the Warlord is ≤ r (r = 70 wu), plus the base if in reach | Telegraph ring and shockwave |

Enemy units of the same Age have the same traits; the game is symmetric. Every trait has unit tests and a harness ablation run (trait on/off) to confirm it is neither useless nor dominant.

### 3.4 Campaign: 30 stages

* **Stage n belongs to ageIdx ⌊(n − 1) / 5⌋ with stageIdx (n − 1) mod 5.** Stages 5, 10, … 30 are the Warlords.
* The Hub shows **"Battle N"** with a subtitle and five pips for the current Age (the fifth is the kit skull icon).
* **Stage 1 of every later Age (stages 6, 11, 16, 21, 26) fields the previous Age's roster** (`enemyAge`) with pattern `mmrmtM`: one melee of the new Age per cycle. The enemy base is the new Age's. This is the evolution power spike (§3.5).

| # | Age | Title | Enemy pattern (assault) | Seed E* | Calibrated (`e1c84e6`)† | Notes / new thing |
|---|---|---|---|---|---|---|
| 1 | Stone | First Hunt | `m` | **0.6, pinned** (enemy ×0.8, assault window 10–30 s, trickle one Clubber every 10 s, no rally) | not calibrated | Tutorial win; lazy and slow-tapper bots must win ≥ 98% |
| 2 | Stone | Sling Ridge | `mmr` | 0.85 | E 1.023 | Enemy slingers |
| 3 | Stone | Boulder Pass | `mmrmr` | 0.75 | E 1.203 | ×2 speed unlocked |
| 4 | Stone | Rockhide Rumble | `mmrtmr` | 0.80 | E 2.575 | First enemy tank. **Insert: one Rockhide at 30 s.** Stormcall available (stage 3 cleared) |
| 5 | Stone | **WARLORD: Chief Grumbo** | `mmrmr` + Warlord at 12 s | 0.30 | bossMult 1.804 | Ward, boss bar, ward Gold |
| 6 | Ancient | Bronze Dawn | `mmrmtM`, Stone roster | 1.2 | E 3.476 | Evolution showcase; must feel easy (≥ 85% first try) |
| 7 | Ancient | Javelin Shore | `mrmrt` | 1.15 | E 2.803 | Javelin arcs |
| 8 | Ancient | Temple Steps | `mmrtr` | 1.20 | E 2.727 | Insert: two Tuskers at 28 s (Cleave lesson) |
| 9 | Ancient | Tusker Trail | `mrtmrt` | 1.20 | E 3.249 | |
| 10 | Ancient | **WARLORD: Bronze Colossus** | `mmrmr` + Warlord at 12 s | 0.35 | bossMult 3.196 | |
| 11–15 | Medieval | Banner Hill · Bolt Woods · Moat Crossing · Lance Charge · **WARLORD: Baron Blackmace** | same stageIdx pattern set (stage 11 uses the Ancient roster) | 1.2 · 1.15 · 1.20 · 1.20 · 0.35 | E 3.022 · 1.704 · 3.031 · 3.306 · bossMult 3.358 | Insert on stage 12: one Knight at 25 s (Charge lesson) |
| 16–20 | Gunpowder | Powder Bay · Bomb Bluff · Corsair Cove · Anchor's Edge · **WARLORD: Admiral Kaboom** | ″ (stage 16: Medieval roster) | ″ | E 2.832 · 1.61 · 2.974 · 3.088 · bossMult 2.962 | Insert on stage 17: two Bombardiers at 25 s (teaches "don't clump", read via explosions) |
| 21–25 | Industrial | Smoke Yard · Rail Junction · Gear Works · Landship Ridge · **WARLORD: Iron Juggernaut** | ″ (stage 21: Gunpowder roster) | ″ | E 3.713 · 1.363 · 2.879 · 3.268 · bossMult 4.075 | Insert on stage 22: two Gunners at 25 s (gunner nest) |
| 26–30 | Future | Neon Outskirts · Pulse Plaza · Arc Bridge · Titan Foundry · **WARLORD: OMEGA Core** | ″ (stage 26: Industrial roster) | ″ | E 4.291 · 2.301 · 2.547 · 2.927 · bossMult 3.519 | Final stage: OMEGA Core spawns at 10 s |

\*E is a multiple of the player's Lv 1 Food rate for the stage's Age, spent during the assault window `[assaultStartSec, 30 + 2·ageIdx]` s, where `assaultStartSec` is 10 on Battle 1 and `6 + stageIdx` elsewhere (§2.9). Seeds live in `src/data/stages.ts`. Inserts are authored and are never removed by calibration.

†The calibrator (BALANCE §4.7) writes `src/data/stages.calibrated.json`, which overrides the seed. It moves exactly one knob per stage: E on regular stages, the Warlord HP multiplier `bossMult` on Warlord stages (where E stays at its seed). Its population is the `average` cohort (a typical player, 1–3 s reactions). The values are its output at `e1c84e6`, not hand-tuned.

**After OMEGA Core.** The Hub shows "CAMPAIGN COMPLETE". The BATTLE button opens a stage picker for the Future stages 26–30 (the only replays `canPlayStage` allows) (replays pay 50% of the victory bonus; kill and base Gold as normal) plus a "Storm Surge — coming soon" card (§3.7). There is no dead end.

### 3.5 Evolution rules

* **Where and when:** Evolve is on the Ages tab at any time. It is also the primary call to action on the Warlord victory screen and the Hub once the Warlord is beaten. Winning never evolves silently.
* **Price:** **free** once the army Age's Warlord is beaten. Before that, an **early Evolve** costs Gold: 180 / 420 / 820 / 1,450 / 2,500 out of Stone / Ancient / Medieval / Gunpowder / Industrial (`EVOLVE_PRICE` in `src/data/economy.ts`).
* **Limits:** the army may lead the campaign frontier by at most one Age. An early Evolve keeps `campaignStage`: the old Age's remaining stages, including its Warlord, are fought with the new army and still pay their first-clear bonuses. **Next-Age battles cannot start until you Evolve**; by then Evolve is free.
* **Effects** (the same for a free and an early Evolve):
  * `armyAge + 1`.
  * The Camp tracks (Food, Base, Melee, Ranged, Tank) reset to Lv 1 in the new Age.
  * Owned slots carry over: if you owned Ranged in Stone, you own Javelineer now.
  * The base, roster, Food rate and costs switch to the new Age.
  * **Gold is kept** (minus the price of an early Evolve).
* **Where the evolution spike comes from.** Enemy stats scale by the same Age factor A as the player's, so a like-for-like stage could never feel stronger after an Evolve: a Hoplite with 132 HP would meet an enemy Hoplite with 132 HP. Instead, **stage 1 of each later Age fields the previous Age's roster** (pattern `mmrmtM`, with one new-Age melee per cycle), against the new Age's base. The freshly evolved army, with Camp levels reset, meets enemies a full Age behind it. Cheap new prices and the Gold carried over from the Warlord fight let the player buy several upgrades at once. The harness asserts that stage 1 of each later Age has ≥ 85% first-try wins overall and ≥ 75% each (measured 95%).
* **Data model:** `armyAge` and `campaignStage` are stored separately. After an early Evolve the army is one Age ahead of the frontier; after a Warlord win it is one Age behind until the player taps EVOLVE!. `src/meta/progress.ts` (`canPlayStage`, `evolvePrice`, `mustEvolve`) enforces the ±1 limit and the in-order campaign (only the frontier stage until the campaign is complete), and Storm Surge and Dungeons later use the same split.

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

**Price** = `round(p0 × ageMult × 1.3^(Lv − 1))` with `ageMult = 1 + 0.25·ageIdx`, giving 1.0, 1.25, 1.5, 1.75, 2.0, 2.25.

**Early Evolve** (Ages tab, §3.5) is the third Gold sink: 180 / 420 / 820 / 1,450 / 2,500 Gold before the army Age's Warlord is beaten, free after.

**"Buy this next" rule.** `recommendUpgrade(save)` in `src/meta/progress.ts` is the single rule behind the Results Upgrade button, the defeat tip, the Coach and the lazy and slow-tapper harness bots. In order: a free Evolve when one is required; else unlock Ranged, then Tank, if affordable; else the cheapest affordable Camp upgrade, with Food weighted 20% cheaper. It returns only items the player can afford right now, or nothing.

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
| **v1.1** | **Storm Surge (prestige / Timelines)** | After the OMEGA Core falls with a Future army you may Surge: back to Stone, Camp reset, slot unlocks kept, `timeline + 1`. Enemies get ×1.35^(T−1) HP/DMG and a rotating modifier (Swift / Fortified / Frenzy). Each Surge grants **Storm Shards** (a new permanent currency, never Gold) and a permanent +10% Gold gain (capped). Cleared stages become replayable at 50% bonus. | `timeline` in the save and `SimInput`; the sim's ×1.35^(T−1) timeline multiplier; the `clearedStages` ledger and the 50% replay bonus in settlement |
| v1.2 | **Skills** | Stormcall becomes skill slot 1; two more slots. Candidates: Rally Horn (+30% DMG for 6 s, refresh never stacks), Frost Snap (slow 40% for 4 s; Warlords 50% resistant), Meteor (delayed big area damage). Upgraded with Shards using **bounded curves** (asymptotic duration, see the old doc's lessons). | Ring space above the deck (UX §3); an `abilities[]` field joins `SimInput` with this release (not in the v1 contract) |
| v1.3 | **Cards** | Permanent passive collection (+Food %, +HP %, +Gold %, +Base %), levelled with duplicates. Sources are Dungeons and Surge milestones only. Disclosed odds and **hard pity**. No Gold sources (locked). | A `globalMods` multiplier input joins the stat calc with this release (not in the v1 contract) |
| v1.4 | **Heroes** | One Hero ring: deploy once per battle, a unique Warlord-scale unit per Age family. The first Hero is granted on the first Storm Surge. | Hero ring position (left end of the deck's top edge, hidden in v1); a `deployHero` command joins the contract with this release (not in the v1 contract) |
| v1.5 | **Dungeons** | Rush (survive 45 s), Boss Gauntlet, Survival (carried base HP with cash-out). They reward Shards and Cards, **never Gold**, and use Keys. | Bottom nav has 5 positions, 3 used in v1 |
| later | Cosmetics / monetisation | Base skins, troop skins, Nimbus outfits. Real store integration only through Capacitor billing after validation. **No fake purchases or ads, ever.** | Skin IDs in art keys (`age/unit/faction/skin`) |

---
