# WeAreStorm — Technical Architecture (v1)

## 1. Stack

| Concern | Choice | Version (`package.json`) | Why |
|---|---|---|---|
| Language | TypeScript (strict, `noUncheckedIndexedAccess`) | `typescript ^6.0.3` | Shared types across sim, meta, render, UI, harness |
| Lint | ESLint + typescript-eslint (sim purity rules) | `eslint ^10.12.0`, `typescript-eslint ^8.71.2` | typescript-eslint 8.71 accepts TypeScript < 6.1, which is why TypeScript stays on 6.0 (7.x is the native Go port) |
| Build | Vite with `@preact/preset-vite` | `vite ^8.3.4`, `@preact/preset-vite ^2.10.6` | Fast dev, static deploy; the preset supports Vite 8 and is what `vite.config.ts` uses |
| World renderer | **PixiJS v8** (WebGL2, WebGPU-ready) | `pixi.js ^8.22.0` | Sprite batching, RenderTexture baking, particles at 60 fps on phones |
| Menus, sheets and battle HUD | **Preact** + **@preact/signals** | `preact ^11.0.1` (CI-verified with the preset), `@preact/signals ^2.11.3` | Tiny runtime; signals update only the changed text — no whole-tree re-render per frame |
| Tests | Vitest (unit, sim, meta), Playwright (screens, e2e) | `vitest ^5.0.4` | Fast, headless |
| Harness | `tsx` running the real `src/sim` + `src/meta` under Node | `tsx ^4.23.15`, `@types/node ^26.6.5`; Node 22 in CI | Balance validated against shipped code |
| Fonts | `@fontsource/lilita-one`, `@fontsource/nunito` (self-hosted, OFL) | `^5.3.0` each | No network font dependency; awaited before bake |
| Audio | Web Audio API: synthesized SFX (oscillators + noise + envelopes) and a tiny step-sequencer for per-Age music loops | — | No audio assets needed; original sound |
| Deploy | Vercel static (`vite build` → `dist/`), later Capacitor wrap | — | Same as owner's existing setup |
| Lockfile | **commit `package-lock.json`**; CI uses `npm ci` | — | Reproducible builds |

