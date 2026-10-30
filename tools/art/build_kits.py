#!/usr/bin/env python3
"""
Offline art pipeline for the STORMGLASS art kits (see public/art/README.md).

Reads an unpacked kit folder plus its atlas JSON, verifies every source PNG against the atlas sha256, cuts the
sprites and masked regions the game needs, trims and resamples them to in-game resolution, packs them into WebP
texture atlases (each page <= 2048 x 2048) and writes a JSON manifest for the runtime loader
(src/render/kits/manifest.ts).

    python3 -I tools/art/build_kits.py --kit eldritch --src <dir with eldritch/ and eldritch_atlas.json> [--out public/art]
    python3 -I tools/art/build_kits.py --kit future   --src <...>

Only Python 3 + Pillow (with WebP support) are needed. The output is deterministic for a given Pillow version.

Resolution: everything is pre-scaled to ~2x its on-screen size on the reference phone (390 x 844 pt) so a DPR-2
device draws it close to 1:1 and an iPad (1.6x larger world) still has enough pixels. Sizes below are the pixel
budgets, not gameplay sizes; the runtime decides world sizes (src/render/kits/sizes.ts).
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import sys

from PIL import Image, features

# ---------------------------------------------------------------------------------------------------------------------
# Kit configuration

# Pixels per source pixel for each sprite class. Soldiers: a 1100 px tall source figure becomes ~240 px.
SOLDIER_SCALE = 240 / 1100
TANK_SCALE = 360 / 1100
BOSS_SCALE = 600 / 1009
BASE_INTACT_PX = 600  # intact storm base visible height; every state of the kit uses the same factor
ALPHA_MIN = 16  # source alpha below this is stray generator noise / dark fringe: dropped for sprites

KITS = {
    'eldritch': {
        'units': {'melee': 'riftblade', 'ranged': 'voidseer', 'tank': 'warden'},
        'boss': 'boss_regent',
        # debris that flies off on death (atlas part names)
        'debris': {'riftblade': ['sword'], 'voidseer': ['staff'], 'warden': ['maul', 'shield']},
        # muzzle / casting point and portrait crop box, in hero source pixels (storm variant; ember mirrors the pose)
        'muzzle': {'riftblade': (1180, 120), 'voidseer': (296, 456), 'warden': (180, 800)},
        'portrait': {'riftblade': (400, 90, 880, 570), 'voidseer': (410, 70, 890, 550), 'warden': (470, 50, 1050, 630)},
        'fx': {
            'hit': 'hit_spark', 'impact': 'rift_impact', 'dust': 'dust', 'poof': 'defeat_poof', 'projectile': 'projectile',
            'coin': 'crystal_coin', 'strike': 'rift_strike', 'scorch': 'scorch', 'swoosh': 'swing_swoosh',
        },
        'clouds': 'clouds',
        'props': ['crystal_cyan', 'crystal_violet', 'rock_small', 'rock_medium', 'rock_large', 'alien_fern', 'fossil_bone', 'void_flowers', 'mask_relic', 'column_stump'],
        # sky focus (0..1): the point kept in view when the portrait sky is cover-fitted
        'skyFocus': (0.72, 0.22),
    },
    'future': {
        'units': {'melee': 'rifleman', 'ranged': 'marksman', 'tank': 'heavy'},
        'boss': 'boss_commander',
        'debris': {'rifleman': ['rifle'], 'marksman': ['rifle'], 'heavy': ['cannon', 'shield']},
        'muzzle': {'rifleman': (1240, 412), 'marksman': (1222, 420), 'heavy': (884, 742)},
        'portrait': {'rifleman': (390, 90, 870, 570), 'marksman': (320, 70, 800, 550), 'heavy': (340, 40, 900, 600)},
        'fx': {
            'hit': 'hit_spark', 'impact': 'plasma_impact', 'dust': 'dust', 'poof': 'defeat_poof', 'projectile': 'projectile',
            'coin': 'credit_coin', 'strike': 'stormcall_arc', 'scorch': 'scorch', 'swoosh': 'swing_swoosh',
        },
        'clouds': 'clouds',
        'props': ['crystal_cyan', 'crystal_violet', 'rock_small', 'rock_medium', 'rock_large', 'alien_fern', 'conduit_relic', 'luminous_flowers', 'broken_drone', 'supply_crate'],
        'skyFocus': (0.62, 0.2),
    },
}

# Output scale per effect (px per source px); effects keep their soft glow halos.
FX_SCALE = {'hit': 0.5, 'impact': 0.55, 'dust': 0.5, 'poof': 0.5, 'projectile': 0.5, 'coin': 0.5, 'strike': 1.0, 'scorch': 0.5, 'swoosh': 0.5}
CLOUD_SCALE = 0.5
PROP_SCALE = 0.4
ICON_CELL = 128
ICON_ORDER = ['credits', 'food', 'stormcall', 'battle', 'army', 'ages', 'walls', 'melee', 'ranged', 'tank', 'boss', 'crown', 'settings', 'pause', 'speed', 'locked']
PORTRAIT_PX = 256
PAGE = 2048
PAD = 2

LOSSY_SPRITES = 92  # WebP quality for sprite atlases (alpha stays lossless)
LOSSY_BG = 84  # sky, horizon, ground


# ---------------------------------------------------------------------------------------------------------------------
# Image helpers


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def clean_alpha(im: Image.Image, floor: int = ALPHA_MIN) -> Image.Image:
    """Drops near-transparent noise (alpha < floor) so trims are tight and no dark specks/fringe reach the game."""
    r, g, b, a = im.split()
    a = a.point(lambda v: 0 if v < floor else v)
    return Image.merge('RGBA', (r, g, b, a))


def resample(im: Image.Image, scale: float) -> Image.Image:
    """Premultiplied Lanczos resample: transparent pixels never bleed dark colour into edges."""
    w = max(1, round(im.width * scale))
    h = max(1, round(im.height * scale))
    if (w, h) == im.size:
        return im
    return im.convert('RGBa').resize((w, h), Image.Resampling.LANCZOS, reducing_gap=3.0).convert('RGBA')


def apply_mask(im: Image.Image, runs: list) -> Image.Image:
    """Region masks: [rowY, startX, length] runs inside the crop; alpha outside them is cleared."""
    mask = Image.new('L', im.size, 0)
    px = mask.load()
    for y, x0, n in runs:
        for x in range(x0, x0 + n):
            px[x, y] = 255
    r, g, b, a = im.split()
    from PIL import ImageChops

    return Image.merge('RGBA', (r, g, b, ImageChops.multiply(a, mask)))


def white_of(im: Image.Image) -> Image.Image:
    """Flat white silhouette with the sprite's alpha (hit flash overlay)."""
    w = Image.new('RGBA', im.size, (255, 255, 255, 0))
    w.putalpha(im.getchannel('A'))
    return w


