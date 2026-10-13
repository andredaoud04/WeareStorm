# WeAreStorm — Screens & UX (v1)

Portrait only. Reference canvas **390 × 844 pt** (iPhone 14). Must also be flawless at **375 × 667** (iPhone SE),
**430 × 932** (Pro Max), **820 × 1180** and **1024 × 1366** (iPad portrait). Landscape on tablets shows the same portrait
layout centred with world art extending to the sides (no letterbox bars on the battle; menus centre at max 560 pt wide).
All visual rules come from `ART_BIBLE.md` (tokens, kit, motion). Copy tone: short, playful, Title Case buttons,
UPPERCASE banners, never more than ~8 words on a main screen.

## 0. Global rules

- **Layout model.** The world (Pixi canvas) fills the whole screen. DOM UI layers sit on top inside the safe-area insets
  (`env(safe-area-inset-*)`). No document scrolling anywhere; only lists inside sheets scroll. Layout reflows to the real
  viewport (not a scaled fixed artboard), using pt-based tokens with a single `uiScale = clamp(viewportWidth / 390, 0.92, 1.35)`
  so text and targets stay physically sensible on iPad.
- **Touch targets** ≥ 48 pt (deck cards 84 × 120, buttons M 52 tall). Spacing between tappables ≥ 8 pt.
- **Input latency:** pressed state on `pointerdown` in the same frame; action on `pointerup` inside the target; deck cards
  act on `pointerdown` (battle needs speed). Multi-touch allowed on the deck.
- **Audio unlock** on first user gesture (title tap).
- **Auto-pause** on `visibilitychange`/`blur` during battle.
- **No dead ends:** every screen has one obvious primary action.

## 1. Boot / Title (cold start ≤ 2.5 s on fast 4G)

- Sky gradient of the current Army Age + logo "WE ARE STORM" (Lilita One, ink stroke, lightning bolt in the A) with a
  gentle idle bob; Nimbus mascot peeks from behind the logo.
- Progress bar while fonts load and textures bake (bake ≤ 400 ms); then "TAP TO PLAY" breathes.
- First launch: tap → straight into Battle 1 (no menus before the first battle — GDD FTUE).

## 2. Hub (home, "Battle" tab) — 390 × 844 layout

```
┌──────────────────────────────── safe top ───┐
│ [Gold pill]                  [⚙ settings]   │  y 8–52   top bar (no gems/keys in v1)
│                                             │
│        AGE TITLE CHIP  "STONE AGE"          │  y 64
│        Stage pips  ● ● ● ○ 💀               │  y 96
│                                             │
│   ── live diorama: your base (left), the    │  y 120–600  Pixi world scene of current Age:
│      current enemy base (right), idle       │  your troops idling/cheering near your base,
│      troops, ambient life, Nimbus ──        │  enemy silhouettes at right
│                                             │
│        ┌───────────────────────────┐        │
│        │   ⚔  BATTLE 7             │        │  y 640–712  primary CTA (Button L, blue, breathe)
│        └───────────────────────────┘        │  subtitle under it: stage name, "WARLORD!" on boss
│  [EVOLVE! banner when available]            │  replaces CTA styling with purple + bolt when ready
├─────────────────────────────────────────────┤
│  ARMY(●3)      BATTLE        AGES(⚡)        │  tab bar 72 + safe bottom (3 tabs used, 5 reserved)
└──────────────────────────────── safe bottom ┘
```

- Tabs v1: **Army** (upgrades/unlocks), **Battle** (hub, centre, larger), **Ages** (evolution track). Two reserved
  positions (Cards, Dungeons) are not rendered in v1; the bar layout is a 5-slot grid with 3 centred items.
- Badges: Army shows count of affordable upgrades; Ages glows when Evolve is ready.
- Gold pill bumps and counts up whenever Gold changes.

## 3. Battle HUD — 390 × 844

```
┌──────────────────────────────── safe top ───┐
│ [⏸]  [Gold +23]   BATTLE 7 · Boulder Pass   [×2] │ y 8–52: pause (48), battle Gold (pill), stage chip, speed
│ [Your base HP ████████░░]  [░░████████ Enemy] │ y 60–84: two base bars, inset toward centre
│                                             │
│  sky (storm/Stormcall lightning lives here) │
│                                             │
│  ── lane: bases at screen edges, units ──   │ ground line at ~62% of screen height on phones
│                                             │
├────────────── deck (night-900 panel) ───────┤ deck height 196 pt + safe bottom
│  (◯ Hero — reserved, hidden v1)   ◯Stormcall │ row A, 64-pt rings; Stormcall ring at right
│  [🍗 23  +1.2/s ]  [Card M][Card R][Card T]  │ row B: Food panel left (big number), 3 cards
└──────────────────────────────── safe bottom ┘
```

