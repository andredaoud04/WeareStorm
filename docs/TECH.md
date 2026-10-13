# WeAreStorm — Technical Architecture (v1)

## 1. Stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript (strict, `noUncheckedIndexedAccess`) | Shared types across sim, meta, render, UI, harness |
| Build | Vite 8 | Fast dev, static deploy |
| World renderer | **PixiJS v8** (WebGL2, WebGPU-ready) | Sprite batching, RenderTexture baking, filters, particles at 60 fps on phones |
| Menus / sheets | **Preact** + **@preact/signals** | Tiny runtime; signals update only the changed text (HUD/meta) — no whole-tree re-render per frame |
| Tests | Vitest (unit, sim, meta), Playwright (screens, e2e) | Fast, headless |
| Harness | `tsx` running the real `src/sim` + `src/meta` under Node | Balance validated against shipped code |
| Fonts | `@fontsource/lilita-one`, `@fontsource/nunito` (self-hosted, OFL) | No network font dependency; awaited before bake |
| Audio | Web Audio API: synthesized SFX (oscillators + noise + envelopes) and a tiny step-sequencer for per-Age music loops | No audio assets needed; original sound |
| Deploy | Vercel static (`vite build` → `dist/`), later Capacitor wrap | Same as owner's existing setup |
| Lockfile | **commit `package-lock.json`**; CI uses `npm ci` | Reproducible builds |

