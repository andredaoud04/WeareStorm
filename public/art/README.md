# Art kits (STORMGLASS)

The game is drawn with six pixel-art kits supplied by the owner, one per Age. This folder holds the **packed, in-game
copies** of those kits. The ~320 MB of source PNGs are not committed.

| Age | Kit | Built by | Melee | Ranged | Tank | Warlord |
|---|---|---|---|---|---|---|
| Stone | `primal` | `tools/art/build_eras.py` | Flintspear | Slinghunter | Boneguard | Primal Warlord |
| Ancient | `ancient` | `tools/art/build_eras.py` | Longspear | Warbow | Bronze Guard | Ancient Warlord |
| Medieval | `eldritch` | `tools/art/build_kits.py` | Riftblade | Voidseer | Obsidian Warden | Hollow Regent |
| Gunpowder | `gunpowder` | `tools/art/build_eras.py` | Musketeer | Grenadier | Sabre Guard | Gunpowder Warlord |
| Industrial | `industrial` | `tools/art/build_eras.py` | Trench Raider | Rifleman | Heavy Gunner | Industrial Warlord |
| Future | `future` | `tools/art/build_kits.py` | Rifleman | Marksman | Heavy | Siege Commander |

That table is `src/render/kits/ageKits.ts` (`AGE_KIT`, `KITS`): which kit draws an Age and the names the UI shows.
Presentation only; the sim, data and balance never read it.

**Era-pack role mapping — needs the owner's confirmation.** The pack names its designs but not their game roles, so
they were assigned from the art: closest weapon → melee, a projectile → ranged, heaviest armour / most imposing →
tank, `warlord` → the Warlord (drawn ~2.4×).

- Primal: Flintspear (spear, close) melee; Slinghunter (sling) ranged; Boneguard (axe + hide shield, the bulkiest
  figure) tank. The pack's own alias list maps the old Clubber to the Boneguard "axe artwork"; it reads as the tank
  here because it is the only shielded, heavily armoured design.
- Ancient: Longspear melee; Warbow ranged (the sim's style is a javelin; an arrow is drawn); Bronze Guard (bronze
  armour, round shield) tank.
- Gunpowder: Grenadier ranged (the slot's projectile is a splash bomb: a thrown grenade fits); Sabre Guard (sabre,
  buckler, broadest figure) tank; Musketeer melee, attacking with a point-blank musket volley (muzzle flash + smoke
  instead of a slash).
