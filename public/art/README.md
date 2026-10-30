# Art kits (STORMGLASS)

The game is drawn with two finished pixel-art kits supplied by the owner. This folder holds the **packed, in-game
copies** of those kits, built by `tools/art/build_kits.py`. The ~118 MB of source PNGs are not committed.

## Provenance

- Source: Google Drive › Portfolio › Stormglass › Assets
- `eldritch` — atlas title **"STORMGLASS — Eldritch Era"** (`eldritch_atlas.json`, sha256 `551d48c89c05bf16def1288ea3e31a387394e3101429deddb250be7b3e7ae296`)
- `future` — atlas title **"STORMGLASS — Future Era"** (`future_atlas.json`, sha256 `2a478e1efac8eaa41fff3dac480f4ac85251f930c56b60da4359929526369e8f`)
- Every source PNG is verified against the sha256 in its atlas before anything is built (list below; also in each
  `manifest.json` under `sources`). `Mature_Six_Unit_Lineup.png` is a style reference only and is not used.

Which Age uses which kit is one table: `src/render/kits/ageKits.ts` (Stone, Ancient, Medieval → `eldritch`;
Gunpowder, Industrial, Future → `future`). The unit and Warlord names the UI shows come from the same table.

## Rebuild

```sh
# <src> holds eldritch/, future/, eldritch_atlas.json, future_atlas.json (unzipped from Drive)
python3 -I tools/art/build_kits.py --kit eldritch --kit future --src <src> [--preview <dir for PNG copies>]
```

Python 3 + Pillow with WebP support. The build takes ~2 minutes and rewrites `public/art/<kit>/` completely.

## What is in each kit folder

| File | Content |
|---|---|
| `manifest.json` | Frames (atlas page, rect, anchor in output px; units also nominal height and muzzle point), images, unit/base tables, source hashes |
| `sprites-0.webp` | Hero sprites of the 3 troops × Storm/Ember, the mounted Warlord, their white hit-flash silhouettes, weapon/shield debris parts |
| `bases-0.webp` | The base in 4 damage states × 2 factions, one common scale, ground anchors applied (eldritch `baseAlignment.scaleToReferenceWidth` folded in once, here) |
| `fx-0.webp` | 9 battle effects, 5 wisps/ion clouds, 10 foreground props (masked atlas regions; effect glow halos kept) |
| `sky.webp`, `horizon.webp` | Portrait sky (opaque); horizon band trimmed to its opaque foot |
| `path.webp`, `ground.webp` | Lane strip mirror-joined horizontally (A + flipped A), ground tile mirror-joined 2 × 2: plain repeat is seamless (the source edges differ) |
| `logo.webp`, `icons.webp`, `portrait-*.webp` | DOM UI: wordmark, 4 × 4 icon sheet (order in `build_kits.py`), upper-body troop portraits |

Processing: region masks (`maskRuns`) are applied; source alpha below 16 (stray generator specks and a faint dark
fringe) is dropped on sprites so trims are tight and nothing dirty shows at game size; resampling is premultiplied
Lanczos; atlas pages are ≤ 2048 × 2048 with 2 px padding.

## Resolution and sampling

Sprites are pre-scaled to ~2× their on-screen size on the reference phone (soldier ≈ 240 px for ~76 pt, tank ≈ 360 px,
Warlord ≈ 600 px, intact base 600 px), so a DPR-2 phone draws them slightly downscaled and an iPad still has pixels
to spare. The sources are generated "pixel-art style" images with no exact pixel grid (≈ 3–5 source px per art pixel),
so there is no integer scale to snap to. The runtime uses **linear filtering with mipmaps**: nearest sampling of a
downscaled sprite drops and doubles pixels and shimmers as troops bob and walk (see the comparison screenshots in the
M2 report). World sizes live in `src/render/kits/sizes.ts`; change sizes there, not here.

## Size

| Kit | Files | Bytes |
|---|---|---|
| eldritch | 13 | ≈ 2.8 MiB |
| future | 13 | ≈ 2.6 MiB |

Sprite atlases are lossy WebP q92 with lossless alpha; sky/horizon/ground q84.

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