Pin exact major versions in `package.json`; verify Vite plugin compatibility at scaffold time (if `@preact/preset-vite`
does not support the installed Vite major, use Vite's esbuild JSX config: `jsx: 'automatic', jsxImportSource: 'preact'`).

## 2. Folder structure and ownership boundaries

```
src/
  contracts/        Frozen shared types: SimInput, SimCommand, SimEvent, BattleSnapshot, UnitDefId, AgeId,
                    SaveV1, Tokens. Changes need both streams' sign-off (PR label `contract-change`).
  data/             Pure data: ages.ts, units.ts, stages.ts (+ stages.calibrated.json), economy.ts (formulas),
                    traits.ts, coach.ts, strings.en.ts
  sim/              Deterministic battle simulation (no DOM, no Pixi, no Math.random, no Date, no floats in state
                    except where documented) — battle.ts (createBattle/step), spawner.ts, combat.ts, rng.ts, events.ts
  meta/             Pure progression/economy: wallet.ts, upgrades.ts, evolution.ts, settle.ts (idempotent by battleId),
                    save.ts (schema v1, migrate, checksum), campaign.ts
  app/              Boot, state store (signals), router (title/hub/battle/army/ages), battle controller
                    (accumulator loop, interpolation alpha, commands → sim, events → render/audio/ui)
  render/
    pixi/           Application, resize/camera (fit rules from GDD Reconciliation §1), layers, frame loop
    art/            Painter (ShapeKit): primitives with ink outline + cel shadow + highlight; palette.ts; bake.ts
                    (atlas per DPR); units/<age>/*.ts rigs; bases/*.ts; backgrounds/*.ts; icons.ts; nimbus.ts
    anim/           Clip data + procedural modifiers (walk stride sync, springs, squash/stretch, blink)
    vfx/            recipes.ts, pools, particles, damage numbers (BitmapText), screen shake/hit-stop/slow-mo
    scenes/         battleScene.ts, hubDiorama.ts, evolutionCinematic.ts, gallery.ts (contact sheets)
  ui/
    kit/            Button, Panel, Sheet, Pill, Card, Ring, Bar, Tabs, Toast, Coach, icons (SVG strings)
    screens/        Title, Hub, BattleHud (DOM parts), Results, Army, Ages, Settings, Pause
    style/          tokens.ts (single source; exported to CSS variables and Pixi), global.css
  audio/            synth.ts, sfx.ts (one function per SimEvent kind), music.ts (per-Age loops), mixer.ts (limiter,
                    ducking, concurrency caps)
tools/
  harness/          bots/*.ts, runCampaign.ts, report.ts, calibrate.ts, ci.ts
  screens/          playwright scripts: matrix.ts (UX §10), gallery.ts
tests/              vitest specs mirroring src (sim/, meta/, data/, render/ pure helpers)
docs/               design pack (this folder)
```

**Lint rules (eslint):** `src/sim`, `src/meta`, `src/data` may not import from `render`, `ui`, `app`, `audio`, or use
`Math.random`, `Date`, `performance`, `window`, `document` (enforced with `no-restricted-globals` /
`no-restricted-imports`). Render/UI may not mutate sim state.

## 3. Simulation API (contract)

```ts
type Tick = number;                      // 20 Hz, 50 ms
interface SimInput {
  seed: number; stageId: StageId; armyAge: AgeId; timeline: number;
  owned: { ranged: boolean; tank: boolean };
  levels: { food: number; walls: number; melee: number; ranged: number; tank: number };
  stormcall: boolean;                    // unlocked?
}
type SimCommand =
  | { kind: 'deploy'; slot: 'melee' | 'ranged' | 'tank' }
  | { kind: 'stormcall' }
  | { kind: 'retreat' };
type SimEvent =
  | { kind: 'spawn'; id: number; side: Side; def: UnitDefId; x: number }
  | { kind: 'attackStart'; id: number; targetId: number | 'base'; impactTick: Tick }
  | { kind: 'projectile'; id: number; from: number; to: number | 'base'; arriveTick: Tick; style: ProjStyle }
  | { kind: 'hit'; targetId: number | 'base'; side: Side; amount: number; heavy: boolean; armor: boolean }
  | { kind: 'death'; id: number; side: Side; def: UnitDefId; x: number; gold: number }
  | { kind: 'baseChunk'; side: Side; pct: number; gold: number }
  | { kind: 'rally' } | { kind: 'wardUp' } | { kind: 'wardBroken' } | { kind: 'warlordIntro'; id: number }
  | { kind: 'stormRising'; level: number } | { kind: 'stormcallCharged' } | { kind: 'stormcallStrike'; x: number }
  | { kind: 'deployRejected'; slot: string; reason: 'food' | 'queue' | 'cap' }
  | { kind: 'end'; result: 'victory' | 'defeat'; goldEarned: number; stats: BattleStats };
interface Battle { readonly tick: Tick; readonly state: BattleState }   // opaque; snapshot() for render
createBattle(input: SimInput): Battle
step(b: Battle, commands: SimCommand[]): { battle: Battle; events: SimEvent[] }   // exactly one tick
snapshot(b: Battle): BattleSnapshot      // positions/hp/anim-relevant fields, structurally shared
```

- State is plain data (arrays of structs, integer HP, integer milli-food, positions as integers in **milli-wu**).
- `step` is pure with respect to its input (copy-on-write or immutable update); tests freeze inputs.
- Tick order exactly as GDD §2.7. Simultaneous damage application. Deterministic seeded RNG (mulberry32) stored in state.
- **Replay:** `{input, commands-by-tick}` reproduces a battle bit-for-bit; harness and tests use this.

## 4. Frame loop and interpolation

- `requestAnimationFrame` → accumulate real time × speed (×1/×2); run whole ticks (cap 4 × speed per frame; if
  exceeded, slow down instead of skipping); `alpha = acc / 50ms` for render interpolation of positions.
- Presentation clock is separate: hit-stop/slow-mo freeze or slow **presentation**, and the sim is held back
  (ticks consumed later) so outcomes never change.
- Render reads `snapshot(prev)`/`snapshot(curr)` + events; never writes sim.
- UI signals updated at ≤ 10 Hz (food, gold, bars) or on events — never per frame through Preact.
- Paused/hidden: no ticks, no Food, accumulator reset.

## 5. Art pipeline (code-only)

- **Painter**: TS recipes draw parts with Canvas2D `Path2D` (or Pixi Graphics) using `ink` stroke-under, flat fill,
  cel-shadow crescent via clip, optional highlight. Recipes take tokens (Age palette, faction palette, material).
- **Bake**: at boot after fonts load, bake every part for the current Age (+ next Age lazily) × both factions into a
  RenderTexture atlas at `resolution = min(devicePixelRatio, 3) × worldScale`; target ≤ 400 ms; cache by key
  `age/unit/part/faction/dpr`. Hit-flash white silhouettes baked alongside.
- **Rigs**: Container trees of part sprites with pivots per ART_BIBLE §5.7; clips are data; procedural modifiers.
- **Backgrounds**: procedural layers from fixed seeds (identical every boot → screenshot-stable).
- **Icons**: one SVG string set used by DOM (inline SVG) and Pixi (rasterized once).
- **Gallery scene** (`?scene=gallery&age=N`) renders contact sheets for review (ART_BIBLE §5.16).

## 6. Save system

- Key `wearestorm.save`, JSON `{ v: 1, ...SaveV1, checksum }`; written atomically after settlement and on purchases;
  in-battle checkpoint every 5 s (`pendingBattle { battleId, goldEarned }`) → settled as retreat on next launch.
- `SaveV1`: `gold, armyAge, campaignStage, timeline, owned{ranged,tank}, levels{...}, stormcallUnlocked, ftueFlags,
  settings{sound,music,haptics,reduceMotion,damageNumbers}, lastSettledBattleId, stats`.
- Corrupt/invalid save → keep raw copy under `wearestorm.save.corrupt.<ts>`, then load defaults; never silently lose.
- Migrations: `migrate(raw) → SaveV1` with fixtures per version under `tests/fixtures/saves/`.

## 7. Performance budgets (mid phone, iPhone 11 / Pixel 6 class)

- 60 fps battle with 30 + 30 units, ≤ 12 damage numbers, ≤ 150 particles: CPU ≤ 8 ms/frame, draw calls ≤ 40.
- No allocations in hot paths (pools for units, particles, numbers, projectiles).
- JS bundle ≤ 350 KB gzip (initial), boot to "Tap to Play" ≤ 2.5 s on fast 4G, bake ≤ 400 ms.
- Stress scene `?scene=stress` for profiling.

## 8. Testing strategy

| Layer | What | Tool |
|---|---|---|
| Sim | Determinism (replay hash), tick order, simultaneous resolution, traits, ward, rally, Storm Rising, Food exactness, caps, speed ×1/×2 identical outcomes, pause | Vitest |
| Meta | Prices, upgrades, evolution, idempotent settlement, save round-trip, migrations, corrupt-save recovery | Vitest |
| Data | Every unit has art + SFX mapping; every SimEvent kind has VFX/SFX handler (exhaustive switch test) | Vitest |
| Balance | `npm run harness:ci` thresholds (BALANCE.md §4.7) | tsx |
| Screens | UX §10 matrix + automatic layout checks; gallery contact sheets | Playwright |
| E2E | Fresh save: title → Battle 1 win by tapping → upgrade → Battle 2; reload mid-battle settles once | Playwright |

## 9. CI (GitHub Actions)

`verify` on push + pull_request: `npm ci` → `npm run lint` → `npm run typecheck` → `npm test` → `npm run harness:ci` →
`npm run build`. `screens` job: build + preview + Playwright matrix; upload PNGs as artifacts (not pixel-diffed in v1).

## 10. Deploy

`vercel.json` with SPA fallback; production = `main`; previews per PR. PWA manifest + icons (generated from the vector
logo at build) so it installs to the home screen; Capacitor later.