- Industrial: Trench Raider (spiked club, revolver) melee; Rifleman ranged (the slot fires 3-round bursts); Heavy
  Gunner (machine gun) tank (the slot's short-range "shell" is drawn as a flat tracer).
- Warlord names: the pack (PROMPTS.md) only calls them "<Era> Warlord", so that is what the UI shows.

## Provenance

- Atlas kits: Google Drive › Portfolio › Stormglass › Assets
  - `eldritch` — atlas title **"STORMGLASS — Eldritch Era"** (`eldritch_atlas.json`, sha256 `551d48c89c05bf16def1288ea3e31a387394e3101429deddb250be7b3e7ae296`)
  - `future` — atlas title **"STORMGLASS — Future Era"** (`future_atlas.json`, sha256 `2a478e1efac8eaa41fff3dac480f4ac85251f930c56b60da4359929526369e8f`)
  - Every source PNG is verified against the sha256 in its atlas before anything is built. `Mature_Six_Unit_Lineup.png`
    is a style reference only and is not used.
- Era packs (`primal`, `ancient`, `gunpowder`, `industrial`): Google Drive › Portfolio › Stormglass › Assets ›
  **Claude handoff** (folder id `173-kGeHRwP2xkQWjcUwNdTRSH35tJvDG`). The upload flattened the pack's folders
  (`bronze_guard (12).png` …) and mixes the 118 high-resolution sources with ~1300 low-resolution exports made for
  another engine; only the 118 sources are used. They were identified by the pack's `file-checksums.csv`
  (Drive id `177nI97b-KnXyNbUXYeH_k0pGA4oDr79J`): every file's sha256 matched a `sources/<era>/…` row and was put
  back at that path. The builder re-verifies all 118 against that list (each era's `manifest.json` → `sources`). The
  pack's runtime sheets, installer and 128 × 80 procedural animation sheets target that other engine and are not used.

## Rebuild

```sh
# atlas kits: <src> holds eldritch/, future/, eldritch_atlas.json, future_atlas.json (unzipped from Drive)
python3 -I tools/art/build_kits.py --kit eldritch --kit future --src <src> [--preview <dir for PNG copies>]

# era packs (after the atlas kits: they borrow effects from public/art/{eldritch,future}):
# <src> holds file-checksums.csv and primal/, ancient/, gunpowder/, industrial/ with storm/, ember/, world/
python3 -I tools/art/build_eras.py --kit primal --kit ancient --kit gunpowder --kit industrial --src <src> [--preview <dir>]
```

Python 3 + Pillow with WebP support (+ numpy for the era packs). Each kit takes 1–2 minutes and rewrites
`public/art/<kit>/` completely.

## What is in each kit folder

| File | Content |
|---|---|
| `manifest.json` | Frames (atlas page, rect, anchor in output px; units also nominal height and muzzle point), images, unit/base tables, source hashes |
| `sprites-0.webp` | Hero sprites of the 3 troops × Storm/Ember, the Warlord, their white hit-flash silhouettes, weapon/shield debris parts (era packs: also effects, projectile, prop) |
| `bases-0.webp` | The base in 4 damage states × 2 factions, one common scale, ground anchors applied |
| `portrait-*.webp` | DOM UI: upper-body troop portraits |
| Atlas kits only: `fx-0.webp`, `sky.webp`, `horizon.webp`, `path.webp`, `ground.webp`, `logo.webp`, `icons.webp` | 9 battle effects, wisps, 10 props; portrait sky; horizon band; lane strip and ground tile mirror-joined so plain repeat is seamless; wordmark; 4 × 4 icon sheet |
| Era packs only: `sky.webp`, `distant.webp`, `midground.webp`, `ground.webp`, `foreground.webp`, `fill.webp` | Opaque sky; the authored scene layers on one canvas (each records its top `y`, the ground layer the `laneY` row the feet stand on); the foreground strip drawn below the lane; a fill (the ground's near rows mirror-joined) down to the screen bottom |

Processing: region masks (`maskRuns`) are applied (atlas kits); source alpha below 16 (stray generator specks and a
faint dark fringe) is dropped on sprites so trims are tight and nothing dirty shows at game size; resampling is
premultiplied Lanczos; atlas pages are ≤ 2048 × 2048 with 2 px padding.

Era-pack specifics (`build_eras.py`):

- **Feet / scale**: a unit's anchor is its lowest opaque row (alpha ≥ 128), centred between the feet. Soldiers use the
  same px-per-source-px as the atlas kits (a 1100 px figure → 240 px), so a soldier is the same height in every Age;
  tanks draw ~1.3×, the Warlord ~2.4× (`sizes.ts`). A figure delivered on a shorter canvas (Primal Flintspear,
  1402 × 1122) is rescaled to the common 1199 px canvas height.
- **Bases**: one scale per era from the intact Storm footprint width; each state stands on its own lowest opaque row
  (the common ground line) and shares the intact state's anchor x, so ruins are never stretched to the intact
  height. The forts are wide and low: the intact one is drawn ~190 pt wide (~120 pt tall) on the reference phone, its
  anchor 8 % of that width inward of the gate so the fort reaches no further into the lane than the atlas kits' bases.
- **World**: distant / midground / ground keep their painted registration; the runtime stands that canvas on the lane
  at `laneY` and mirror-repeats it sideways (`KitWorld`). `laneY` per era is chosen from the art (the top of the
  primal soil cut, the ancient flagstones, the gunpowder cobbles, the industrial mud in front of the revetment). A layer
  cut by the canvas top (Primal's canopy) fades into the sky.
- **Debris**: the weapon (and shield where there is one) of each troop, cut from its parts sheet by connected
  components (the part's approximate box → best-overlapping component). Where the piece is fused to a glove or coat
  on one faction's sheet, the uncoloured weapon is taken from the other faction's sheet.
- **Effects**: the era packs ship none. Hit, impact, dust, poof, scorch, swoosh and the Stormcall bolt are Future's
  shapes (Eldritch's are crystal/void-magic and read wrong in a historical Age), recoloured per era (impact: warm fire
  or dust; dust: earth or mud; poof: smoke; swoosh: steel); the coin is Eldritch's (it matches the shared credits
  icon). The projectile is drawn procedurally per era: sling stone, arrow, lit grenade, tracer.
- **Icons and wordmark**: one shared set for every Age — Eldritch's icon sheet and logo (`ICON_KIT`, `KITS[*].logo`);
  the Future kit keeps its own wordmark. The era packs ship neither.

## Resolution and sampling

Sprites are pre-scaled to ~2× their on-screen size on the reference phone (soldier ≈ 240 px for ~76 pt, tank ≈ 360 px,
Warlord ≈ 600 px), so a DPR-2 phone draws them slightly downscaled and an iPad still has pixels to spare. The sources
are generated "pixel-art style" images with no exact pixel grid (≈ 3–5 source px per art pixel), so there is no
integer scale to snap to. The runtime uses **bilinear filtering without mipmaps** (mipmaps only on the far horizon /
distant layer). Compared at 390 × 844 DPR 2 (`?sample=nearest|trilinear` switches the loader for this check): nearest
is equally sharp but jags thin diagonals (sword edges, staffs) and shimmers on moving troops; trilinear mipmapping
blends toward the half-size mip at the ~0.55× phone ratio and looks soft; bilinear keeps the detail without the
jaggies. World sizes live in `src/render/kits/sizes.ts`; change sizes there, not here.

## Size

| Kit | Files | Bytes |
|---|---|---|
| primal | 12 | 1.93 MiB |
| ancient | 12 | 1.76 MiB |
| eldritch | 13 | 2.78 MiB |
| gunpowder | 12 | 1.60 MiB |
| industrial | 12 | 1.43 MiB |
| future | 13 | 2.62 MiB |
| **total** | | **12.11 MiB** |

Sprite atlases are lossy WebP q92 with lossless alpha; atlas-kit sky/horizon/ground q84, era world layers q80.
Budget: all six kits ≤ 16 MB.

## Source checksums

#### eldritch

| Source | sha256 |
|---|---|
| assets/bases/ember/critical.png | `71caa99a61d6d03efa6b9f61c415841e23fd9d2b85e5cdc16c812af35146742f` |
| assets/bases/ember/damaged.png | `eea162428daea469932187f9f063aca7530063526fb12fec68f700d76de9b3bd` |
| assets/bases/ember/intact.png | `96fbd0ac77469c0ce8baf2f93497301aa448535abbf5467f788e41dab701a783` |
| assets/bases/ember/ruins.png | `b481ac9d47b899bc1740c31c9be486632ea29b1970c1f747594bcb775b9efba6` |
| assets/bases/storm/critical.png | `911c76c60a3c2f026e89492a5d935fd5fe078caf29985c81fcb53c84ec227d46` |
| assets/bases/storm/damaged.png | `6f64347bc975b4e166d8c24a0413ba893269b6ad77c7b82500d2147bea8487f9` |
| assets/bases/storm/intact.png | `02af98dee884855d60f67f5d039acc8b4f4465343ed9599c179a460473f51ce6` |
| assets/bases/storm/ruins.png | `185e9cf61b995578d1b9d0f1186f5f2eb51c141a6cf1f6c9b8ed589dc6f10395` |
| assets/boss/abyssal_strider_parts.png | `f68c4d3fd29118b889510ed84d0052ca1997b7e49a67cec6e06608bddbcc00b8` |
| assets/boss/hollow_regent.png | `ff8c77034af47c12db79eae8af79dabd36ad71ee843e5170da27cc586310fb3a` |
| assets/boss/hollow_regent_parts.png | `1905ffb0496767dd64a5cca101b127d379e6daa7f92fe4f053622eb62e9cd994` |
| assets/effects/battle_effects.png | `375f82dbc6bfc271970c564906045d6b13d862d93875bb92ef2407aa134478cf` |
| assets/environment/aether_wisps.png | `579df0b1eabca50e21ff57a6b43b4905850733203d31192fb73f424fed322188` |
| assets/environment/foreground_props.png | `c5cfd9657cf9709dfd65ca748ea14ae5035fccc474ce7f059018a2bcd865d70a` |
| assets/environment/ground_tile.png | `d9050acaff007e6f402ae19ecb859657e4611c3c4f600b129f8f9e27e71ee1fa` |
| assets/environment/horizon.png | `72475ad7b29ba8064fd75b3acc6feb792bcd62dda5bf35b3d9bf389fdc321d92` |
| assets/environment/path.png | `748199ed2caf7cc51e385685a482c046a319e32783d790e8eb3ff0b905ce8629` |
| assets/environment/sky.png | `b4659cd9f0ddd5daa9190b8b8d9f4480e2168d4f3c2f40a7ed3cc472619aea9a` |
| assets/ui/icons.png | `e8e0e3ecf4a6932d676fcca007759c313fa0acfdd5a0af886b51d412ccf29a09` |
| assets/ui/logo.png | `ffb30679f0ff0f812a228d4d8683d3ca340073903e78297a88597823feb4ed7e` |
| assets/units/ember/riftblade.png | `fdc441d0cf2e8bdcab466daee04f62a5c715297d447ae687adb75cd2c4b1558d` |
| assets/units/ember/riftblade_parts.png | `8b1ec4ddd55b0336dd9f2191395aa99d6f55f366c49c1557aca7ba27af6efbc7` |
| assets/units/ember/voidseer.png | `5ccc3f30af00ba30eec433f4593bccee7749302cb01e6be90397c9be4c1e9f93` |
| assets/units/ember/voidseer_parts.png | `5a00c670e9ee79d36959e13ece970062d77f3c4584b804b6644ea366ecc11521` |
| assets/units/ember/warden.png | `f74e4da5b9412db227f14bec6fbc7e590c40b2f0ed4054618545b86bb52e37fe` |
| assets/units/ember/warden_parts.png | `f87b20a263b5b935f3966fb0630d54d164546c132dd05c6f1b14ae683846df38` |
| assets/units/storm/riftblade.png | `a488e1bde598b8c7812f5a61284e246e4b510cf807a16a8e3676b37d0a5155bc` |
| assets/units/storm/riftblade_parts.png | `1c2cb60f37f5b3d20333903dd2c8653a08b90bad3faaeea61ee4c1530ed28634` |
| assets/units/storm/voidseer.png | `1a960306fc50fb7b5916162dff128760955330e99fc2fb10a815372b8b971a0e` |
| assets/units/storm/voidseer_parts.png | `bc45d965de1f4c00916b0edb444207fc670353235ab8e463506438ae9146dcdf` |
| assets/units/storm/warden.png | `e6a0ef970501e5c65f3da7a2be6b81fb388d51e18a1f8d56d13aecfc29cfcb06` |
| assets/units/storm/warden_parts.png | `f8d142cb65a9154c9bc26093424c438dd74648a0528fc02275b9da8cac1565d4` |

#### future

| Source | sha256 |
|---|---|
| assets/bases/ember/critical.png | `e635efae8eac642f6853f251d6a829c87735983086d4465af4222d796e03f4b1` |
| assets/bases/ember/damaged.png | `6b9ebb5cb8c2f88316723adf0a19c235387e40c2e98f03b7b6250fc1b9dedd92` |
| assets/bases/ember/intact.png | `ce128e71eaf7de60507af6bfacab87aec490bbb9c66ce2c8260dc247bf8e5863` |
| assets/bases/ember/ruins.png | `68bd5597056e70701a26c16b23940be39cb926712b97476df379c13230dff046` |
| assets/bases/storm/critical.png | `88d40675b12c45583e763c63a13eceefb37abf9544d4607aa2fc7ef34fcd6f91` |
| assets/bases/storm/damaged.png | `96d2c4ebf613eb8492907596ec0002135dc9221dcb7b2d9f0192db6088d908cc` |
| assets/bases/storm/intact.png | `13e857d2a723b4d116cc7de5693354272a0ee28577118ef3f3b800d8331d1091` |
| assets/bases/storm/ruins.png | `2983e33ebffc057544b8c41cb9a927018987bb27f853dd12e6db6668ebca13aa` |
| assets/boss/commander_parts.png | `faeea1fc3182193a13f9c4987058ac74b1b8895f25c15ea4bc9f07813a7ae286` |
| assets/boss/siege_commander.png | `3a53c4531f67c3c7fe7f2a47584e8ac33b28157bc5c2b14d1947b3ad6a874b14` |
| assets/boss/walker_parts.png | `f941ffb0545caf1aaa844ea6752fe8a12285b09e5292108555ee8b08864e9ddb` |
| assets/effects/battle_effects.png | `5bd217688a6ed10150223f929242cda588f3e585ee52e1f4fcb30e6eda93426c` |
| assets/environment/clouds.png | `64b90297e07f3709a1840b6adb13566474d1509d8f5f1a9cbf3671fb2f9de7c2` |
| assets/environment/foreground_props.png | `e7ecf11eb991ede2f52acae9de188b55d8f62532bb6fd856bff2b6e8b0ca246a` |
| assets/environment/ground_tile.png | `e0ee33d181205bb7410723e8e3877b4434f2d8c560b31a015ea58309df914140` |
| assets/environment/horizon.png | `8e278728c216d57aced8f784fb387e30a30267646cb395dd350391516156670b` |
| assets/environment/path.png | `94ea85b4fd95fc619d3b26ab56e92a8e5e6138956be64c0c2036a3c2b0716092` |
| assets/environment/sky.png | `ac1bf5589942e7b562fc04ed84c7905a4b2e97d7800d787b1e51ef2a611ffb67` |
| assets/ui/icons.png | `3ab88c6bc7280df10253409aa8c8429c69825ee4f98b8b069f4c08ecd0c1fd3e` |
| assets/ui/logo.png | `6ecf811066471a2c5bbe6f361c36cb4defe81b37e6c1aec19c7895bcf544a3b1` |
| assets/units/ember/heavy.png | `865992c0d892f6727b25996840555c2c8419ea552866e01fd27e90310394effd` |
| assets/units/ember/heavy_parts.png | `0c17e4433d481eebd2fc1258539d085dc1baa4981e717e82788b239002c9ffcb` |
| assets/units/ember/marksman.png | `643e2409d2575ba271cfe7884888e603e7532095f45b734cf06a689bf9a6dc1c` |
| assets/units/ember/marksman_parts.png | `6053b6a5e65eece6c2c34212273d600e3b8977b195167871883e535e14b2e538` |
| assets/units/ember/rifleman.png | `587cdb2d390f3468e9c85254b86e75b20b5ae80083bd3404dca7101d7e35124a` |
| assets/units/ember/rifleman_parts.png | `39621fc7656b2b6af7897c53f2d2d9e14539d7da84c86f6fbc2fd1d8329c5571` |
| assets/units/storm/heavy.png | `5cc21868212d7c439a5269ddf6fa781c282598498349ac9056481a1e708b69e5` |
| assets/units/storm/heavy_parts.png | `3f035ec261af2e5cf7e28ebd85f54eb0decb06257fdabe45bf3415003727ad84` |
| assets/units/storm/marksman.png | `c204f5d85716f8e0a78e13faa36588982b2230ca5e0e9a3893b612521dd5a7f5` |
| assets/units/storm/marksman_parts.png | `d1d61a4710402161f61f18c5248c08fd49484f05f7f6d30049cffec1d9756404` |
| assets/units/storm/rifleman.png | `58e3c11805c94157c9607ac3583be7efc1ed91faa5416abc44e17591efeeb04e` |
| assets/units/storm/rifleman_parts.png | `cd6f8ac84515df5f566c0bf52f4e84e290fabddb8be15941b67c48dc934a664f` |

#### primal (pack path `sources/primal/…`)

| Source | sha256 |
|---|---|
| ember/boneguard.png | `ce3d3ed00da1e0b027522b2dad985b8d0f70cfac41619a32b599420d2636ebe3` |
| ember/boneguard_parts.png | `7f0eef7d8d827cfe93232612c8390d27d4c1c1ac89f73f680e7a8c55efca583e` |
| ember/flintspear.png | `38ef166bc8f733db76b48503921bc4ca6f0a1ba2f52d992f9e45aa1a071822ca` |
| ember/flintspear_parts.png | `871ffef43f20c1481459739be9d217d9d4bc07e6065798af3c3f95e0878ffa89` |
| ember/fortress_damaged.png | `42375f5969b6ed8bb2b86300c139f3f4d0a9ad921578537ed4d693a23952091d` |
| ember/fortress_fallen.png | `409e84eff0c5572d855ef572ebb63bb8e48b9291ee2f8939bab656f789dd0b28` |
| ember/fortress_intact.png | `ac59d1596cd2955c823d1e0466fb10702f1ac67ce2928b2ae22f9ef3b734e14b` |
| ember/fortress_nearly_destroyed.png | `8ab466171d9bb74197f6a9601de4aebcd70e60271facbcd0c57e3f8895a7d9be` |
| ember/slinghunter.png | `d70e5dc0baf8074e6720bc11143a0bf751e5d5d3c55802bc169e3ce59f9d24f0` |
| ember/slinghunter_parts.png | `df898de6cad0f6d3c554aca9192f4a8650c53d3b1d264e2a418c4836b12bd599` |
| ember/warlord.png | `4b642d6ba08ea73a16d63bf84b5f0b24b09c2f01f9f8160e0a6748fc665af0a6` |
| ember/warlord_parts.png | `4aa21fc9a0c7f0a81d766ca9a9e7a73dfe762bb7b6f0aa7a8b2b7762fb0fa666` |
| storm/boneguard.png | `b480a4b6391585722bdd69a52f2335affb3c8c562f8f8c17807cdaffd50d3418` |
| storm/boneguard_parts.png | `a5c5f928b57cbc21ae14d8dd42a44bbd58499e7cdc132e2ff0c4075c3d4876f3` |
| storm/flintspear.png | `cfdd4eacd080940b1d1f77947a429054a14a1a3be6867a2f22c42011557f3fbf` |
| storm/flintspear_parts.png | `6c14906dd9fd429d834b4458d2149e73828d8e734bb3e27ca938b356221e7b8f` |
| storm/fortress_damaged.png | `d5bf66ba839877a956601e7759e150e4a5c6426fd8a52bd6cbba30caadd92beb` |
| storm/fortress_fallen.png | `00655413d5d1b7eeac65d004efea029a01a0712fe8ba0a8b7e0bfde7a5cb801e` |
| storm/fortress_intact.png | `9b18271052ffac5f1eaae34e015571780b889ca3aa83f58e035f0fb2d5eb1e85` |
| storm/fortress_nearly_destroyed.png | `2c8efeea334598499ad7b951ce087e5dad4b33c3ca47dd20dd274ab5da701fcb` |
| storm/slinghunter.png | `b040fe73fcfa302f6d7729efd8fed6cc2d29423aee953b8aa647f3bdfc401bda` |
| storm/slinghunter_parts.png | `878554ebb9ee98fb34a43a1b7aaa2e8dc9a2fbb54e19b5ccfacaee662d4f6f5e` |
| storm/warlord.png | `dc8f7139d3b5e3293df5db7c45d7d3a0509fcca29c8a8d6056f276bbe66e39f8` |
| storm/warlord_parts.png | `2dc4dc6063586eab125c1855c3e0f8c996c2391a95981f9ef2bb836441624107` |
| world/distant.png | `a00e207ef88a2b0c91008af60a9c2e4a552480667deccae48d6c31e4e4e91a33` |
| world/foreground.png | `120334b6eb31bcb802293c5a4165338184b035c41139b5d229528a772a97adbd` |
| world/ground.png | `2a7027adf407981001660b612ddb107e3f96891099c46dbab699dc9b895cfda1` |
| world/midground.png | `1b47f7e3cf3db1a15d717d950a53bfec83a71cd2e1d2f9d907bfc3f5d41258f4` |
| world/sky.png | `ea6675107e7a27c2017c75299008af13dec5e01deb743b5b8834fbb25414f6b1` |
| world/weathered_totem.png | `74c93f593b1e7b5a4f542757c9e0cb8764a756cc351246c41b3675b0175b0b55` |

#### ancient (pack path `sources/ancient/…`)

| Source | sha256 |
|---|---|
| ember/bronze_guard.png | `ea3feadf88c7bd6bd0e02e54d62ade72c285093e4597d081b4016ee9190c4b64` |
| ember/bronze_guard_parts.png | `a11ce56d76f4b0da6dcb55494e9764542d600b43a3c406688db3ffc79080bc25` |
| ember/fortress_damaged.png | `b52106a3f3ec52f94b8b5784c196c2f0ddc7b7c288c17b59a29f61f90dd9ee12` |
| ember/fortress_fallen.png | `e11c6c89d04b39dec3bf39d32c91b07e544f76967022c1862988c379b06db70c` |
| ember/fortress_intact.png | `152a11fa4b481c354c734c751f7bda569249656041b6a131a8d53ff5793df49e` |
| ember/fortress_nearly_destroyed.png | `2f9cdc97629260d7f386b65851d6bc3c283cf6e42af1f1b8bb6497658bef5327` |
| ember/longspear.png | `6f331414cf5e2f132187cb3f968a54b8c40cb4c8a798797dcacf61d02ff23294` |
| ember/longspear_parts.png | `b1c3b18654d30cdb89adf1234913bcb42aaed123367b7aa41ee1af756fda4b81` |
| ember/warbow.png | `7518f82940cc482ca117844714d7553999e591a2805b24313384f8dcb5ddbfb4` |
| ember/warbow_parts.png | `c1b218b4e1b1c3319f13245e31c620c61aec8acd657d0ede66f335ca714d924a` |
| ember/warlord.png | `bf56c5b3a2689d18a44ef4337295df7b69e5cde1167d37c232990a664e6bcda9` |
| ember/warlord_parts.png | `334f412b1806a46d80216c68597d243871bebc1e6961260c748dbc7d164d5a04` |
| storm/bronze_guard.png | `bb9c7210f994af6fe469940428047ec73010d81bdec4f5f495a122b6e8bc1538` |
| storm/bronze_guard_parts.png | `a06cb5441185291aabf4bd0e7cb5b27b86f6dbf9f4fb6717b175e363b7699629` |
| storm/fortress_damaged.png | `3adb6b4a125b01c97b75936f80e5dc7454aa6b7fe2251539386ca5f9ac05c66b` |
| storm/fortress_fallen.png | `27f25aeb1d404263843beaa9d9a4624bbc5e04f127a7ca7a64fb6b8a8736c59c` |
| storm/fortress_intact.png | `6d206721353a10321b2a676d99095d91ed3f44803c215a831d8c5e76dfb86d9a` |
| storm/fortress_nearly_destroyed.png | `75c676a76707594973f2e4ed984987eff26cb0be7e818e16d43738e4f87fb6a5` |
| storm/longspear.png | `35570b1d3c92ed9455e8cd97ad8fff77fb2ab3cef1ee490987d26dd6bd4b61f9` |
| storm/longspear_parts.png | `76098f414202a49ecdeb373110e67db6293b515aa6601af5f0d8a9055ad34b5b` |
| storm/warbow.png | `b302719005469ffe7079a51898797f9951a3675f04d8ca4f01bbb6af54543689` |
| storm/warbow_parts.png | `035e2cd5dbda3b50ed961b41e6bebeb18979c14b06560303c26b98cb67aa4a2f` |
| storm/warlord.png | `82aba65b572b40b2dfb47b35b4ca5fa2a59a98be03791a6b1558f29cb20d0abe` |
| storm/warlord_parts.png | `a9b5ee3ce9cd56e37f418e8e2dcf194fb50afbd7a49c0374ea6f2513785bd99b` |
| world/broken_standard.png | `d9c04cae7153b5b065a2e3e5e4b2b3cc79465b71bb6ff200977ead7e724359be` |
| world/distant.png | `6d4bcea9c92bebe99391efa3916bc2d31c9b26fab23c84413a6b6d3972ede4b3` |
| world/foreground.png | `c37e8a5d999a4b654cf9bdb9c5893dec6e8794d839c271132befc1b85184ce5b` |
| world/ground.png | `99555f282bec34672231e0ce74457a0f7d6135b4caefc5303ece7993d5fad4c9` |
| world/midground.png | `268458514c4d991b3f10a8d6006d517a1a94fe26cab13711f5e9251dfad4f323` |
| world/sky.png | `185f0a3a5b5db461d145b3dfe53b8c5ab0721c66e31c856b4e9a9e0fe076f47a` |

#### gunpowder (pack path `sources/gunpowder/…`)

| Source | sha256 |
|---|---|
| ember/fortress_damaged.png | `894c317b9718fed6ee9150ea9ae83c278e8823e61519ca6c0dc32b25806db7be` |
| ember/fortress_fallen.png | `566c052d2ed98f2f6e2bc8d0946449472d23c728f392a830f5b0ef473ea2ab6c` |
| ember/fortress_intact.png | `5f430b358f9e82d876c7d74724d1f39f497d5f579dc38bdaccf9a851cc9dbec4` |
| ember/fortress_nearly_destroyed.png | `3bd51e026773092071c8a3bb86c73c879b6a4ac87ba79181372c3847183ef476` |
| ember/grenadier.png | `a999349e257d75bee0f810b0e631ea1b23191bd869d59eac8a0af7aa786e9f1c` |
| ember/grenadier_parts.png | `7769b510595691b6f8dcf5b6a0998adfdb0b925456b5eef11f27b9025c557b0d` |
| ember/musketeer.png | `d51b67889aca24cb31bc71cdee7f249b6224cc7af4b03b457b5aded04d844b30` |
| ember/musketeer_parts.png | `3c4ab126b4e85a4361d3b8a793c7c829b1e297ef395bd63335ea46ee6a5f53aa` |
| ember/sabre_guard.png | `dfaa313704f9d39499bbd3070d82aa42579235702e5c4ff256f17fbaf25c4e3b` |
| ember/sabre_guard_parts.png | `e4db594ce4ac01cde17d8da169c97fabffab878467dd115e10603f7e2091ae7e` |
| ember/warlord.png | `4843b40d6d4f12213f836298c17e959a00e450bd4ab59e47f2e890225b80d1f0` |
| ember/warlord_parts.png | `8912811b5a4dec9b230006464e2200d6c71cedb2f83806715b88fd643bad043e` |
| storm/fortress_damaged.png | `31f8f6ffc4f980a0c200e01feedb40ab7ec954145c781de0094e7d37ee5908c8` |
| storm/fortress_fallen.png | `fbeb8992e9d9cfcc70291606c5a41358704be4a080a7f3be8a595d6d16046e48` |
| storm/fortress_intact.png | `2dafaa1a5c7a29b6259d192ac0347121be99b3ca66a2f128ee5a5b27d1bb2d4a` |
| storm/fortress_nearly_destroyed.png | `ccbbd96c01610ce690cba211f6826ae07570ea356da9286cb315094022fe2eb7` |
| storm/grenadier.png | `747c29bc3f59a978247ad8c8906e17759235fe07f9ac3f63fd7e9a5332d41f44` |
| storm/grenadier_parts.png | `8e08ec65483a1bcf132c40a395fd8f05d47cf65a00196af7a8daf58443de959b` |
| storm/musketeer.png | `9b6bd57625c28f92d8371bc1f19c92a01beddf57686243654ffcb4d932457179` |
| storm/musketeer_parts.png | `6e2f0a09431832663f7f2d66b085b9057a6275e6e2f8e006ab456ead7af0aa05` |
| storm/sabre_guard.png | `3c2230a27c423902df2d094390e9a5b079aa527fae6aafe83061f62d81be6d23` |
| storm/sabre_guard_parts.png | `52a9fce36c87e61bf043bb8e1caf32ae7eea8614d609e86898ca912844c57977` |
| storm/warlord.png | `a65469e69a60b9ea59046d476d12b7c698fd40dc679104387136f4a50d0ddf49` |
| storm/warlord_parts.png | `83dd810e0620f48d4247113c27b1ba85900ec5063c3e2540e6a4aaf9f63d9c49` |
| world/distant.png | `5f4d06037a54fcf70762ad10e29e346b8ccad6eebe310ea7fa048606741a6ce3` |
| world/foreground.png | `1aab13522af175166b7959ce03e6e7ca80994f1b84740eb4ad70b4ae8a96c2b9` |
| world/ground.png | `35150a6a6ae8f5fad5ac6c3c77713fc6118576b9ac739e00501f1f26510d2136` |
| world/midground.png | `3c2a6513b7a4b399f85df33f024fdcf67173e9ccec38774bce8628a839995848` |
| world/sky.png | `0bea5b1be495c6e44d8222982ee5b058ca57ff6fe4ac0a7ddc3323615deb901c` |

#### industrial (pack path `sources/industrial/…`)

| Source | sha256 |
|---|---|
| ember/fortress_damaged.png | `9a17f633e005372b9bccedb16380a219d2e54073f2a844cdd10ea69fdf65356e` |
| ember/fortress_fallen.png | `c01a58ee2157b861aaf381e76cc113291457bacefce9fbd23815f7e2a50391f0` |
| ember/fortress_intact.png | `25e7e25a82be35bd6abaaf45f700268e4f17ce34b61dfc812bcda3e2a322de4b` |
| ember/fortress_nearly_destroyed.png | `d50bffe8a775747ffc6675ad38d22bffff2132c60e26f989ee6290bd9db9aff0` |
| ember/heavy_gunner.png | `00eae53a92a90053525a7c7f669ea01de3d726086320b44993a5fb13a13fe7b3` |
| ember/heavy_gunner_parts.png | `38988fd6a90ed17ee2a0cfa5b2cb4a973f87ed091170b76914d3b4e776b75131` |
| ember/rifleman.png | `c97e908d52d459d73ee354b6c321cac7c43e312758f6b1452995f7dcbfd25ebb` |
| ember/rifleman_parts.png | `a63bb3407771d0a320e16918fb5a20b500e6c479eac2f4047970096452f6f21e` |
| ember/trench_raider.png | `ac39aca62c89c10cff2328e14478a5c509c674a517232baf510751d9ed60d83c` |
| ember/trench_raider_parts.png | `320dbd3d8ce037323f4b95be74018b5877e079467b11678b8ad68c78148b42ce` |
| ember/warlord.png | `15f9b989c07fd97f58895b958ab113c665aeaef0c2f0e9c751780e32ee13ab34` |
| ember/warlord_parts.png | `11a15e520fca6a81e22de3df8c6c301abf03bd364e1c1e462b5ff04f4019e61d` |
| storm/fortress_damaged.png | `45b313616743030c8192d7dc83e9464534daa56bbe941cb35468b0cbd5b7e612` |
| storm/fortress_fallen.png | `d63aecadef4860948a669bc984d526514f7ab33f0f568d24c19abefc714b3fee` |
| storm/fortress_intact.png | `778e41cc6eacfc6d694cc370473fd55530a3643a0f712aeac2a3e3f37d582112` |
| storm/fortress_nearly_destroyed.png | `a9694b597fe66d67921f283e08cd4f516db1b7bb346cf50a345c1b05d191cd6c` |
| storm/heavy_gunner.png | `eaf67dbecc430b12c0c066c1feb497a6e8524608e8ffd53040815d3a4e6c20c1` |
| storm/heavy_gunner_parts.png | `841f28819efa04be3b4df5a555442869ad627c66c6658adf4d79c11e5370079a` |
| storm/rifleman.png | `aa187cd451572b64e95db681664245df6d7062d760c3e6725c3d714967ec6f27` |
| storm/rifleman_parts.png | `b6f58eb0741f64c7003a02e03f7ef582aef13b9d0137350f690b4ec97880ec67` |
| storm/trench_raider.png | `37dc02c04340a65f10c986610d8f9532e2a05fff18aefc09499e5f035e0370b4` |
| storm/trench_raider_parts.png | `05936466ca932fbfd908da8b6d59ea7c25c0838f35cf4e9559669f2b60df3cdb` |
| storm/warlord.png | `41af853893bc2216c65e737587cda946204b2f303172bb674e3b61193a7d1ee0` |
| storm/warlord_parts.png | `6f9d2bd190233f9d5861a9c4e34fbda18c66eb1dc2ddd7487e7ccaa92d7c00ca` |
| world/distant.png | `2ce32f05a0ab605995886b7d19b4b491a690b6bbf11a5cf8c231e38ff05caf87` |
| world/foreground.png | `5d89bbd6634f69a46447d87b34560cfd7c0ce159d525a3380a6063bc1c378aaf` |
| world/ground.png | `ef58e1ce1639d5d3913ccd843f1e2af644a28d7ea9a1eca9b19f631aca238d12` |
| world/midground.png | `d693d3cfe423217b65491cd0edd1ffc8e4ff0a6bc29009173be62d4ea891504b` |
| world/sky.png | `975475211f25978fccd08ca747e537b89b35bac160d28da74912171a9a2c3d98` |