def trim(im: Image.Image, anchor: tuple[float, float] | None = None):
    """Crops to the alpha bbox; returns (image, offset) where offset is the removed top-left (anchor shifts by it)."""
    bb = im.getchannel('A').getbbox()
    if not bb:
        return im, (0, 0)
    return im.crop(bb), (bb[0], bb[1])


def webp_bytes(im: Image.Image, quality: int | None, lossless: bool = False) -> bytes:
    buf = io.BytesIO()
    if lossless:
        im.save(buf, 'WEBP', lossless=True, quality=100, method=6, exact=False)
    else:
        im.save(buf, 'WEBP', quality=quality, alpha_quality=100, method=6, exact=False)
    return buf.getvalue()


# ---------------------------------------------------------------------------------------------------------------------
# Packing


class Packer:
    """Shelf packer: tallest first, rows across a 2048-wide page; a new page when the height runs out."""

    def __init__(self, size: int = PAGE):
        self.size = size
        self.items: list[tuple[str, Image.Image, dict]] = []

    def add(self, name: str, im: Image.Image, meta: dict):
        if im.width + 2 * PAD > self.size or im.height + 2 * PAD > self.size:
            raise SystemExit(f'{name} is {im.size}, larger than a page')
        self.items.append((name, im, meta))

    def pack(self):
        pages: list[list[tuple[str, Image.Image, dict, int, int]]] = []
        order = sorted(self.items, key=lambda t: (-t[1].height, -t[1].width, t[0]))
        x = y = shelf = 0
        cur: list = []
        for name, im, meta in order:
            w, h = im.width + 2 * PAD, im.height + 2 * PAD
            if x + w > self.size:
                x, y, shelf = 0, y + shelf, 0
            if y + h > self.size:
                pages.append(cur)
                cur, x, y, shelf = [], 0, 0, 0
            cur.append((name, im, meta, x + PAD, y + PAD))
            x += w
            shelf = max(shelf, h)
        if cur:
            pages.append(cur)
        out = []
        for items in pages:
            pw = max(px + im.width + PAD for _, im, _, px, _ in items)
            ph = max(py + im.height + PAD for _, im, _, _, py in items)
            # round up to a multiple of 4 (texture-friendly) but never past the page size
            pw, ph = min(self.size, (pw + 3) // 4 * 4), min(self.size, (ph + 3) // 4 * 4)
            page = Image.new('RGBA', (pw, ph), (0, 0, 0, 0))
            for _, im, _, px, py in items:
                page.paste(im, (px, py))
            out.append((page, items))
        return out


# ---------------------------------------------------------------------------------------------------------------------
# Build


def build(kit: str, src: str, out_root: str, preview: str | None):
    cfg = KITS[kit]
    atlas_path = os.path.join(src, f'{kit}_atlas.json')
    kit_dir = os.path.join(src, kit)
    atlas = json.load(open(atlas_path))
    assets, regions = atlas['assets'], atlas['regions']

    # 1. verify sources
    hashes = {}
    for name, a in sorted(assets.items()):
        p = os.path.join(kit_dir, a['file'])
        got = sha256(p)
        if got != a['sha256']:
            raise SystemExit(f'sha256 mismatch for {a["file"]}: {got} != {a["sha256"]}')
        hashes[a['file']] = got
        img = Image.open(p)
        if img.size != (a['width'], a['height']):
            raise SystemExit(f'{a["file"]} is {img.size}, atlas says {a["width"]}x{a["height"]}')
    print(f'{kit}: {len(hashes)} sources verified')

    cache: dict[str, Image.Image] = {}

    def load(asset: str) -> Image.Image:
        if asset not in cache:
            cache[asset] = Image.open(os.path.join(kit_dir, assets[asset]['file'])).convert('RGBA')
        return cache[asset]

    def region(name: str) -> tuple[Image.Image, dict]:
        r = regions[name]
        x, y, w, h = r['rect']
        im = apply_mask(load(r['asset']).crop((x, y, x + w, y + h)), r['maskRuns'])
        return im, r

    out_dir = os.path.join(out_root, kit)
    os.makedirs(out_dir, exist_ok=True)
    for f in os.listdir(out_dir):
        if f.endswith(('.webp', '.json')):
            os.remove(os.path.join(out_dir, f))

    sprites = Packer()  # units, boss, debris (+ white silhouettes)
    world = Packer()  # bases
    fxp = Packer()  # effects, clouds, props
    manifest: dict = {
        'kit': kit,
        'title': atlas['title'],
        'schema': 1,
        'atlases': {},
        'frames': {},
        'images': {},
        'units': {},
        'bases': {},
        'sources': hashes,
    }

    # 2. units: full hero sprites, both factions, white flash silhouettes, debris parts
    for role, key in cfg['units'].items():
        scale = TANK_SCALE if role == 'tank' else SOLDIER_SCALE
        for faction in ('storm', 'ember'):
            aname = f'{key}_{faction}'
            a = assets[aname]
            im = resample(clean_alpha(load(aname)), scale)
            im = clean_alpha(im, 8)
            im, (ox, oy) = trim(im)
            ax = a['anchor']['x'] * scale - ox
            ay = a['anchor']['y'] * scale - oy
            mx, my = cfg['muzzle'][key]
            fname = f'unit/{aname}'
            meta = {'ax': round(ax, 1), 'ay': round(ay, 1), 'nominalH': round(1100 * scale, 1), 'muzzle': [round(mx * scale - ox, 1), round(my * scale - oy, 1)]}
            sprites.add(fname, im, meta)
            sprites.add(fname + '.white', white_of(im), {'ax': meta['ax'], 'ay': meta['ay']})
            debris = []
            for part in cfg['debris'][key]:
                pim, r = region(f'{aname}/{part}')
                pim = clean_alpha(resample(clean_alpha(pim), scale), 8)
                pim, (pox, poy) = trim(pim)
                pname = f'part/{aname}/{part}'
                sprites.add(pname, pim, {'ax': round(r['pivot']['x'] * scale - pox, 1), 'ay': round(r['pivot']['y'] * scale - poy, 1)})
                debris.append(pname)
            manifest['units'][f'{role}.{faction}'] = {'frame': fname, 'white': fname + '.white', 'debris': debris, 'name': key}

    # 3. boss: the full mounted sprite (enemy only)
    b = cfg['boss']
    a = assets[b]
    im = clean_alpha(resample(clean_alpha(load(b)), BOSS_SCALE), 8)
    im, (ox, oy) = trim(im)
    meta = {'ax': round(a['anchor']['x'] * BOSS_SCALE - ox, 1), 'ay': round(a['anchor']['y'] * BOSS_SCALE - oy, 1), 'nominalH': round(1009 * BOSS_SCALE, 1)}
    sprites.add('unit/boss', im, meta)
    sprites.add('unit/boss.white', white_of(im), {'ax': meta['ax'], 'ay': meta['ay']})
    manifest['units']['warlord.ember'] = {'frame': 'unit/boss', 'white': 'unit/boss.white', 'debris': [], 'name': b}

    # 4. bases: one common scale; baseAlignment width normalisation folded in (applied once, here)
    ref = assets['base_storm_intact']
    common = BASE_INTACT_PX / (ref['anchor']['y'] - ref['bounds'][1])
    for faction in ('storm', 'ember'):
        for state in ('intact', 'damaged', 'critical', 'ruins'):
            aname = f'base_{faction}_{state}'
            a = assets[aname]
            norm = (a.get('baseAlignment') or {}).get('scaleToReferenceWidth', 1.0)
            s = common * norm
            im = clean_alpha(resample(clean_alpha(load(aname)), s), 8)
            im, (ox, oy) = trim(im)
            fname = f'base/{faction}/{state}'
            world.add(fname, im, {'ax': round(a['anchor']['x'] * s - ox, 1), 'ay': round(a['anchor']['y'] * s - oy, 1)})
            manifest['bases'][f'{faction}.{state}'] = fname
    manifest['baseRefHeight'] = BASE_INTACT_PX
    manifest['baseAlignmentApplied'] = True

    # 5. effects, clouds, props (masked regions; glow halos kept for effects and clouds)
    for canon, part in cfg['fx'].items():
        im, r = region(f'battle_effects/{part}')
        s = FX_SCALE[canon]
        im = resample(im, s)
        im, (ox, oy) = trim(im)
        fxp.add(f'fx/{canon}', im, {'ax': round(r['pivot']['x'] * s - ox, 1), 'ay': round(r['pivot']['y'] * s - oy, 1)})
    for i in range(1, 6):
        im, r = region(f'{cfg["clouds"]}/cloud_0{i}')
        im = resample(im, CLOUD_SCALE)
        im, (ox, oy) = trim(im)
        fxp.add(f'cloud/{i}', im, {'ax': round(im.width / 2, 1), 'ay': round(im.height / 2, 1)})
    for p in cfg['props']:
        im, r = region(f'foreground_props/{p}')
        im = clean_alpha(resample(clean_alpha(im), PROP_SCALE), 8)
        im, _ = trim(im)
        fxp.add(f'prop/{p}', im, {'ax': round(im.width / 2, 1), 'ay': float(im.height)})  # props stand on their base

    # 6. write atlases
    stats = []
    for group, packer, lossless in (('sprites', sprites, False), ('bases', world, False), ('fx', fxp, False)):
        pages = packer.pack()
        files = []
        for i, (page, items) in enumerate(pages):
            fname = f'{group}-{i}.webp'
            data = webp_bytes(page, LOSSY_SPRITES, lossless)
            open(os.path.join(out_dir, fname), 'wb').write(data)
            files.append({'file': fname, 'w': page.width, 'h': page.height})
            stats.append((fname, page.size, len(data)))
            for name, im, meta, x, y in items:
                manifest['frames'][name] = {'atlas': group, 'page': i, 'x': x, 'y': y, 'w': im.width, 'h': im.height, **meta}
            if preview:
                page.save(os.path.join(preview, f'{kit}-{fname}.png'))
        manifest['atlases'][group] = files

    # 7. backgrounds (single images)
    def save_img(key: str, im: Image.Image, quality: int, extra: dict, lossless: bool = False):
        fname = f'{key}.webp'
        data = webp_bytes(im, quality, lossless)
        open(os.path.join(out_dir, fname), 'wb').write(data)
        stats.append((fname, im.size, len(data)))
        manifest['images'][key] = {'file': fname, 'w': im.width, 'h': im.height, **extra}
        if preview:
            im.save(os.path.join(preview, f'{kit}-{key}.png'))

    sky = load('sky').convert('RGB').resize((768, 1152), Image.Resampling.LANCZOS)
    save_img('sky', sky, LOSSY_BG, {'focus': list(cfg['skyFocus'])})

    hz = assets['horizon']
    top = hz['bounds'][1]
    ground_row = hz['anchor']['y']  # bottom of the band = where it meets the lane
    horizon = load('horizon').crop((0, top, hz['width'], ground_row))
    horizon = clean_alpha(resample(clean_alpha(horizon, 4), 0.75), 4)
    save_img('horizon', horizon, LOSSY_BG, {})

    # path strip: the opaque band, mirror-joined so plain repeat is seamless (source left/right edges differ)
    pa = assets['path']
    band = load('path').crop((0, pa['bounds'][1], pa['width'], pa['bounds'][3]))
    band = resample(clean_alpha(band, 8), 0.6)
    tile = Image.new('RGBA', (band.width * 2, band.height), (0, 0, 0, 0))
    tile.paste(band, (0, 0))
    tile.paste(band.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (band.width, 0))
    save_img('path', tile, LOSSY_SPRITES, {'repeat': 'x'})

    # ground: 2 x 2 mirror-joined (both source edge pairs differ)
    g = load('ground_tile').convert('RGB').resize((448, 448), Image.Resampling.LANCZOS)
    gt = Image.new('RGB', (896, 896))
    gt.paste(g, (0, 0))
    gt.paste(g.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (448, 0))
    gt.paste(g.transpose(Image.Transpose.FLIP_TOP_BOTTOM), (0, 448))
    gt.paste(g.transpose(Image.Transpose.ROTATE_180), (448, 448))
    save_img('ground', gt, LOSSY_BG, {'repeat': 'xy'})

    # 8. UI: logo, icon sheet (fixed 4 x 4 grid of square cells, order ICON_ORDER), portraits
    lg = assets['logo']
    logo = clean_alpha(load('logo')).crop(tuple(lg['bounds']))
    logo = resample(logo, 960 / logo.width)
    logo, _ = trim(logo)
    save_img('logo', logo, LOSSY_SPRITES, {})

    sheet = Image.new('RGBA', (ICON_CELL * 4, ICON_CELL * 4), (0, 0, 0, 0))
    for i, n in enumerate(ICON_ORDER):
        im, _ = region(f'icons/{n}')
        im, _ = trim(im)
        s = (ICON_CELL - 4) / max(im.width, im.height)
        im = resample(im, s)
        cx, cy = (i % 4) * ICON_CELL, (i // 4) * ICON_CELL
        sheet.paste(im, (cx + (ICON_CELL - im.width) // 2, cy + (ICON_CELL - im.height) // 2))
    save_img('icons', sheet, LOSSY_SPRITES, {'cell': ICON_CELL, 'cols': 4, 'order': ICON_ORDER})

    for role, key in cfg['units'].items():
        box = cfg['portrait'][key]
        im = clean_alpha(load(f'{key}_storm')).crop(box)
        im = resample(im, PORTRAIT_PX / im.width)
        save_img(f'portrait-{role}', im, LOSSY_SPRITES, {})

    with open(os.path.join(out_dir, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1, sort_keys=True)
        f.write('\n')
    total = sum(n for _, _, n in stats)
    for name, size, n in stats:
        print(f'  {name:24s} {size[0]:5d} x {size[1]:<5d} {n / 1024:8.1f} KiB')
    print(f'{kit}: {total / 1024 / 1024:.2f} MiB in {len(stats)} files -> {out_dir}')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--kit', choices=sorted(KITS), action='append', required=True)
    ap.add_argument('--src', required=True, help='folder holding <kit>/ and <kit>_atlas.json')
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'art'))
    ap.add_argument('--preview', help='also write PNG copies of every page here (review only)')
    args = ap.parse_args()
    if not features.check('webp'):
        sys.exit('Pillow was built without WebP support')
    if args.preview:
        os.makedirs(args.preview, exist_ok=True)
    for kit in args.kit:
        build(kit, args.src, os.path.abspath(args.out), args.preview)


if __name__ == '__main__':
    main()
