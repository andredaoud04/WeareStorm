# WeAreStorm — Build Plan

Rules for every builder:
- Read `GDD.md` (Reconciliation first), `ART_BIBLE.md`, `UX.md`, `TECH.md`, `BALANCE.md` for your slice.
- Work on a feature branch, **commit and push small checkpoints often** (API session limits can stop an agent at any
  time; unpushed work is lost). Open no PRs yourself unless told; the lead opens PRs.
- Every slice ends with evidence: `npm run lint && npm run typecheck && npm test && npm run harness:ci && npm run build` green, the relevant
  harness/Playwright output, and screenshots you have **looked at** and scored with the ART_BIBLE §5.16 rubric.
- Never change `src/contracts/` without the lead (label `contract-change`).
- Independent QA agents review every slice (code + real gameplay + screenshots); findings are fixed before merge.

## M1 — Foundation + Stone Age vertical slice (sequential slices, one builder at a time)

| Slice | Goal | Owns | Acceptance |
|---|---|---|---|
| **1A Scaffold** | Vite + TS + Preact/signals + Pixi + Vitest + ESLint (sim purity rules) + Playwright scripts + CI + Vercel config + PWA manifest; tokens.ts; contracts/ types per TECH §3; boot to a title screen with real fonts. Stack pins per TECH §1 | everything initially | CI green on PR; `npm ci` succeeds from a clean clone without `--legacy-peer-deps` or `--force`; title renders at all UX sizes, no console errors |
| **1B Sim core** | `src/data` (all six Ages' data, stages 1–30, calibrated), `src/sim` (deploy queue, Food, SENSE/ACT, windup/impact, projectiles, simultaneous damage, base, ward + ward Gold + Warlord slam, rally, trickle, Storm Rising, **Stormcall**, ×2, retreat, lose-forward assist), `src/meta` (economy, upgrades, free and early Evolve, `recommendUpgrade`, settlement, save v1), harness with bots (incl. the `average` calibration cohort), personas, calibrator and the 24-row `harness:ci`; in-order campaign and settlement guards | src/data, src/sim, src/meta, tools/harness, tests | Determinism + rules tests; `npm run harness:ci` green in CI (BALANCE §4.7); harness report in the PR description. Done on `claude/m1b-sim` (PR #2, `e1c84e6`) |
| **1C Renderer core** | Pixi app, camera (GDD Reconciliation §1b) + `worldToScreen`, layers, rank spread, battle scene with **placeholder** shapes driven by the real sim + interpolation, frame loop with hit-stop/slow-mo presentation clock (no catch-up burst), DOM battle HUD (deck with CSS-variable fills, Food, bars, Stormcall ring, pause, ×2), `layoutRegistry.ts` for world anchors and `window.__ws` test hooks, results, hub (incl. campaign-complete state), army, ages screens functional with the UI kit, stress scene + perf gate | src/render/pixi, scenes, src/app, src/ui | Full playable loop Stone stages 1–5 with placeholders; Playwright e2e fresh-save path; matrix screenshots incl. 375×548, 390×664 and `?insets=47,34`; perf gate p95 ≤ 8 ms (TECH §7) |
| **1D Stone art golden sample** | Painter (Canvas2D Path2D, ink + fill bakes, three bake tiers) + rig system; **Clubber** to final quality (all clips, both factions), then Slinger, Rockhide, Chief Grumbo (mammoth + chief), Totem Camp base (composition grid, pennant pole, damage states + collapse), Dawnvale background (5 tileable layers + ambient life), Nimbus, icon set, core VFX (spawnRing, hitSpark, hitHeavy, projectiles, deathPoof, coinPop, damageNumber, baseHit, baseCollapse, stormcall, confetti), gallery scene, **Stone hub diorama** and **title logo art** | src/render/art, anim, vfx, scenes/gallery, scenes/hubDiorama.ts | Gallery contact sheets scored ≥ 4/5 on every rubric row by builder AND independent QA; `npm run art:lint` green; battle screenshots at 390/375/820 |
| **1E Juice, audio, FTUE** | Motion choreographies (storm wipe, victory/defeat, purchase, deploy), trauma shake, hit-stop table, coin flight to pill, Stormcall gather and strike juice, SFX for every SimEvent, Stone music loop, mixer, FTUE coach (Battles 1–5), settings, auto-pause, reduce motion, **evolution cinematic with the Ancient title card** | src/audio, src/ui (motion), src/render/vfx, scenes/evolutionCinematic.ts | Polish checklist items for Stone all ticked with evidence; `npm run audio:lint` green |

Stormcall is built in M1 (sim in 1B, ring and VFX in 1C/1D, juice in 1E); it is not behind a feature flag.

**Gate G1 (owner-facing):** a Stone Age slice that looks and feels like a finished commercial game for its first 10
minutes. Adversarial QA panel (player-experience judge + art judge + technical judge) must pass it before M2. The lead
opens a PR to `main` with screenshots and a short video-like frame strip, and asks the owner to play the Vercel preview.
- **Data flag `MAX_AGE = 1`.** After Chief Grumbo, EVOLVE! plays the evolution cinematic and lands on the Ages screen with
  an "ANCIENT AGE — coming next" panel; no Ancient battle can start. M2 lifts the flag Age by Age.
- **On-device checks by the owner:** the game runs smoothly on their iPhone (Vercel preview with `?fps=1`), and they sign
  off the audio by listening on the device.

## M2 — Content scale-out (two builders in parallel, disjoint ownership)

| Stream | Owns | Work |
|---|---|---|
| **SYS** | src/data, src/sim, src/meta, tools/harness, `src/audio/**` (all SFX, synth, mixer and music) | Ages 2–6 data and traits already exist from 1B: trait tests and ablations (cleave, charge, splash, armor, rapid, pierce), trait SFX, Warlord 2–6 tuning, raising `MAX_AGE` Age by Age, calibrator passes until all CI bands pass, music loops per Age |
| **ART** | `src/render/**` (art, anim incl. quadruped gaits, treads and mech IK, vfx, scenes, pixi), `src/ui/**`, `src/app/battleController.ts` (routing new events) | Ages 2–6: 15 troops, 5 Warlords, 5 bases, 5 backgrounds, Age-specific VFX (javelin arcs, bolts, bombs, tracers, beams), per-Age title cards for the evolution cinematic, hub dioramas |

Each Age ships as its own PR (art + data for that Age together once both streams finish it), with harness report,
gallery sheets, and battle screenshots.

## M3 — Release candidate

Performance pass (stress scene budgets), device-matrix screenshots, accessibility pass, save-migration fixtures, PWA
install, Vercel production deploy, full-run human-like Playwright session (Battle 1 → first Evolution), final adversarial
QA panel, `docs/RELEASE_NOTES.md` with evidence and known issues.

## Later (designed, not in v1)

Storm Surge (prestige), Skills (per-Age powers), Cards, Heroes, Dungeons, cosmetics; real billing only via Capacitor after
validation. Never fake purchases/ads.
