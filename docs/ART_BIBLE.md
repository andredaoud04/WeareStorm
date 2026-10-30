# WeAreStorm — Art Bible: clean cartoon, made in code

> **Superseded for in-game art (M2).** The owner replaced the code-drawn cartoon style with the STORMGLASS pixel-art
> kits: see `public/art/README.md` and `docs/TECH.md` §5. The kits' own `STYLE_GUIDE.md` is the visual authority for the
> world, troops, bases, effects and icons. Motion, VFX timing, feedback and UI-layout rules below still apply.

This is the visual law of the game. **One style everywhere**: bold ink outline + flat fill + one coloured cel-shadow
crescent + optional highlight, light from the top-left. No pixel art, no RPG/parchment frames, no glossy 3D gradients on
characters. Assembled from the "Visual Craft" proposal; reconcile with `GDD.md` → Reconciliation:

- Troop names follow the GDD. Rig variants: **standard biped** (Clubber, Slinger, Hoplite, Javelineer, Footman, Bolter,
  Corsair, Bombardier, Trencher, Gunner, Voltblade, Pulse Ranger), **tank biped** (Rockhide, Ironclad), **quadruped + rider**
  (Tusker; Knight = barded horse + rider), **vehicle** (Landship), **mech** (Titan), **Warlords** (unique rigs at 2.5×).
- The per-Age screen-wide powers in §5.11 are roadmap (v1.2). v1 builds `stormcall` (3 jagged bolts + shockwave + coin
  burst), and `suddenStorm` is the presentation of GDD §2.10 "Storm Rising".
- Base flags: see `OWNER_DECISIONS.md` (default: small pennant on a separate pole; nothing hangs on the architecture).
- Implementation: painter recipes in TypeScript (Canvas2D Path2D or Pixi Graphics) → baked once per DPR into atlases →
  animated as PixiJS sprite rigs. Unit portraits in DOM UI are rendered from the same rigs (baked bust textures).

### 5.1 North star

A bright, toy-like, **bold-outlined flat-cartoon** world. Think premium mobile strategy art reduced to pure vector shapes: chunky silhouettes, confident ink lines, two-tone cel shading, saturated readable characters on calmer, softer scenery.

**Never:** pixel art, parchment or scroll frames, ornate RPG borders, glossy 3D-render gradients on characters, photo textures, thin hairline UI, drop-in clip-art icons in another style.