The pins are exactly those in `package.json` on `claude/m1a-scaffold`. `npm ci` succeeds from a clean clone without
`--legacy-peer-deps` or `--force` (verified in CI on PR #1); keep it that way. Do not bump TypeScript to 7.x until
typescript-eslint supports it.

## 2. Folder structure and ownership boundaries

```
src/
  contracts/        Frozen shared types (index.ts): SimInput, SimCommand, SimEvent, BattleSnapshot, UnitView, BattleStats,
                    BattleResult, AgeId, Slot, Role, ProjStyle. Changes need both streams' sign-off (PR label
                    `contract-change`).
  data/             Pure data: ages.ts, units.ts, stages.ts (+ stages.calibrated.json), economy.ts (formulas and constants:
                    prices, EVOLVE_PRICE, STORMCALL, STORM, TRICKLE_SHARE, ASSIST), later traits.ts, coach.ts, strings.en.ts
  sim/              Deterministic battle simulation (no DOM, no Pixi, no Math.random, no Date, no floats in state
                    except where documented) — battle.ts: createBattle, step, stepMut, cloneState, snapshot,
                    buildSchedule (assault generator), stormcallAim
  meta/             Pure progression/economy: progress.ts (idempotent settleBattle by battleId, unlocks, upgrades, evolvePrice
                    incl. early Evolve, canPlayStage, lose-forward assist, recommendUpgrade), save.ts (schema v1, migrate)
  app/              Boot, state store (signals), router (title/hub/battle/army/ages), battleController.ts (accumulator loop,
                    interpolation alpha, commands → sim, events → render/audio/ui), layoutRegistry.ts (world anchors, below)
  render/
    pixi/           Application, resize/camera (GDD Reconciliation §1b: ptPerWu, worldToScreen), layers, frame loop
    art/            Painter (ShapeKit, Canvas2D Path2D): primitives with ink outline + cel shadow + highlight; palette.ts;
                    bake.ts (tiered atlases, §5); units/<age>/*.ts rigs; bases/*.ts; backgrounds/*.ts; nimbus.ts
    anim/           Clip data + procedural modifiers (walk stride sync, springs, squash/stretch, blink, rank spread)
    vfx/            recipes.ts, pools, particles, damage numbers (BitmapText), screen shake/hit-stop/slow-mo
    scenes/         battleScene.ts, hubDiorama.ts, evolutionCinematic.ts, gallery.ts (contact sheets), stress.ts
  ui/
    kit/            Button, Panel, Sheet, Pill, Card, Ring, Bar, Tabs, Toast, Coach, icons (SVG strings)
    screens/        Title, Hub, BattleHud (deck, Food panel, base bars, Stormcall ring, pause, speed), Results, Army, Ages,
                    Settings, Pause
    style/          tokens.ts (single source; exported to CSS variables and Pixi), global.css
  audio/            synth.ts, sfx.ts (one function per SimEvent kind), music.ts (per-Age loops), mixer.ts (limiter,
                    ducking, concurrency caps)
tools/
  harness/          campaign.ts (bots, personas, runCampaign), run.ts (report), calibrate.ts, ci.ts (the 24-row gate)
  screens/          playwright scripts: matrix.ts (UX §10), gallery.ts
tests/              vitest specs mirroring src (sim/, meta/, data/, render/ pure helpers)
docs/               design pack (this folder)
```

**The battle HUD is DOM.** Preact renders the deck, Food panel, base bars, Stormcall ring, pause and speed controls on top
of the Pixi canvas. The Pixi world draws only the lane, units, bases and effects. Per-frame values (card fill, Stormcall
charge) are written straight to CSS variables on the card elements from the frame loop, never through a Preact render;
text values go through signals at ≤ 10 Hz (§4).

**Layout registry** (`src/app/layoutRegistry.ts`). The HUD is DOM, so Playwright and the Coach find HUD elements in the
DOM directly. The registry exists for **world-anchored overlays** only: anything that must point at a spot in the Pixi
world (coin flights from a kill or base chunk to the DOM Gold pill, coach marks on a unit, a base or the lane) registers
`{id, rect, role, label}`, with `rect` computed in CSS px by the camera's `worldToScreen()` function. Test and dev builds
expose `window.__ws = { layout(), state(), deploy(slot), stormcall(), setSpeed(n), seed(n) }`, where `layout()` returns the
registry entries.

**Lint rules (eslint):** `src/sim`, `src/meta`, `src/data` may not import from `render`, `ui`, `app`, `audio`, or use
`Math.random`, `Date`, `performance`, `window`, `document` (enforced with `no-restricted-globals` /
`no-restricted-imports`). Render/UI may not mutate sim state.

**Ownership in M2** (BUILD_PLAN): SYS owns `src/data`, `src/sim`, `src/meta`, `src/audio/**` and `tools/harness`; ART owns
`src/render/**`, `src/ui/**` and `src/app/battleController.ts`; `src/contracts/` changes go through the lead.

## 3. Simulation API (contract)

`src/contracts/index.ts` on `claude/m1b-sim` (abridged only where marked):

```ts
type Tick = number;                      // 20 Hz, 50 ms (TICK_MS = 50, TICKS_PER_SECOND = 20)
type BattleResult = 'victory' | 'defeat' | 'retreat';
interface SimInput {
  seed: number; stageId: StageId; armyAge: AgeId; timeline: number;
  owned: { ranged: boolean; tank: boolean };
  levels: { food: number; walls: number; melee: number; ranged: number; tank: number };
  stormcall: boolean;                    // unlocked? (stage 3 cleared)
  assist: number;                        // lose-forward assist 0..0.3 (GDD §2.11)
}
type SimCommand =
  | { kind: 'deploy'; slot: Slot }
  | { kind: 'stormcall' }
  | { kind: 'retreat' };
type SimEvent =
  | { kind: 'spawn'; id: number; side: Side; def: UnitDefId; x: number; rally: boolean }
  | { kind: 'attackStart'; id: number; targetId: number | 'base'; impactTick: Tick; area?: { x: number; r: number } }
  | { kind: 'projectile'; projId: number; id: number; from: number; to: number | 'base'; toX: number; arriveTick: Tick; style: ProjStyle }
  | { kind: 'projectileEnd'; projId: number; x: number; result: 'hit' | 'fizzle' | 'explode'; r?: number }
  | { kind: 'hit'; targetId: number | 'base'; targetSide: Side; sourceId: number /* 0 = Stormcall */; projId?: number;
      amount: number; heavy: boolean; armored: boolean; blocked?: 'ward' /* amount 0: "ting", no number */ }
  | { kind: 'whiff'; id: number }
  | { kind: 'death'; id: number; side: Side; def: UnitDefId; x: number; gold: number }
  | { kind: 'baseChunk'; side: Side; source: 'base' | 'warlord'; pct: number; gold: number }
  | { kind: 'rally'; size: number }
  | { kind: 'wardUp' } | { kind: 'wardBroken' } | { kind: 'warlordIntro'; id: number }
  | { kind: 'slamTelegraph'; id: number; x: number; radius: number; impactTick: Tick }
  | { kind: 'stormRising'; level: number } | { kind: 'stormcallCharged' }
  | { kind: 'stormcallCast'; x: number; radius: number; strikeTick: Tick }
  | { kind: 'stormcallNoTarget' }        // tapped with no hostile on the lane: stays charged, the UI shakes the ring
  | { kind: 'stormcallStrike'; x: number; radius: number }
  | { kind: 'deployQueued'; slot: Slot; foodSpent: number; queue: number }
  | { kind: 'deployRejected'; slot: Slot; reason: 'food' | 'queue' | 'cap' | 'locked' }
  | { kind: 'end'; result: BattleResult; goldEarned: number; stats: BattleStats };
interface UnitView {                     // one unit for one tick, positions in wu
  id: number; side: Side; def: UnitDefId; role: Role; x: number; hp: number; maxHp: number;
  state: 'walk' | 'windup' | 'recover' | 'idle';
  phaseEnd: Tick;                        // impact tick while winding up, end of recovery while recovering; else 0
}
interface BattleSnapshot {
  tick: Tick; food: number /* floor */; foodRate: number /* Food/s */;
  playerBase: { hp: number; maxHp: number }; enemyBase: { hp: number; maxHp: number; warded: boolean };
  units: readonly UnitView[]; queue: Readonly<Record<Slot, number>>;
  stormcall: { unlocked: boolean; charge: number /* 0..1 */; ready: boolean; casting: boolean };
  stormLevel: number; goldEarned: number; result: BattleResult | null;
}
// src/sim/battle.ts
createBattle(input: SimInput): Battle                                              // Battle = { readonly state: BattleState }
step(b: Battle, commands: readonly SimCommand[]): { battle: Battle; events: SimEvent[] }   // = cloneState + stepMut
stepMut(state: BattleState, commands: readonly SimCommand[]): SimEvent[]                  // mutates a caller-owned state
snapshot(b: Battle): BattleSnapshot
```

- **Purity.** `step()` clones the state (`cloneState`) and runs `stepMut` on the clone, so it never mutates its input; a
  Vitest test checks this. `stepMut()` advances a caller-owned state in place and is what the harness uses for speed. Both
  are deterministic: the same state and commands always give the same result (replay-hash test). The sim needs no
  randomness (ties break by id); `seed` travels in `SimInput` for replays.
- State is plain data (arrays of structs, integer HP, integer milli-food, positions as integers in **milli-wu**).
- Tick order exactly as GDD §2.7. Simultaneous damage application. ACT is two-pass: every impact and attack start is
  resolved against start-of-tick positions, then free units move, so the outcome never depends on the order of the unit
  list (a regression test replays every tick with the list reversed). A `retreat` ends the tick: commands after it in the
  same tick are ignored.
- Units spawn fully behind their own gate: player x = min(−20, −width/2), enemy x = max(1020, 1000 + width/2). A rally pack
  is capped by the 30-unit field limit, never spawns on the tick the enemy base falls, and is staggered outward (+30 wu per
  rank).
- **StageDef** (`src/data/stages.ts`): `id, age, idx, title, warlord, enemyAge, pattern, budget (E), assaultStartSec,
  assaultEndSec, trickleSec (0 = derive from TRICKLE_SHARE), rally, warlordAtSec, enemyStatMult, bossMult, inserts[]`,
  with `budget` and `bossMult` overridden by `stages.calibrated.json`. Spawn tokens `m`/`r`/`t` use `enemyAge`; `M` is the
  stage Age's melee (GDD §2.9).
- **Replay:** `{input, commands-by-tick}` reproduces a battle bit-for-bit; harness and tests use this.
- Not in the v1 contract: `deployHero`, `abilities[]`, `globalMods`, `waveIncoming`. They join with the releases that
  need them (GDD §3.7) under a `contract-change` PR.

## 4. Frame loop and interpolation

- `requestAnimationFrame` → accumulate real time × speed (×1/×2); run whole ticks (cap 4 × speed per frame; if
  exceeded, slow down instead of skipping); `alpha = acc / 50ms` for render interpolation of positions.
- **Hit-stop and slow-motion.** The presentation clock is separate. During hit-stop the accumulator does not accrue; during
  slow-motion it accrues only at the slowed rate. Time lost to either is never paid back: there is no catch-up burst
  afterwards. The tick sequence is unchanged, so outcomes never change (ART_BIBLE §5.15 has the hit-stop table).
- Render reads `snapshot(prev)`/`snapshot(curr)` + events; never writes sim.
- **HUD updates.** Per-frame values (card fill = `food / cost`, Stormcall charge) are written straight to CSS variables on
  the DOM card and ring elements from the frame loop. Text (Food, Gold, base HP) goes through signals at ≤ 10 Hz or on
  events — never per frame through Preact.
- Paused/hidden: no ticks, no Food, accumulator reset.

## 5. Art pipeline (code-only)

- **Painter**: TS recipes draw parts with **Canvas2D `Path2D` only** (analytic anti-aliasing, `clip()` for the cel-shadow
  crescent, `'source-in'` compositing for white silhouettes) using `ink` stroke-under, flat fill and an optional highlight.
  No Pixi Graphics bakes and no SVG ShapeKit output. Recipes take tokens (Age palette, faction palette, material).
- **Ink + fill.** Each part bakes two textures: **ink** (the shape stroked at 2× the outline width in ink colour) and
  **fill** (flat fill + crescent + highlight + inner lines), plus a baked white fill for the hit flash. A unit renders all
  ink sprites in a back sub-container, then all fill sprites, so one outline wraps the whole silhouette (ART_BIBLE §5.7).
- **Bake tiers** (cache key `age/unit/part/faction/tier/dpr`):
  - **lane** — `worldScale × DPR`, for the battle lane;
  - **card** — 1.0 pt/wu × DPR (head, torso, arms and weapon only), for the battle deck's unit busts;
  - **hero** — 1.6 pt/wu, on demand, for the hub, evolution cinematic, Army cards and Ages screen.
  Every DOM bust (the battle deck at the card tier, Army and Ages at the hero tier) is a **static bust** extracted once
  with `renderer.extract.canvas()` and shown as an `<img>` with a CSS 1.2 s idle bob. The battle deck is DOM (§2), so it
  no longer hosts live Pixi busts. Never a second WebGL context.
- **Bake budget**: at boot after fonts load, bake the current Age (+ next Age lazily) × both factions; target ≤ 400 ms.
- **Memory**: backgrounds bake at `min(DPR, 2)`; the sky is a 1×256 gradient texture stretched; set
  `canvas.width = canvas.height = 0` after each upload to free Canvas2D backing stores; atlas pages ≤ 2048²; ≤ 64 MB of
  textures per Age.
- **Rigs**: Container trees of part sprites with pivots per ART_BIBLE §5.7; clips are data; procedural modifiers.
- **Backgrounds**: procedural layers from fixed seeds (identical every boot → screenshot-stable), each a seamlessly
  tileable strip with a 1024 wu period (TilingSprite).
- **Icons**: one SVG string set used by the DOM (inline SVG) and Pixi (rasterized once).
- **Gallery scene** (`?scene=gallery&age=N`) renders contact sheets for review (ART_BIBLE §5.16).

## 6. Save system

- Key `wearestorm.save`, JSON `{ v: 1, ...SaveV1, checksum }`; written atomically after settlement and on purchases;
  in-battle checkpoint every 5 s (`pendingBattle { battleId, stageId, goldEarned }`) → settled as a retreat on next launch.
  Settlement (`settleBattle` in `src/meta/progress.ts`) is idempotent: it refuses any id in `lastSettledBattleId` or the
  last 16 ids in `recentBattleIds` (`RECENT_IDS`), treats non-finite or negative Gold and duration as 0, and refuses a
  stage the save has not reached. `canPlayStage` allows only the frontier stage (or a retry of it); once the campaign is
  complete, the Future stages 26–30 are replayable.
- `SaveV1` (`src/meta/save.ts`): `gold, armyAge, campaignStage (1..30, 31 = campaign complete), clearedStages
  (first-clear ledger), warlordsBeaten, timeline, owned{ranged,tank}, levels{food,walls,melee,ranged,tank}, ftue,
  settings{sound,music,haptics,reduceMotion,damageNumbers}, lossStreak, lastSettledBattleId, recentBattleIds, pendingBattle,
  stats`.
  Stormcall unlock is derived (stage 3 cleared), not stored.
- `migrate(raw) → SaveV1` repairs field by field: one bad value falls back to its default without wiping the rest, and an
  `armyAge` more than one Age from the frontier is pulled back into range.
- Corrupt/invalid save → keep raw copy under `wearestorm.save.corrupt.<ts>`, then load defaults; never silently lose.
- Migrations: fixtures per version under `tests/fixtures/saves/`.

## 7. Performance budgets (mid phone, iPhone 11 / Pixel 6 class)

- 60 fps battle with 30 + 30 units, ≤ 12 damage numbers, ≤ 150 particles: CPU ≤ 8 ms/frame, draw calls ≤ 40.
- No allocations in hot paths (pools for units, particles, numbers, projectiles).
- JS bundle ≤ 350 KB gzip (initial), boot to "Tap to Play" ≤ 2.5 s on fast 4G, bake ≤ 400 ms.
- **Stress scene** `?scene=stress` (30 v 30, 12 numbers, 150 particles) logs per-frame `updateMs` (sim + anim + VFX +
  display-list update, excluding GPU) via `performance.now()`.
- **CI perf gate**: p95 `updateMs` ≤ 8 ms in headless Chromium with CDP CPU throttling 4×, and draw calls ≤ 40, counted
  by wrapping `gl.drawElements` / `gl.drawArrays`. Headless Chromium renders WebGL2 through SwiftShader (CPU), so fps there
  means nothing; the gate measures CPU time only.
- **G1 adds an on-device check**: the owner's iPhone on the Vercel preview with the `?fps=1` overlay.

## 8. Testing strategy

| Layer | What | Tool |
|---|---|---|
| Sim | Determinism (replay hash), `step` never mutates its input, order independence (unit list reversed), spawns never overlap a hostile at the gate, rally cap and no rally on the victory tick, commands after a retreat ignored, `stormcallNoTarget`, tick order, simultaneous resolution, traits, ward and ward Gold, rally, Storm Rising, Food exactness, caps, Stormcall aim and cast, retreat, golden spawn schedules (Battle 1 first enemy at tick 200; stage 2 fields a Slinger; stage 4 fields a Rockhide), speed ×1/×2 identical outcomes, pause | Vitest |
| Meta | Prices, upgrades, free and early Evolve, idempotent settlement (also out of order), bad-number and unreached-stage guards, in-order campaign and Future-only replays after stage 30, retreat settlement, lose-forward streak, `recommendUpgrade`, save round-trip, migrations, corrupt-save recovery | Vitest |
| Data | Every unit has art + SFX mapping; every SimEvent kind has VFX/SFX handler (exhaustive switch test); every string in `strings.en.ts` matches the no-emoji/no-arrow rule (GDD Reconciliation §8) | Vitest |
| Balance | `npm run harness:ci`, the 24 rows in BALANCE.md §4.7 | tsx |
| Art / audio | `npm run art:lint` and `npm run audio:lint` (ART_BIBLE §5.16 step 5) | Playwright (Chromium) |
| Screens | UX §10 matrix + automatic layout checks over the DOM (including the battle HUD) and the layout registry's world anchors; gallery contact sheets | Playwright |
| E2E | Fresh save: title → Battle 1 win by tapping the DOM deck cards → upgrade → Battle 2; reload mid-battle settles once. Hooks via `window.__ws` (§2) | Playwright |
| Perf | Stress scene p95 `updateMs` and draw-call gate (§7) | Playwright (Chromium, CDP throttling) |

## 9. CI (GitHub Actions)

`verify` on push to `main` + pull_request (Node 22): `npm ci` → `npm run lint` → `npm run typecheck` → `npm test` →
`npm run harness:ci` → `npm run build`. The `screens` job (build + preview + Playwright matrix; PNGs uploaded as
artifacts, not pixel-diffed in v1), `art:lint`, `audio:lint` and the perf gate join the workflow when the renderer and art
land (slices 1C–1E).

## 10. Deploy

`vercel.json` with SPA fallback; production = `main`; previews per PR. PWA manifest + icons (generated from the vector
logo at build) so it installs to the home screen; Capacitor later.
