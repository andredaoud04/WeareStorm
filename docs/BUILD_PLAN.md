# WeAreStorm — Build Plan

Rules for every builder:
- Read `GDD.md` (Reconciliation first), `ART_BIBLE.md`, `UX.md`, `TECH.md`, `BALANCE.md` for your slice.
- Work on a feature branch, **commit and push small checkpoints often** (API session limits can stop an agent at any
  time; unpushed work is lost). Open no PRs yourself unless told; the lead opens PRs.
- Every slice ends with evidence: `npm run lint && npm run typecheck && npm test && npm run build` green, the relevant
  harness/Playwright output, and screenshots you have **looked at** and scored with the ART_BIBLE §5.16 rubric.
- Never change `src/contracts/` without the lead (label `contract-change`).
- Independent QA agents review every slice (code + real gameplay + screenshots); findings are fixed before merge.

## M1 — Foundation + Stone Age vertical slice (sequential slices, one builder at a time)

| Slice | Goal | Owns | Acceptance |
|---|---|---|---|
| **1A Scaffold** | Vite + TS + Preact/signals + Pixi + Vitest + ESLint (sim purity rules) + Playwright scripts + CI + Vercel config + PWA manifest; tokens.ts; contracts/ types per TECH §3; boot to a title screen with real fonts | everything initially | CI green on PR; title renders at all UX sizes, no console errors |
| **1B Sim core** | `src/data` (Stone Age + stages 1–5), `src/sim` complete for Stone (deploy queue, Food, SENSE/ACT, windup/impact, projectiles, simultaneous damage, base, ward + Warlord slam, rally, trickle, Storm Rising, Stormcall, ×2), `src/meta` (economy, upgrades, settlement, save v1), harness with bots + `harness:ci` for stages 1–5 | src/data, src/sim, src/meta, tools/harness, tests | Determinism + rules tests; Battle 1 lazy/slow-tapper win ≥ 98%, durations in band; harness report committed |
| **1C Renderer core** | Pixi app, camera/fit, layers, battle scene with **placeholder** shapes driven by the real sim + interpolation, frame loop with hit-stop/slow-mo presentation clock, battle HUD (deck, Food, bars, pause, ×2), results, hub, army, ages screens functional with the UI kit | src/render/pixi, scenes, src/app, src/ui | Full playable loop Stone stages 1–5 with placeholders; Playwright e2e fresh-save path; matrix screenshots |
| **1D Stone art golden sample** | Painter + bake + rig system; **Clubber** to final quality (all clips, both factions), then Slinger, Rockhide, Chief Grumbo (mammoth + chief), Totem Camp base (damage states + collapse), Dawnvale background (5 layers + ambient life), Nimbus, icon set, core VFX (spawnRing, hitSpark, hitHeavy, projectiles, deathPoof, coinPop, damageNumber, baseHit, baseCollapse, stormcall, confetti), gallery scene | src/render/art, anim, vfx, scenes/gallery | Gallery contact sheets scored ≥ 4/5 on every rubric row by builder AND independent QA; battle screenshots at 390/375/820 |
| **1E Juice, audio, FTUE** | Motion choreographies (storm wipe, victory/defeat, purchase, deploy), trauma shake, coin flight to pill, SFX for every SimEvent, Stone music loop, mixer, FTUE coach (Battles 1–5), settings, auto-pause, reduce motion | src/audio, src/ui (motion), src/render/vfx | Polish checklist items for Stone all ticked with evidence |

**Gate G1 (owner-facing):** a Stone Age slice that looks and feels like a finished commercial game for its first 10
minutes. Adversarial QA panel (player-experience judge + art judge + technical judge) must pass it before M2. The lead
opens a PR to `main` with screenshots and a short video-like frame strip, and asks the owner to play the Vercel preview.

## M2 — Content scale-out (two builders in parallel, disjoint ownership)

| Stream | Owns | Work |
|---|---|---|
| **SYS** | src/data, src/sim, src/meta, tools/harness, src/audio/music.ts | Ages 2–6 data + traits (cleave, charge, splash, armor, rapid, pierce), stages 6–30 + inserts, Warlords 2–6 behaviour, evolution flow logic, calibrator passes until all CI bands pass, music loops per Age |
| **ART** | src/render/art/**, src/render/vfx/**, src/render/scenes/**, src/ui/screens/Ages.tsx | Ages 2–6: 15 troops, 5 Warlords, 5 bases, 5 backgrounds, Age-specific VFX (javelin arcs, bolts, bombs, tracers, beams), evolution cinematic, hub dioramas |

Each Age ships as its own PR (art + data for that Age together once both streams finish it), with harness report,
gallery sheets, and battle screenshots.

## M3 — Release candidate

Performance pass (stress scene budgets), device-matrix screenshots, accessibility pass, save-migration fixtures, PWA
install, Vercel production deploy, full-run human-like Playwright session (Battle 1 → first Evolution), final adversarial
QA panel, `docs/RELEASE_NOTES.md` with evidence and known issues.

## Later (designed, not in v1)

Storm Surge (prestige), Skills (per-Age powers), Cards, Heroes, Dungeons, cosmetics; real billing only via Capacitor after
validation. Never fake purchases/ads.