**Style formula (memorize):**
> Ink outline (#1D1830) + flat base color + one cel-shadow crescent (bottom-right) + optional one highlight (top-left) + soft ground shadow. Light always comes from the top-left.

### 5.2 Scale, units and line weights

| Item | Value |
|---|---|
| Art unit | 1 art unit = 1 world unit (wu). Phone reference: 0.291 pt/wu (§2.1) |
| Troop height | 150 wu (≈ 44 pt on a 390-wide phone, ≈ 70 pt on iPad) |
| Tank / vehicle / boss | 200 / 170 (wide) / 380 wu |
| Base | 260 wide × 520 tall wu |
| **Silhouette outline** | **6 wu** (≈ 1.75 pt at phone reference). Drawn as an *outer* stroke: stroke 12 under the fill |
| Inner detail line | 3 wu, in the material's dark tone, never pure ink, so the inside reads softer than the silhouette |
| Minimum detail size | 8 wu (≈ 2.3 pt). Anything smaller is cut |
| UI outline | 3 pt ink on all panels, buttons, cards and pills, which matches the units' on-screen line weight |

### 5.3 Light, shading and colour rules

1. **Light** comes from the top-left at 45°, everywhere: units, bases, props, icons and UI bevels.
2. **Cel shadow** draws the shape in its shadow tone. Then, clipped to the shape, it draws the same shape shifted (−0.16w, −0.12h) toward the light in the base tone. What remains is a crisp crescent on the bottom-right.
   - Shadow tone = the base colour multiplied by the Age's `shadowTint` at 30 %, which gives coloured (purple-ish) shadows, never grey.
3. **Highlight** is optional, for round or shiny materials only: skin cheeks, metal, glass, gems. It is one rounded blob at the top-left in the base colour lightened 28 % toward warm white, at 70 % alpha, clipped to the shape. **Metal adds one hard specular dot.**
4. **No gradients on characters or bases.** Gradients are allowed only for sky, glows, VFX and UI button faces (subtle, ≤ 12 % lightness range).
5. **Ground contact shadow** is an ellipse 0.9 w × 0.18 w using a baked radial gradient (ink at 24 % fading to 0). It shrinks and fades with airborne height.
6. **Value hierarchy (readability law):** troops > bases > lane > mid scenery > far scenery > sky.
   - Background saturation ≤ 60 % of troop saturation.
   - Far layers are blended 35–55 % toward the sky-horizon colour (aerial perspective).
   - The lane band is ≥ 20 % lighter in value than the troops' mid-tones.
   - A grayscale "squash test" screenshot must still separate troops from the ground.
7. **Colour budget per troop:** ≤ 6 fills, plus skin, plus ink. One faction-coloured region must cover ≥ 15 % of the silhouette area.

### 5.4 Faction system (blue vs red, colour-blind safe)

| | Player — **Storm Blue** | Enemy — **Ember Red** |
|---|---|---|
| Faction base / shadow / light | #2E86F0 / #1D5FC2 / #7DB8FF | #F0533C / #B5321F / #FF9A84 |
| Future-Age glow | #46E3FF (cyan) | #FF5A3C |
| Facing | Right | Left (mirrored via `scale.x = −1`) |
| Emblem shape language | Round: circles, disc shields, rounded pennants | Angular: chevrons, notched pennants, spikes |
| Base flags | Blue round-tailed banner | Red swallow-tailed banner |
| HP bars | Left, blue | Right, red |

Both factions share the same rigs. Faction colours are **tokens** that get resolved at bake time, so each troop is baked twice. Blue-versus-orange-red also stays distinguishable for deuteranopes, and facing plus emblem shape add redundancy beyond colour.

### 5.5 Palettes per Age (hex)

| Token | Stone · Dawnvale | Ancient · Sunreach | Crusader · Bannerhold | Gunpowder · Powder Coast | Industrial · Ironworks | Future · Neon Frontier |
|---|---|---|---|---|---|---|
| skyTop | #6EC6F5 | #58B9F0 | #5DAEF2 | #4F8FD9 | #6F7FA6 | #1B2350 |
| skyHorizon | #FFE6B0 | #FFE2A6 | #DDF2FF | #FFC98A | #F6B884 | #FF8CC6 (mid #4B3BA8) |
| sunGlow | #FFF3C4 | #FFF7D6 | #FFFFFF | #FFE0A3 | #FFD39A | #9FD8FF (planet) |
| far | #A7C4E0 | #E9C88E | #8FA9D6 | #3FA3C6 (sea) | #8C8FA8 | #3A3F8C |
| mid | #79BF5A | #C9A46A | #6CB352 | #8DB860 | #7C8B6A | #2E3A74 |
| near (ground) | #5DA845 | #EBCB8B | #58A146 | #A9B86A | #8A8461 | #3A4E8C |
| lane | #D9A86A | #D7A863 | #C29A6B | #CDA978 | #7E6B57 | #5A6FB0 |
| laneDark | #B5824E | #B9874B | #9C7650 | #A9845A | #5E4E40 | #2C3A6E |
| fgProp | #3F8F3C | #4FA36B | #3D8B3F | #6E9E4A | #5E6B4B | #2B3366 |
| accentA | #E8C85A thatch | #2BB3A6 teal tile | #E6E1D3 stone | #C8664A brick | #B5553F brick | #E9EEF8 panel |
| accentB | #9B6A3F wood | #C9883A bronze | #5B6B8F slate | #F2EAD8 trim | #8E9AAC steel | #6DF0FF glow |
| shadowTint | #4B3D7A | #6A4A8E | #3E4A86 | #5A3F7E | #3F3A66 | #1E1B4A |
| ambientFx | #FFFFFF pollen | #FFE9B8 sand | #FFFFFF petals | #E8E2D8 smoke | #FFB36B embers | #9FF3FF motes |

**Shared material swatches (`src/render/art/palette.ts`):**

| Material | Swatches |
|---|---|
| Skin (3 per-instance variants, render-only) | #F7D0A8, #E0A77C, #A9704E |
| Hair | #3B2A22, #6B4428, #E0B25A |
| Fur | #C9A27A |
| Leather | #8A5A3B |
| Wood | #A36B3F |
| Bronze | #D39A45 |
| Iron | #9AA3B5 |
| Steel | #C5CEDB |
| Cloth white | #F4F1EA |
| Gold trim | #F5C542 |
| Rubber / tread | #3A3A48 |
| Glass | #A8E6FF |
| Eye white / pupil | #FFFFFF / #1D1830 |

### 5.6 Character construction

**Proportions (chibi, 2.6 heads):**

| Body part | Share of height |
|---|---|
| Head | 39 % (58 of 150 wu) |
| Torso | 30 % |
| Legs | 31 % |

- Hands are round mitts (Ø 14 wu) with no fingers.
- Feet are rounded blobs about 20 × 10 wu.
- Tanks: head 28 %, torso 46 %, legs 26 %, shoulders 1.5× wider.
- **Weapons are oversized:** about 1.2× the troop's head height or more. They are the main role cue.

**Shape language:**

| Role | Built from | Silhouette cue |
|---|---|---|
| Melee | Forward-leaning wedges and triangles | Weapon raised high |
| Ranged | Tall, narrow rectangles | A long horizontal weapon line reaching 0.6 w ahead |
| Tank | Big rounded squares | Wide stance, a shield or plate mass ≥ 40 % of the silhouette |
| Boss | 2.5× scale, a unique shape | Glowing eyes; a crown pip on the HP bar |

**Era readability:** each Age owns one headgear silhouette.

| Age | Headgear |
|---|---|
| Stone | Hair tuft / bone |
| Ancient | Crest |
| Crusader | Kettle brim / great helm |
| Gunpowder | Shako / tricorn |
| Industrial | Round helmet + goggles |
| Future | Visor dome / antenna |

**Faces:**
- **Eyes:** white ellipses 10 × 12 wu, ink pupils 5 × 7 wu, and a 2 wu white catchlight at the top-left.
- **Brows:** 3 wu ink capsules.
- **Mouth:** a 3 wu curve, or a filled "shout" shape during the attack strike.
- **Expressions** (swapped sprites, no morphing):
  - `neutral`
  - `fierce`: brows angled 20°, used during windup and strike
  - `ouch`: eyes squeezed into ^ ^, used during hit
  - `ko`: × × eyes, used for death
  - `cheer`: open smile, used on victory
- **Blink:** every 2–5 s (render RNG). Eye `scale.y` goes 1 → 0.1 → 1 over 90 ms.
- Enemy faces use the same art. They read as rivals, not monsters; enemy brows default to slightly fierce (10°).

**Detail budget:**
- ≤ 14 primitives per troop part set.
- ≤ 3 inner lines per part.
- **Squint test:** a troop must read by role and Age at 32 px tall.

**Render-only variety** (seeded by unit id; never affects silhouettes or gameplay):
- Skin variant.
- Hair or beard variant.
- Scale 0.97–1.03.
- Walk phase offset.
- Blink timing.

### 5.7 Rig specification (sprite skeleton)

Each troop is a `Container` tree of baked part sprites. Coordinates are in wu, with the origin at the centre between the feet and y pointing up shown as negative.

**Standard biped (melee/ranged, 150 wu):**

| Part | Parent | Pivot (joint) | Size (approx.) | z |
|---|---|---|---|---|
| shadow | (stage) | (0,0) | 54 × 10 | 0 |
| root | — | (0,0) | — | — |
| legBack | root | hip (−7,−46) | 18 × 46 | 1 |
| armBack | root | shoulder (−12,−82) | 16 × 36 + mitt | 2 |
| weaponBack (opt.) | armBack.hand | grip | — | 3 |
| torso | root | pelvis (0,−46) | 46 × 48 | 4 |
| head | torso | neck (2,−88) | 64 × 60 | 5 |
| face: eyes / brows / mouth | head | — | — | 6 |
| headgear | head | — | — | 7 |
| accessory (plume, hair, scarf, cape) | head / torso | attach point | — | 3 or 8 |
| legFront | root | hip (7,−46) | 18 × 46 | 9 |
| armFront | root | shoulder (12,−82) | 16 × 36 + mitt | 10 |
| weapon | armFront.hand | grip | per weapon | 11 |
| smear (strike trail) | weapon | grip | arc 120° | 12 (shown 2 frames) |

**Variants:**
- **Tank biped (200 wu):** same tree, wider torso; legs 26 % of height; shield as its own part on armBack (Bulwark, Knight).
- **Vehicle** (Cannon Cart, Steam Crawler):
  - hull, plus wheels or a tread loop. A tread is 10 segment sprites moved along a rounded-rect path, at a speed tied to ground speed, so there is **no sliding**.
  - barrel (pivot at the trunnion; recoil 12 wu)
  - crew head (with a blink)
  - smoke socket
  - suspension bob, using a 2-spring chain
- **Mech** (Titan, OMEGA-9): two-bone legs with knee IK solved analytically, so the feet plant on the step curve. Plus a cockpit dome with a pilot head and a shoulder emitter.
- **Quadruped** (Old Tusk):
  - Body ellipse; 4 legs with phase offsets (0, 0.5, 0.25, 0.75).
  - Trunk as a 3-segment chain with a spring.
  - Tusks and ear flaps (spring).
  - A rider biped parented to the saddle.

**Secondary motion:** plumes, hair, scarves, capes, banners, ear flaps and trunks use a **damped angular spring** (k = 180, d = 14) driven by the root's acceleration. This runs in presentation only and is cheap.

### 5.8 Animation set and timings

Clips are data: per-part keyframe tracks (rotation, offset, scale) with easing, layered with procedural modifiers. Attack timing is **slaved to sim events**.

| Clip | Duration | Keys (summary) | Sync |
|---|---|---|---|
| **spawn** | 0.25 s | Drops from 24 wu above the gate. Lands with squash (1.18, 0.82) → spring back. Faction ring flash under the feet | `spawn` event |
| **idle** | 1.2 s loop | Torso scaleY 1 ↔ 1.03 (breath). Head lags 0.1 s. Weapon sway ±3°. Blinks | — |
| **walk** | period = 2 × stride / speed (stride 28 wu; tanks 40) | Legs ±28°, arms ±18° (counter). Root bob 3 wu at 2× frequency. Torso lean 4°. Head counter-rotates 2°. **Feet planted (no sliding)** because the stride is matched to sim speed | sim `x` |
| **attack (melee)** | = interval | Anticipation through windup: weapon −70°, lean −8°, squash (1.06, 0.94), `fierce` face. Strike in 60 ms: weapon +60°, lunge +6 wu, stretch (0.94, 1.06), smear arc. **Impact** on the hit tick: 40 ms pose hold. Recover 250 ms ease-out | `attackStart.windupTicks` → `hit` |
| **attack (ranged)** | = interval | Draw/aim through windup (bowstring pull, sling spin speeds up, gun shoulders). Release on the projectile tick: recoil 8 wu, lean 5°, muzzle flash 60 ms, smoke puff | `attackStart` → `projectile` |
| **attack (vehicle)** | = interval | Barrel elevates during windup. Fire: barrel recoil 12 wu, hull rocks 3°, wheels or treads jolt back. Big smoke ring | same |
| **hit react** | 180 ms | White flash overlay 0 → 80 ms. Torso spring kicked back 10°. Squash (0.92, 1.08). `ouch` face 150 ms | `hit` event |
| **knockback** | 250 ms | Hop arc (12 wu high) following the sim's x displacement. Dust puff on landing | `knockback` |
| **death (A: launch)** | 0.8 s | Pops up 40 wu with a backward spin of 1 rev, fades from 0.5 s, cartoon poof cloud on landing, `ko` face | `death` |
| **death (B: topple)** | 0.7 s | Rotates back 90° with a bounce, two star sprites orbit the head, then sinks and fades | `death` |
| **death (C: break; tanks, vehicles)** | 0.9 s | Parts detach with seeded velocities and spin (helmet, weapon, wheel), gravity, a dust burst, fade | `death` |
| **cheer** | 0.6 s loop | Jump 10 wu, weapon raised, `cheer` face | victory |
| **boss intro** | 1.0 s | Roar pose, screen-wide shockwave ring, slow-motion 0.4× | `bossIntro` |

Death variant choice uses the render RNG seeded by unit id: melee 60 % A / 40 % B, and tanks always C. Corpses never stay on the lane. Hit flash uses **pre-baked white silhouette textures** (one per part) as overlay sprites. This avoids per-unit filters.

### 5.9 Bases per Age

Each base is one rig of baked parts: back towers → body → gate → front props → flag (a MeshPlane cloth). It has 3 damage overlays and a collapse script. The player and enemy versions are identical apart from the faction tokens (roof tiles, banners, awnings, glow) and mirroring.

| Age | Base | Signature parts and ambient life |
|---|---|---|
| Stone | **Totem Camp** | Hide-and-timber hut, thatch roof with smoke from the vent, a bone-arch gate, palisade stakes, a totem pole with a painted faction face, a fire pit flicker |
| Ancient | **Sun Ziggurat** | Three stepped sandstone tiers, columned gate with bronze doors, faction awnings, two braziers with flame sprites, a gold sun disc that glints |
| Crusader | **Banner Keep** | Stone keep and round tower, conical tile roof in faction colour, wooden hoarding, portcullis gate, 2 pennants plus a big banner (cloth) |
| Gunpowder | **Star Bastion** | Angled brick bastion with white trim, two cannon ports (barrels recoil when the base is hit, as feedback), a flagpole with a large flag |
| Industrial | **Iron Works** | Brick factory, riveted steel gate, two smokestacks (particle smoke), a facade gear turning slowly, a faction-painted water tower |
| Future | **Aegis Spire** | White curved tower with glass panels, a floating ring, an energy-shield dome that flashes a hex pattern on hit, a holo flag |

**Damage states:**

| Base HP | What changes |
|---|---|
| < 66 % | Crack overlay 1 |
| < 33 % | Crack overlay 2, a smoke emitter, and one part tilted 6° |
| < 15 % | Fire sprites (Future: shield flicker) |
| Every 5 % chunk | Small debris burst plus coin pop |

**Collapse sequence** (2.0 s, after a 120 ms hit-stop):
- White flash.
- Parts fall with gravity and rotation.
- 10 dust plumes.
- 16 debris chunks in the Age's material (rock, sandstone, stone, brick, steel, white panels).
- The flag drops.
- Camera punch 1.0 → 1.025.

### 5.10 Backgrounds (parallax layers)

Each layer is a Canvas2D texture baked at its on-screen size × DPR. Layers are generated **procedurally from a fixed seed**, so they are identical on every boot and screenshot-stable. For example, mountains use midpoint displacement smoothed into Catmull-Rom curves, and trees are stamped from 3 variants with jitter. Layers are drawn 1.6× the stage width so tablets show more world without stretching.

| Layer | Depth (shake parallax) | Content |
|---|---|---|
| sky | 0.0 | Vertical gradient, sun or planet glow (radial, additive), 3–5 cloud sprites drifting at 2–6 wu/s |
| far | 0.15 | Mountains, skyline or sea horizon; Age landmarks as silhouettes (volcano, ziggurats, castles, tall ships, smokestacks, crystal spires) |
| mid | 0.35 | Hills or terrain with mid props (trees, palms, windmills, cranes, platforms); ambient life (birds, gulls, airships, drones) |
| ground + lane | 1.0 | Ground fill, a **lane band** with soft edges, scattered pebbles, tufts and tracks (rail ties in Industrial, glow strips in Future) |
| foreground | 1.25 | Framing props (ferns, rocks, crates, cogs, holo-cones) that overlap the deck's top edge, with a sway skew sine of ±3° |

**Ambient life per Age** (≤ 30 sprites total):

| Age | Ambient life |
|---|---|
| Stone | Butterflies, a smoke plume from the far volcano |
| Ancient | Heat shimmer (sin-offset strip), drifting sand motes |
| Crusader | Petals, bird flocks |
| Gunpowder | Gulls, sails bobbing |
| Industrial | Embers, a smoke conveyor |
| Future | Twinkling stars, drones with blinking lights, light motes |

The battle **camera is static** for readability. Depth comes from the shake parallax, the ambient motion and the depth rows.

### 5.11 VFX catalogue (recipes in `src/render/vfx/recipes.ts`)

All particle textures are baked by the painter:
- Soft disc
- 4-point star
- Spark streak
- Puff cloud (cartoon circles with ink outline)
- Coin
- Food drumstick
- Debris (rock, wood, metal, panel)
- Confetti quad
- Ring
- Smear arc
- Lightning segment

| ID | Trigger | Recipe | Duration | Budget |
|---|---|---|---|---|
| `spawnRing` | spawn | Faction ring scale 0.4 → 1.2 + alpha fade; 4 dust puffs | 300 ms | 5 sprites |
| `footDust` | tank/boss step | 2 puffs, ground layer | 400 ms | 2 |
| `hitSpark` | melee hit | 4-point star pop (scale 0 → 1.3 → 0, 90 ms) + 3 streaks radiating + 1 debris (Age material) | 200 ms | 5 |
| `hitHeavy` | tank/boss hit | `hitSpark` ×1.6 + ring + camera trauma 0.12 + hit-stop 50 ms + damage number | 300 ms | 8 |
| `projPebble` / `arrow` / `bolt` | projectile | Rotating sprite on a parabola; arrows align to velocity; bolts and bullets draw a tracer (stretched streak, additive) | flight | 1–2 |
| `muzzleFlash` | gun fire | Star flash (additive) 60 ms + 2 smoke puffs drifting up | 500 ms | 3 |
| `plasma` | Future ranged | Additive glow orb + trail of 6 fading discs; splash ring on impact | flight + 250 ms | 8 |
| `splashBoom` | splash hit | Cartoon explosion: 5 puffs (orange → grey), flash, 6 debris, scorch decal fading over 2 s | 600 ms | 14 |
| `deathPoof` | death A/B | 6 outlined puff circles expand and fade + 2 stars | 450 ms | 8 |
| `coinPop` | kill / chunk | Coin(s) arc up 30 wu, hover 250 ms, then **fly to the Gold pill** (ease-in, 450 ms, crossing from the world to the HUD layer); the pill bumps 1.12 | 900 ms | ≤ 5 per event |
| `damageNumber` | heavy hits, base hits, power | BitmapText pops 0 → 1.25 → 1, floats up 24 wu, fades. White normal, #FFD447 heavy, #FF6B5A damage taken by the player base | 700 ms | ≤ 12 alive |
| `baseHit` | base damaged | Base squash 0.985 for 80 ms + white flash 60 ms + 3 debris + HP ghost bar | 250 ms | 4 |
| `baseCollapse` | win / lose | §5.9 | 2 s | 40 |
| `waveTelegraph` | waveIncoming | 3 red chevrons slide in at the right edge, pulse twice, fade | 1.5 s | 3 |
| `powerCharged` | power ready | Ring glow pulse 1.6 Hz + 8 orbiting sparkles + "READY" chip pop | loop | 10 |
| `meteorRain` | Stone power | Sky darkens 15 %. 5 flaming boulders (rock sprite + additive fire trail of 10 discs) fall at 12°. Each impact: `splashBoom`, crater decal, trauma 0.25 | 1.6 s | 60 |
| `sunfireVolley` | Ancient | Golden arrows (×15) arc from off-screen left; impacts flash gold; a light-ray fan from the sun | 1.6 s | 50 |
| `trebuchetBarrage` | Crusader | Boulders arc from behind the player base with a whoosh; stone debris | 1.6 s | 50 |
| `broadside` | Gunpowder | Muzzle flashes from off-screen left, cannonballs with smoke trails, big booms | 1.6 s | 60 |
| `airshipRaid` | Industrial | A blimp sprite crosses the sky (parallax 0.35) dropping 5 bombs; whistle trails; booms | 2.0 s | 60 |
| `orbitalLance` | Future | Targeting reticles appear (0.3 s), then cyan beams (additive quads with noise flicker) slam down, shockwave rings, screen flash 15 % | 1.6 s | 50 |
| `suddenStorm` | stalemate | Sky dims 25 %. Procedural lightning (jagged polyline, 3 branches, glow) hits the bases. Rain streaks layer | loop | 80 |
| `evolveVortex` | Evolution | §5.15 cinematic | 3.2 s | 150 |
| `confetti` | victory | 80 quads in palette colours; flip via scaleX = cos(t); gravity + drag | 2.5 s | 80 |
| `lowHpVignette` | player base < 25 % | Red edge vignette pulsing at 0.8 Hz (alpha 0–0.18) | loop | 1 |

### 5.12 Typography

| Use | Font | Size at 390 w | Treatment |
|---|---|---|---|
| Display / numbers / buttons | **Lilita One** (OFL, self-hosted via `@fontsource/lilita-one`) | H1 40, H2 28, button L 24, M 20, HUD numbers 28–32 | White fill + 3 pt ink stroke (HUD) or a stroke in the button's lip colour; 2 pt hard drop shadow |
| UI text / labels | **Nunito** 800/900 (OFL, `@fontsource/nunito`) | Body 15/20, caption 13/16, chip 12 | Ink (#1D1830) on light panels; white on dark |
| Damage numbers | Lilita One BitmapFont (installed at boot with stroke 4, ink) | 18 (normal), 24 (heavy), 30 (power) | — |

Casing rules:
- Headers and banners: UPPERCASE with +2 % tracking.
- Buttons: Title Case.
- Numbers: tabular (padded) so tickers do not jitter.
- Minimum text size: 12 pt.

### 5.13 UI kit (one kit for DOM and Pixi; tokens in `src/style/tokens.ts`)

**Colour tokens:**

| Token | Hex | Use |
|---|---|---|
| ink | #1D1830 | All outlines |
| night-900 / 800 / 700 | #141B33 / #1E2A4A / #2B3B66 | Deck, pills, scrims, tracks |
| paper / paper-shade | #F7F9FC / #DCE3EF | Panels and cards |
| blue-500 / 700 / 300 | #2E86F0 / #1C5FC4 / #7DB8FF | Primary (Battle), player |
| green-500 / 700 | #46C25A / #2A8C3B | Buy / affordable |
| gold-400 / 600 | #FFCF3D / #E39A12 | Gold, rewards, Evolve price |
| purple-500 / 700 | #8B5CF6 / #5B34C2 | Storm Power, Evolution |
| red-500 / 700 | #F0533C / #B5321F | Enemy, danger, defeat |
| food-500 | #FF9A3D | Food |
| grey-400 / 600 | #A9B3C5 / #6B7488 | Disabled |
| Role tints | melee #F4A340 · ranged #3FC2A0 · tank #8A7CF0 | Card portrait backgrounds and role icons (never red or blue, to avoid faction confusion) |

**Components** (each has default, pressed, disabled and, where relevant, highlighted states):

| Component | Spec |
|---|---|
| **Button** L/M/S | Height 64/52/40, radius 20/16/12. Layers: **lip** (darker shade, offset down 6/5/4 pt), **face** (vertical gradient, top +10 % lightness), **gloss** (top-half inset rounded rect, white 22 %), **3 pt ink outline**, label. **Press:** the face drops by the lip height and the lip collapses, 70 ms; release springs back (stiffness 500, damping 24) with a 1.04 overshoot. **Disabled:** grey palette, no gloss, label 60 %. **Highlighted:** a shine sweep (a 30° white band crossing in 500 ms) every 3.5 s, plus a 1.0 ↔ 1.03 breathe |
| **Panel** | Radius 24, 3 pt ink, paper fill, optional colour header band (52 pt) with a white Lilita title, **hard offset shadow** 0 6 0 night-900 at 35 % (cartoon shadow, not blur) |
| **Sheet / Modal** | Panel from the bottom with a 28 pt top radius. Enters with translateY 100 % → 0 (easeOutBack 1.2, 320 ms). Scrim night-900 at 60 % |
| **Pill (currency)** | 36 pt tall, night-800 fill, 3 pt ink. The icon (40 pt) **overhangs the left edge**. Lilita 20 white number. Bumps on change |
| **Unit card** | 84 × 120 (Battle) / 110 × 150 (Army). Radius 14, 3 pt ink. Portrait area with a radial gradient in the role tint. **Live idle-animated unit bust**, rendered from the real rig. Cost chip at the bottom (ink pill, drumstick icon + number). Role icon in the top-left corner. States in §6.3 |
| **Ring (ability)** | Ø 64. Ink ring, night-800 fill, purple progress sweep (conic, 4 pt), icon in the centre. Ready state adds glow and orbiting sparkles |
| **Progress / HP bar** | Height 14 (HUD) / 20 (panels), full radius, 2.5 pt ink. Track night-700. Fill gradient plus a top highlight stripe at 30 %. **Damage ghost:** a white segment that holds 400 ms, then shrinks over 300 ms. **Heal / upgrade:** a green leading segment |
| **Tab bar** | 72 pt + safe area, night-900 with a 3 pt ink top line. The active tab rises 10 pt with a blue plate and spring. Badge = red dot 18 pt with a white number |
| **Chip / Badge / Sticker** | "NEW" sticker: gold-400, rotated −8°, pops in. Level badge: an ink circle with a white number |
| **Toast** | Ink pill with a white label; slides down from the top safe area; auto-hides after 2 s |
| **Coach mark** | Scrim with a rounded-rect cutout (a soft 12 pt feathered edge), a vector **hand pointer** (painter-drawn, ink-outlined) bobbing ±6 pt at 1.4 Hz, and a speech bubble panel |

**Icons:** 28 icons in one SVG set (`src/ui/kit/icons.ts`). Each is filled shapes plus a 2.5 px ink outline on a 48 px grid, shaded by the same cel-shadow rule. The same SVG strings feed the DOM (inline SVG) and Pixi (rasterized once through an Image into the atlas).
- **Currency:** Gold coin (with an embossed storm bolt), Food drumstick.
- **Stats:** heart (HP), sword (DMG), crosshair (range), boot (speed), shield (armor).
- **Controls:** gear, pause, play, ×2 chevrons, lock, check, home, sound, music, vibration, retreat flag, info, close.
- **Progress and rewards:** star, crown (boss), bolt (Evolve / power), up-arrow (upgrade), helmet (Army), clock.
- **Roles:** melee / ranged / tank glyphs.

### 5.14 Motion design

**Tokens:**

| Token | Value |
|---|---|
| `dur.micro` | 90 ms |
| `dur.short` | 160 ms |
| `dur.medium` | 260 ms |
| `dur.long` | 420 ms |
| `dur.hero` | 700–1200 ms |
| `ease.out` | cubic-bezier(.22, 1, .36, 1) |
| `ease.back` | overshoot 1.6 |
| `spring.press` | k 500, d 24 |
| `spring.pop` | k 300, d 16 |
| `stagger` | 35 ms |

**Rules:**
1. **Nothing appears without a transition.** Lists stagger in (fade + 12 pt rise).
2. **Every number animates:** count-up tickers at ≤ 600 ms, using an ease-out on the value.
3. **Every tap answers within one frame** (pressed state) and plays a sound within 30 ms.
4. **Celebrations use overshoot. Information uses ease-out. Errors use a horizontal shake** (±6 pt, 3 cycles, 240 ms) plus a red flash on the relevant pill.
5. **Reduced motion** (OS setting or in-game toggle) turns off shake, hit-stop, slow-motion and flash, and replaces slides with fades.

**Choreographies:**

**Home → Battle: "Storm wipe" (550 ms)**
- A band of ink-outlined vector clouds sweeps diagonally across the screen while the battle scene builds behind it.
- The reveal pushes in from 1.06 → 1.0 (600 ms).
- The deck slides up 40 pt and the HUD drops in.

**Deploy:**
- The card squashes to 0.92 on press and springs back on release.
- The food number ticks down with a red "−5" float.
- The unit spawns at the gate: spawn ring plus drop-in.

**Victory:**

| Time | Beat |
|---|---|
| t0 | Hit-stop 120 ms; slow-motion 0.3× for 900 ms; `baseCollapse` |
| +0.9 s | Normal speed; your army cheers |
| +1.2 s | Vignette 30 %; "VICTORY!" banner drops (easeOutBack, 420 ms) over rotating light rays (0.2 rev/s); confetti |
| +1.8 s | Results sheet slides up; Gold lines count up with a 250 ms stagger and coin ticks |
| +3.0 s | The Continue button pops and then breathes |

**Defeat:**
- Your base collapses.
- The world desaturates to 30 % over 600 ms (a single ColorMatrix on the world container).
- The "DEFEAT" banner (red/grey) slides in.
- The sheet shows "You keep +N Gold" and a contextual tip with a deep link (for example, "Food Rate Lv3 → +12 % Food/s — 14 Gold").

**Purchase:**
- 5 coins fly from the wallet pill to the row (300 ms).
- The level badge flips (scaleY 1 → 0 → 1, 200 ms).
- The stat ticker runs.
- 6 sparkles appear.
- A "+12 %" float rises.

**Evolution cinematic** (Pixi overlay, 3.2 s, skippable after 1 s):

| Time | Beat |
|---|---|
| 0.0 | Dim; your 3 troops on a pedestal; light rays |
| 0.4 | Storm-cloud ring swirls in; procedural lightning arcs re-randomize every 60 ms |
| 1.2 | Bolt strike; 120 ms white flash; behind the flash, old troops spin to 0 and new troops pop up from 0 (overshoot) |
| 1.6 | Shockwave and particle burst; camera punch |
| 1.8 | Title slam "ANCIENT AGE" (scale 2 → 1, shake) |
| 2.6 | The new base assembles part by part (6 parts × 60 ms, with bounce) |
| 3.2 | "Let's go!" CTA |

### 5.15 Camera and game feel

| Lever | Spec |
|---|---|
| **Trauma shake** | `offset = maxOffset × trauma² × noise(t·18 Hz)`. maxOffset 7 pt, maxAngle 0.8°. Trauma decays 1.6/s. Sources: tank hit 0.12, base hit 0.15, splash 0.2, power impact 0.25–0.35, collapse 0.8. Parallax layers shake × depth |
| **Hit-stop** | Freezes the **presentation clock** (sim ticks are consumed later, so determinism holds). Heavy hit 50 ms, tank kill 40 ms, power impact 70 ms, base kill 120 ms. Cooldown 250 ms between hit-stops. Halved at 2× |
| **Slow-motion** | Base kill 0.3× for 900 ms; boss intro 0.4× for 1 s |
| **Punch zoom** | 1.0 → 1.025 → 1.0 over 300 ms on collapse and the power finale |
| **Flash** | Full-screen white at ≤ 35 % alpha, only for the collapse, evolution and Orbital Lance |

### 5.16 Art production process (how a codegen-only team reaches commercial quality)

1. **Golden sample first.** Build the Clubber (both factions, all clips) to final quality before any other troop. Its painter helpers, line weights and shading code become the template everything else copies.
2. **Contact sheets.** `?scene=gallery&age=N` renders every troop at 1× and 2× in idle, walk 25 %, windup, impact, hit, death 50 % and cheer, for both factions, on the Age's lane. A **squint strip** shows the same frames at 32 px and in grayscale. The Playwright job captures these sheets for every art PR.
3. **Self-review loop.** The agent must open the PNG sheets with its image-reading tool and score the **rubric** below. A part is done only when every row is ≥ 4/5. Scores and screenshots go in the PR description.

| Rubric row | 5 means |
|---|---|
| Silhouette | Role and Age are obvious at 32 px in grayscale |
| Line consistency | Outline width matches the Clubber within ±15 % on screen |
| Shading | One crescent, light from the top-left, coloured shadow, no stray gradients |
| Appeal | Readable face, charming proportions, oversized weapon, no awkward tangents |
| Palette | Uses Age and material tokens only; the faction region is ≥ 15 % of the silhouette |
| Motion | No foot sliding; the impact frame lands on the hit; secondary motion settles |
| Cohesion | Side-by-side with the Clubber and a base, it looks like the same game |

4. **Reference board in code.** The `gallery` scene also renders a "style row" (ink swatch, shading demo sphere, outline sample, button, card) at the top of each sheet, so drift is visible at a glance.

### 5.17 "AAA-level polish": the concrete checklist (gate G1 and the final gate)

**Visual**
- [ ] One outline weight and colour across troops, bases, props and UI (measured on contact sheets).
- [ ] One light direction; no ungraded grey shadows; no gradients on characters.
- [ ] Nothing is upscaled > 1.25× from its bake resolution, and there is no visible aliasing at DPR 2–3.
- [ ] Every troop passes the 32 px grayscale squint test.
- [ ] Bases show 3 damage states and a collapse.
- [ ] Each Age shows ≥ 3 kinds of ambient life.

**Motion and feel**
- [ ] No foot sliding (stride matched to sim speed).
- [ ] Impact frames are synced to sim hit ticks: in a replay test, the renderer timestamp is within ±1 frame.
- [ ] Every `SimEvent` kind has VFX and SFX, enforced by an exhaustive switch and a unit test.
- [ ] Every UI element enters with a transition, and every number animates.
- [ ] Coins fly to the wallet, and the wallet pill bumps.
- [ ] HP bars have a damage ghost.

**Performance**
- [ ] 60 fps on the battle stress scene on iPhone 11/SE 2-class hardware, or the 8 ms CPU budget in headless profiling (§7.9).
- [ ] No GC hitches > 4 ms during battle (pooled objects; no per-frame allocations in hot paths).
- [ ] Time to "Tap to start" ≤ 2.5 s on a fast-4G profile; bake ≤ 400 ms.

**UX**
- [ ] All touch targets ≥ 48 pt; no text below 12 pt; no truncation at 375 × 667.
- [ ] Safe areas are respected, and nothing sits under the home indicator or notch.
- [ ] No layout shift after the fonts load (fonts are preloaded and awaited before the bake).
- [ ] Every tap gives a sound and a pressed state within one frame.
- [ ] Reduced motion works; the damage-number setting works; the game auto-pauses when hidden.

**Audio**
- [ ] The mix never clips (limiter on master); concurrency limits per SFX; music ducks under big moments.

**Copy**
- [ ] Short, playful, consistent casing; no placeholder text or debug UI in production builds.