- **Deck cards** (84 × 120): live unit bust, cost chip, fill-from-bottom while filling, "READY" pop once, queued pips,
  "MAX" at army cap, shake + "nope" on failed tap. Locked slots are absent (cards centre-align).
- **Food panel**: drumstick icon, floor(food) big (Lilita 30), rate "+1.2/s" small; pulses when a card becomes ready.
- **Base bars**: always visible, damage ghost, Warlord bar appears under the stage chip with crown pip when the Warlord
  spawns; ward shown as a hex badge on the enemy bar.
- **Toasts/banners** (top-centre, under bars): "ENEMY RALLY!", "WARD BROKEN!", "STORM RISING ⚡2", Warlord intro banner.
- **Coach** (Nimbus bubble + hand pointer) never blocks input except the single Battle-1 moment.
- **Pause sheet**: Resume (primary), Retreat (confirm "You keep 23 Gold"), Sound, Music, Haptics, Reduce Motion.
- **iPad**: world scales up (units ~70–85 pt); deck keeps phone proportions × uiScale and centres (max width 560).
- **SE (375 × 667)**: deck 180 pt; ground line moves up so the lane never hides under the deck; HUD top bar condenses
  stage chip to "B7".

## 4. Results

- **Victory**: VICTORY banner over light rays + confetti (see ART_BIBLE §5.14 choreography). Sheet rows count up:
  Kills (coin icon, "+N"), Base damage, Victory bonus (first clear), Total → flies into Gold pill.
  Smart primary CTA: **Upgrade** (if anything affordable; badge shows count) else **Next Battle**. Secondary: Home.
- **Defeat**: desaturate world, DEFEAT banner, "You keep +N Gold", one contextual tip with deep link
  ("Food Lv 3 → +10% Food/s — 26 Gold"), primary **Upgrade**, secondary **Retry**.
- **Warlord victory**: "WARLORD DEFEATED" then giant purple **EVOLVE!** primary.

## 5. Army (upgrades) — must fit without scrolling at 375 × 667

- Header: "STONE CAMP" + Gold pill.
- **Roster row**: three unit cards (110 × 150) — owned (live idle bust, level badge, HP/DMG mini stats), locked
  (silhouette + "Unlock 30" gold button; Tank shows "Needs Ranged" until Ranged owned).
- **Upgrade list** (5 rows: Food, Walls, Melee, Ranged, Tank): icon, name, Lv x/10, effect now → next ("+1.0/s → +1.1/s"),
  buy button with price (green if affordable, grey otherwise, MAX at Lv 10). Purchase choreography per ART_BIBLE §5.14.
- Rows that need a missing slot are hidden (not greyed) until the slot is owned.

## 6. Ages (evolution track)

- Horizontal carousel of six Age medallions (current highlighted, future locked with silhouettes and "Beat the Warlord").
- Current Age panel: name, base illustration (baked), three troops in a row, Warlord portrait with ✓ when beaten.
- **EVOLVE!** primary when available (purple, bolt icon, breathe + shine). Evolution is free in v1.
- Evolution cinematic (ART_BIBLE §5.14) plays full-screen, skippable after 1 s, then lands on Hub of the new Age.

## 7. Settings (sheet)

Sound, Music, Haptics (Vibration API where available), Reduce Motion, Damage Numbers on/off, Language (EN only v1,
strings externalised), Reset Progress (double confirm), Credits / version / build hash.

## 8. FTUE

Exactly as `GDD.md` §1.5. Coach steps are data (`src/data/coach.ts`) keyed by save flags so they never repeat after
completion and survive reload mid-step.

## 9. Accessibility & comfort

- Colour-blind safe factions (blue vs orange-red + facing + emblem shape).
- Reduce Motion: disables shake, hit-stop, slow-mo, flashes; replaces slides with fades.
- Minimum text 12 pt; contrast ≥ 4.5:1 for text on panels.
- Haptics: light tap on deploy, medium on base hit taken, heavy on victory/defeat (opt-out).

## 10. Screenshot acceptance matrix (Playwright, every PR touching UI/art)

Sizes: 375×667, 390×844, 430×932, 820×1180, 1024×1366. Scenes: title, hub (Stone + one later Age), battle at 3 s /
20 s (busy) / Warlord, pause sheet, victory, defeat, army, ages, settings, evolution mid-cinematic, gallery contact sheets.
Automatic checks: no document scroll, no element outside the safe viewport, no text overflow (scrollWidth > clientWidth),
all tappables ≥ 48 pt, no console errors. Human/agent review uses the ART_BIBLE §5.16 rubric.
