#!/usr/bin/env python3
"""
Offline art pipeline for the four era packs (Primal, Ancient, Gunpowder, Industrial; see public/art/README.md).

The era packs have no atlas JSON: each era is a folder of loose high-resolution PNGs

    <src>/<era>/storm/<unit>.png, <unit>_parts.png, fortress_<state>.png   (Storm faction, all sprites face right)
    <src>/<era>/ember/...                                                   (Ember faction, same framing)
    <src>/<era>/world/sky.png (opaque), distant.png, midground.png, ground.png, foreground.png [, <prop>.png]
    <src>/file-checksums.csv                                                (the pack's sha256 list)

This builder verifies every source against the pack's checksum list, then cuts, trims and resamples the hero
sprites, bases, world layers, death-debris parts and portraits exactly like build_kits.py does for the atlas kits,
reuses the shared battle effects from the already-built Eldritch/Future kits (public/art/<kit>/fx-0.webp), draws
the small projectiles procedurally, packs WebP atlases and writes a manifest in the same schema
(src/render/kits/manifest.ts).

    python3 -I tools/art/build_eras.py --kit primal --kit ancient --kit gunpowder --kit industrial --src <dir>

Needs Python 3 + Pillow (WebP) + numpy. Deterministic for given library versions.
"""
from __future__ import annotations

import argparse
import colorsys
import csv
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, features

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_kits import (  # noqa: E402
    ALPHA_MIN,
    LOSSY_SPRITES,
    PORTRAIT_PX,
    Packer,
    clean_alpha,
    resample,
    sha256,
    trim,
    webp_bytes,
    white_of,
)

# ---------------------------------------------------------------------------------------------------------------------
# Scale contract (shared with build_kits.py so every Age draws at the same size)
#
# Every era character was generated with one camera: a standing soldier is ~1100 source px tall on a 1312 x 1199
# canvas, like the atlas kits. So one px-per-source-px factor per class keeps soldiers the same size in every Age;
# the runtime sizes them by `nominalH` (src/render/kits/sizes.ts).
SOLDIER_SCALE = 240 / 1100  # = build_kits.SOLDIER_SCALE
TANK_NOMINAL = 1250  # source px that map to the tank height: a 1100 px figure draws ~1.3x a soldier, not 1.5x
TANK_SCALE = 360 / TANK_NOMINAL
BOSS_NOMINAL = 1100  # the Warlord is a soldier-sized figure drawn ~2.4x
BOSS_SCALE = 600 / BOSS_NOMINAL
REF_CANVAS_H = 1199  # the pack's character canvas height
BASE_PX_W = 640  # intact Storm fortress footprint width in output px (one scale for all 8 base images of an era)
BASE_HEIGHT_PT = 205  # src/render/kits/sizes.ts BASE_HEIGHT
BASE_WIDTH_PT = 190  # on-screen width of an era's intact fortress on the reference phone (they are wide and low)
BASE_OUTWARD = 0.08  # the anchor sits this fraction of the intact width inward of the gate: the fort reaches less into the lane
WORLD_SCALE = 0.75  # world layers keep 3/4 of the source resolution (a phone draws them at ~0.7x, an iPad at ~1.1x)
FILL_SCALE = 0.5
SKY_SIZE = (1152, 768)
LOSSY_WORLD = 80
FEET_ALPHA = 128

STATES = {'intact': 'intact', 'damaged': 'damaged', 'critical': 'nearly_destroyed', 'ruins': 'fallen'}

# Effects borrowed from the built atlas kits, optionally recoloured (dark, mid, light). Same canonical names as
# build_kits.py; the projectile is per era (drawn below).
WARM = ((70, 22, 8), (232, 112, 34), (255, 236, 170))
DUST = ((60, 46, 34), (176, 150, 116), (246, 236, 214))
SMOKE = ((26, 24, 26), (112, 106, 104), (226, 222, 214))
MUD = ((40, 34, 30), (124, 112, 100), (214, 206, 194))
STEEL = ((40, 48, 64), (170, 184, 204), (250, 252, 255))
FX_HISTORIC = {
    'hit': ('future', 'hit', None),
    'impact': ('future', 'impact', WARM),
    'dust': ('future', 'dust', DUST),  # per era: cfg['dust']
    'poof': ('future', 'poof', SMOKE),
    'coin': ('eldritch', 'coin', None),  # matches the shared (Eldritch) credits icon
    'strike': ('future', 'strike', None),  # the Stormcall bolt is the Storm's own lightning in every Age
    'scorch': ('future', 'scorch', None),
    'swoosh': ('future', 'swoosh', STEEL),
}

ERAS = {
    'primal': {
        'title': 'STORMGLASS — Primal Era',
        'laneY': 790,  # ground-layer source row the troops' feet stand on
        'units': {'melee': 'flintspear', 'ranged': 'slinghunter', 'tank': 'boneguard'},
        # muzzle / release point and portrait crop, in Storm hero source px (Ember shares the framing)
        'muzzle': {'flintspear': (1370, 330), 'slinghunter': (1240, 760), 'boneguard': (300, 700)},
        'portrait': {'flintspear': (420, 60, 900, 540), 'slinghunter': (460, 40, 940, 520), 'boneguard': (540, 20, 1180, 660)},
        # death debris: the part's approximate box on the Storm / Ember parts sheet (source px)
        'debris': {'flintspear': {'spear': ((36, 496, 1368, 704), (32, 496, 1368, 704))}, 'slinghunter': {'sling': ((1176, 280, 1308, 684), (1168, 280, 1312, 684))}, 'boneguard': {'axe': ((932, 468, 1176, 976), (928, 464, 1172, 976)), 'shield': ((1190, 444, 1516, 990), (1194, 444, 1516, 990))}},
        'projectile': 'stone',
        'dust': DUST,
        'impact': DUST,
        'prop': 'weathered_totem',
    },
    'ancient': {
        'title': 'STORMGLASS — Ancient Era',
        'laneY': 892,  # ground-layer source row the troops' feet stand on
        'units': {'melee': 'longspear', 'ranged': 'warbow', 'tank': 'bronze_guard'},
        'muzzle': {'longspear': (1290, 335), 'warbow': (1270, 388), 'bronze_guard': (840, 790)},
        'portrait': {'longspear': (330, 120, 810, 600), 'warbow': (600, 100, 1080, 580), 'bronze_guard': (520, 30, 1140, 650)},
        'debris': {'longspear': {'spear': ((648, 616, 1520, 676), (88, 692, 1048, 740))}, 'warbow': {'bow': ((1296, 224, 1528, 928), (1028, 24, 1212, 700))}, 'bronze_guard': {'sword': ((736, 488, 1092, 564), (440, 750, 880, 860)), 'shield': ((1156, 76, 1410, 464), (1010, 250, 1240, 780))}},
        'projectile': 'arrow',
        'dust': DUST,
        'impact': DUST,
        'prop': 'broken_standard',
    },
    'gunpowder': {
        'title': 'STORMGLASS — Gunpowder Era',
        'laneY': 850,  # ground-layer source row the troops' feet stand on
        'units': {'melee': 'musketeer', 'ranged': 'grenadier', 'tank': 'sabre_guard'},
        'muzzle': {'musketeer': (1285, 340), 'grenadier': (200, 225), 'sabre_guard': (40, 790)},
        'portrait': {'musketeer': (240, 80, 720, 560), 'grenadier': (580, 40, 1060, 520), 'sabre_guard': (580, 70, 1220, 710)},
        'debris': {'musketeer': {'musket': ((772, 40, 1512, 188), (864, 436, 1300, 532))}, 'grenadier': {'hat': ((596, 24, 884, 144), (800, 56, 1056, 176))}, 'sabre_guard': {'sabre': ((20, 392, 692, 536), (44, 592, 608, 708)), 'shield': ((1336, 194, 1530, 470), (670, 676, 836, 870))}},
        'strike': {'musketeer': 'shot'},  # the musketeer's close attack is a point-blank volley, not a swing
        'projectile': 'grenade',
        'dust': MUD,
        'impact': WARM,
        'prop': None,
    },
    'industrial': {
        'title': 'STORMGLASS — Industrial Era',
        'laneY': 872,  # ground-layer source row the troops' feet stand on
        'units': {'melee': 'trench_raider', 'ranged': 'rifleman', 'tank': 'heavy_gunner'},
        'muzzle': {'trench_raider': (60, 730), 'rifleman': (1265, 610), 'heavy_gunner': (1280, 570)},
        'portrait': {'trench_raider': (600, 40, 1080, 520), 'rifleman': (480, 40, 960, 520), 'heavy_gunner': (330, 70, 950, 690)},
        'debris': {'trench_raider': {'club': ((208, 564, 724, 716), None)}, 'rifleman': {'rifle': (None, (20, 520, 888, 616))}, 'heavy_gunner': {'gun': ((716, 484, 1468, 728), None)}},
        # uncoloured weapons whose piece is fused to a glove or coat on one sheet come from the other faction's sheet
        'projectile': 'tracer',
        'dust': MUD,
        'impact': WARM,
        'prop': None,
    },
}

# World size of each projectile (wu along its longest side), blend and whether a muzzle flash fires with it.
PROJECTILES = {
    'stone': {'size': 34, 'blend': 'normal', 'flash': False},
    'arrow': {'size': 118, 'blend': 'normal', 'flash': False},
    'grenade': {'size': 48, 'blend': 'normal', 'flash': False},
    'tracer': {'size': 130, 'blend': 'add', 'flash': True},
}


# ---------------------------------------------------------------------------------------------------------------------
# Helpers


def alpha_np(im: Image.Image) -> np.ndarray:
    return np.asarray(im.getchannel('A'))


def opaque_bbox(im: Image.Image, floor: int = FEET_ALPHA):
    a = alpha_np(im)
    ys, xs = np.nonzero(a >= floor)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def feet_anchor(im: Image.Image) -> tuple[float, float]:
    """Ground contact: the lowest opaque row; x = the middle of the opaque pixels in the bottom 6 % (between the feet)."""
    a = alpha_np(im) >= FEET_ALPHA
    ys, xs = np.nonzero(a)
    y1 = int(ys.max()) + 1
    band = ys >= y1 - 0.06 * (y1 - int(ys.min()))
    fx = xs[band]
    return (float(fx.min() + fx.max()) / 2 + 0.5, float(y1))


_components: dict[int, tuple[Image.Image, list]] = {}  # id → (image kept alive, so the id is never reused; parts)


def components(im: Image.Image, floor: int = 64, step: int = 4, min_area: int = 1500):
    """Connected opaque regions of a parts sheet: [(x0, y0, x1, y1, area, labels, step)] in source px, reading order."""
    hit = _components.get(id(im))
    if hit and hit[0] is im:
        return hit[1]
    a = alpha_np(im) >= floor
    h, w = a.shape
    hs, ws = (h + step - 1) // step, (w + step - 1) // step
    pad = np.zeros((hs * step, ws * step), bool)
    pad[:h, :w] = a
    small = pad.reshape(hs, step, ws, step).any(axis=(1, 3))
    lab = np.zeros(small.shape, np.int32)
    out = []
    n = 0
    for y in range(hs):
        for x in range(ws):
            if not small[y, x] or lab[y, x]:
                continue
            n += 1
            q = deque([(y, x)])
            lab[y, x] = n
            cnt = 0
            y0 = y1 = y
            x0 = x1 = x
            while q:
                cy, cx = q.popleft()
                cnt += 1
                y0, y1, x0, x1 = min(y0, cy), max(y1, cy), min(x0, cx), max(x1, cx)
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < hs and 0 <= nx < ws and small[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = n
                        q.append((ny, nx))
            if cnt * step * step >= min_area:
                out.append((x0 * step, y0 * step, min(w, (x1 + 1) * step), min(h, (y1 + 1) * step), cnt * step * step, n))
    out.sort(key=lambda c: (c[1] // 64, c[0]))
    parts = [(x0, y0, x1, y1, area, (lab, n, step)) for x0, y0, x1, y1, area, n in out]
    _components[id(im)] = (im, parts)
    return parts


def component_like(im: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    """The parts-sheet component best matching the approximate box (IoU), isolated (neighbours masked out)."""

    def iou(c):
        ix = max(0, min(c[2], box[2]) - max(c[0], box[0]))
        iy = max(0, min(c[3], box[3]) - max(c[1], box[1]))
        inter = ix * iy
        return inter / ((c[2] - c[0]) * (c[3] - c[1]) + (box[2] - box[0]) * (box[3] - box[1]) - inter)

    best = max(components(im), key=iou)
    if iou(best) < 0.5:
        raise SystemExit(f'no part like {box} (best IoU {iou(best):.2f})')
    x0, y0, x1, y1, _, (lab, n, step) = best
    m = (lab == n).astype(np.uint8) * 255
    mask = Image.fromarray(m).resize((lab.shape[1] * step, lab.shape[0] * step), Image.Resampling.NEAREST)
    mask = mask.filter(ImageFilter.MaxFilter(5)).crop((0, 0, im.width, im.height))
    out = im.copy()
    out.putalpha(Image.fromarray(np.minimum(alpha_np(im), np.asarray(mask))))
    return out.crop((x0, y0, x1, y1))


def colorize(im: Image.Image, ramp) -> Image.Image:
    """Recolours an effect by luminance onto a dark → mid → light ramp, keeping its alpha."""
    rgb = np.asarray(im.convert('RGB')).astype(np.float32) / 255
    lum = rgb[..., 0] * 0.3 + rgb[..., 1] * 0.59 + rgb[..., 2] * 0.11
    lum = np.clip((lum - lum.min()) / max(1e-6, np.percentile(lum, 99.5) - lum.min()), 0, 1)
    d, m, l = (np.array(c, np.float32) for c in ramp)
    lo = lum[..., None] < 0.5
    t = np.where(lo, lum[..., None] * 2, lum[..., None] * 2 - 1)
    col = np.where(lo, d + (m - d) * t, m + (l - m) * t)
    out = Image.fromarray(np.clip(col, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')
    out.putalpha(im.getchannel('A'))
    return out


def fade_top(im: Image.Image, frac: float) -> Image.Image:
    """Fades the top `frac` of a layer to transparent (smoothstep), so a canvas-cut edge never shows."""
    a = np.asarray(im.getchannel('A')).astype(np.float32)
    n = max(1, int(im.height * frac))
    t = np.clip(np.arange(im.height, dtype=np.float32) / n, 0, 1)
    ramp = t * t * (3 - 2 * t)
    out = im.copy()
    out.putalpha(Image.fromarray((a * ramp[:, None]).astype(np.uint8)))
    return out


def mirror_join(im: Image.Image) -> Image.Image:
    """A + flipped A: plain horizontal repeat becomes seamless (the sources' left and right edges differ)."""
    t = Image.new(im.mode, (im.width * 2, im.height))
    t.paste(im, (0, 0))
    t.paste(im.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (im.width, 0))
    return t


# ---------------------------------------------------------------------------------------------------------------------
# Procedural projectiles (drawn at 4x, then downsampled: smooth edges, crisp at game size)


def draw_projectile(kind: str) -> tuple[Image.Image, tuple[float, float]]:
    S = 4
    if kind == 'stone':
        w, h = 30, 26
        im = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.ellipse((2 * S, 2 * S, (w - 2) * S, (h - 2) * S), fill=(46, 42, 40, 255))
        d.ellipse((4 * S, 4 * S, (w - 4) * S, (h - 4) * S), fill=(132, 126, 118, 255))
        d.ellipse((7 * S, 6 * S, 17 * S, 13 * S), fill=(176, 170, 160, 255))
        d.ellipse((15 * S, 13 * S, 24 * S, 20 * S), fill=(104, 98, 92, 255))
    elif kind == 'arrow':
        w, h = 120, 16
        im = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        cy = h * S // 2
        d.rectangle((10 * S, cy - 1.5 * S, 104 * S, cy + 1.5 * S), fill=(120, 84, 48, 255))  # shaft
        d.line((10 * S, cy - 1 * S, 104 * S, cy - 1 * S), fill=(168, 126, 80, 255), width=S)
        d.polygon([(118 * S, cy), (102 * S, cy - 5.5 * S), (105 * S, cy), (102 * S, cy + 5.5 * S)], fill=(52, 54, 60, 255))  # head
        d.polygon([(116 * S, cy), (104 * S, cy - 3.5 * S), (106 * S, cy)], fill=(196, 200, 206, 255))
        for sgn in (-1, 1):  # fletching
            d.polygon([(2 * S, cy + sgn * 7 * S), (22 * S, cy + sgn * 1.5 * S), (10 * S, cy + sgn * 1.5 * S)], fill=(226, 220, 204, 255))
    elif kind == 'grenade':
        w, h = 34, 38
        im = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.ellipse((2 * S, 8 * S, 32 * S, 37 * S), fill=(20, 20, 24, 255))
        d.ellipse((4 * S, 10 * S, 30 * S, 35 * S), fill=(58, 60, 66, 255))
        d.ellipse((9 * S, 14 * S, 17 * S, 21 * S), fill=(124, 128, 136, 255))
        d.rectangle((13 * S, 4 * S, 21 * S, 10 * S), fill=(110, 84, 52, 255))  # fuse plug
        d.line((17 * S, 4 * S, 22 * S, 0), fill=(214, 196, 150, 255), width=2 * S)
        d.ellipse((19 * S, 0, 25 * S, 5 * S), fill=(255, 200, 80, 255))  # lit fuse
    elif kind == 'tracer':
        w, h = 120, 10
        im = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
        px = im.load()
        for x in range(w * S):
            f = x / (w * S)  # tail (0) → head (1)
            for y in range(h * S):
                dy = abs(y - h * S / 2) / (h * S / 2)
                core = max(0.0, 1 - dy * (2.2 - f))
                a = core * (f ** 1.6)
                if a <= 0.01:
                    continue
                r, g, b = colorsys.hls_to_rgb(0.12, 0.55 + 0.4 * core * f, 1.0)
                px[x, y] = (int(r * 255), int(g * 255), int(b * 255), int(min(1, a * 1.3) * 255))
    else:
        raise SystemExit(kind)
    im = im.resize((w, h), Image.Resampling.LANCZOS)
    return im, (w / 2, h / 2)


# ---------------------------------------------------------------------------------------------------------------------
# Build


def read_checksums(src: str) -> dict[str, str]:
    path = os.path.join(src, 'file-checksums.csv')
    out = {}
    with open(path, newline='') as f:
        for row in csv.DictReader(f):
            p = row['relative_path'].strip()
            if p.startswith('sources/'):
                out[p[len('sources/'):]] = row['sha256'].strip()
    return out


def build_era(kit: str, src: str, out_root: str, preview: str | None):
    cfg = ERAS[kit]
    sums = read_checksums(src)
    hashes: dict[str, str] = {}
    cache: dict[str, Image.Image] = {}

    def load(rel: str) -> Image.Image:
        """`rel` like 'storm/boneguard.png'; verified against the pack checksum before first use."""
        key = f'{kit}/{rel}'
        if key not in cache:
            p = os.path.join(src, kit, rel)
            if rel not in hashes:
                got = sha256(p)
                if sums.get(key) != got:
                    raise SystemExit(f'sha256 mismatch for {key}: {got} != {sums.get(key)}')
                hashes[rel] = got
            cache[key] = Image.open(p).convert('RGBA')
        return cache[key]

    # every pack file of the era is verified up front (also the ones this build does not draw, e.g. the Storm
    # Warlord and the Warlord parts sheets), so the manifest records the complete provenance of the era
    for key in sorted(k for k in sums if k.startswith(f'{kit}/')):
        load(key[len(kit) + 1:])
    cache.clear()

    out_dir = os.path.join(out_root, kit)
    os.makedirs(out_dir, exist_ok=True)
    for f in os.listdir(out_dir):
        if f.endswith(('.webp', '.json')):
            os.remove(os.path.join(out_dir, f))

    sprites = Packer()  # units, debris, white silhouettes, effects, projectile, prop
    world = Packer()  # bases
    manifest: dict = {
        'kit': kit,
        'title': cfg['title'],
        'schema': 1,
        'world': 'layers',
        'atlases': {},
        'frames': {},
        'images': {},
        'units': {},
        'bases': {},
        'sources': hashes,
    }

    def hero(name: str, faction: str, base_scale: float, nominal: float, muzzle=None):
        im = load(f'{faction}/{name}.png')
        # one camera per pack: a figure delivered on a shorter canvas (Primal Flintspear, 1402 x 1122) was framed
        # smaller, so it is brought back to the common 1199 px canvas height
        scale = base_scale * REF_CANVAS_H / im.height
        ax, ay = feet_anchor(im)
        out = clean_alpha(resample(clean_alpha(im), scale), 8)
        out, (ox, oy) = trim(out)
        meta = {'ax': round(ax * scale - ox, 1), 'ay': round(ay * scale - oy, 1), 'nominalH': round(nominal * base_scale, 1)}
        if muzzle:
            meta['muzzle'] = [round(muzzle[0] * scale - ox, 1), round(muzzle[1] * scale - oy, 1)]
        return out, meta

    # 1. units: hero sprites (both factions), white flash silhouettes, debris parts
    for role, key in cfg['units'].items():
        scale, nominal = (TANK_SCALE, TANK_NOMINAL) if role == 'tank' else (SOLDIER_SCALE, 1100)
        for faction in ('storm', 'ember'):
            im, meta = hero(key, faction, scale, nominal, cfg['muzzle'][key])
            fname = f'unit/{key}_{faction}'
            sprites.add(fname, im, meta)
            sprites.add(fname + '.white', white_of(im), {'ax': meta['ax'], 'ay': meta['ay']})
            debris = []
            for part, boxes in cfg['debris'].get(key, {}).items():
                # a part fused to its neighbours on one sheet (box None) comes from the other faction's sheet
                own = boxes[0 if faction == 'storm' else 1]
                sheet = faction if own else ('ember' if faction == 'storm' else 'storm')
                pim = component_like(load(f'{sheet}/{key}_parts.png'), own or boxes[1 if faction == 'storm' else 0])
                pim = clean_alpha(resample(clean_alpha(pim), scale * REF_CANVAS_H / load(f'{faction}/{key}.png').height), 8)
                pim, _ = trim(pim)
                pname = f'part/{key}_{faction}/{part}'
                sprites.add(pname, pim, {'ax': round(pim.width / 2, 1), 'ay': round(pim.height / 2, 1)})
                debris.append(pname)
            entry = {'frame': fname, 'white': fname + '.white', 'debris': debris, 'name': key}
            if cfg.get('strike', {}).get(key):
                entry['strike'] = cfg['strike'][key]
            manifest['units'][f'{role}.{faction}'] = entry

    # 2. the Warlord (enemy only, Ember colours, like the atlas kits)
    im, meta = hero('warlord', 'ember', BOSS_SCALE, BOSS_NOMINAL)
    sprites.add('unit/boss', im, meta)
    sprites.add('unit/boss.white', white_of(im), {'ax': meta['ax'], 'ay': meta['ay']})
    manifest['units']['warlord.ember'] = {'frame': 'unit/boss', 'white': 'unit/boss.white', 'debris': [], 'name': 'warlord'}

    # 3. bases: one scale per era from the intact Storm footprint; every state stands on its own lowest opaque row
    ref = opaque_bbox(load('storm/fortress_intact.png'))
    s = BASE_PX_W / (ref[2] - ref[0])
    intact_h = 0.0
    for faction in ('storm', 'ember'):
        ib = opaque_bbox(load(f'{faction}/fortress_intact.png'))
        cx = (ib[0] + ib[2]) / 2 + BASE_OUTWARD * (ib[2] - ib[0])  # near the gate, shared by all states
        for state, fn in STATES.items():
            src_im = load(f'{faction}/fortress_{fn}.png')
            bottom = opaque_bbox(src_im)[3]
            im = clean_alpha(resample(clean_alpha(src_im), s), 8)
            im, (ox, oy) = trim(im)
            fname = f'base/{faction}/{state}'
            world.add(fname, im, {'ax': round(cx * s - ox, 1), 'ay': round(bottom * s - oy, 1)})
            manifest['bases'][f'{faction}.{state}'] = fname
            if faction == 'storm' and state == 'intact':
                bb = opaque_bbox(src_im)
                intact_h = (bb[3] - bb[1]) * s
    # baseRefHeight: the pixel height that the runtime draws at BASE_HEIGHT. These fortresses are wide and low, so
    # the intact footprint (not its height) sets the size: BASE_WIDTH_PT wide on the reference phone.
    target_h_pt = BASE_WIDTH_PT * (intact_h / BASE_PX_W)
    manifest['baseRefHeight'] = round(intact_h * BASE_HEIGHT_PT / target_h_pt, 1)
    manifest['baseAlignmentApplied'] = True

    # 4. effects: borrowed from the built atlas kits, era-tinted; the era projectile; the neutral prop
    borrowed: dict[str, tuple[dict, Image.Image]] = {}
    for canon, (from_kit, name, ramp) in FX_HISTORIC.items():
        if from_kit not in borrowed:
            bm = json.load(open(os.path.join(out_root, from_kit, 'manifest.json')))
            pages = [Image.open(os.path.join(out_root, from_kit, p['file'])).convert('RGBA') for p in bm['atlases']['fx']]
            borrowed[from_kit] = (bm, pages)
        bm, pages = borrowed[from_kit]
        f = bm['frames'][f'fx/{name}']
        im = pages[f['page']].crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
        if canon in ('impact', 'dust'):
            ramp = cfg[canon]
        if ramp:
            im = colorize(im, ramp)
        sprites.add(f'fx/{canon}', im, {'ax': f['ax'], 'ay': f['ay']})
    pk = cfg['projectile']
    pim, (pax, pay) = draw_projectile(pk)
    sprites.add('fx/projectile', pim, {'ax': pax, 'ay': pay, **PROJECTILES[pk]})
    if cfg['prop']:
        im = load(f'world/{cfg["prop"]}.png')
        im = clean_alpha(resample(clean_alpha(im, 64), 0.3), 16)
        im, _ = trim(im)
        sprites.add(f'prop/{cfg["prop"]}', im, {'ax': round(im.width / 2, 1), 'ay': float(im.height)})

    # 5. write atlases
    stats = []
    for group, packer in (('sprites', sprites), ('bases', world)):
        files = []
        for i, (page, items) in enumerate(packer.pack()):
            fname = f'{group}-{i}.webp'
            data = webp_bytes(page, LOSSY_SPRITES)
            open(os.path.join(out_dir, fname), 'wb').write(data)
            files.append({'file': fname, 'w': page.width, 'h': page.height})
            stats.append((fname, page.size, len(data)))
            for name, im, meta, x, y in items:
                manifest['frames'][name] = {'atlas': group, 'page': i, 'x': x, 'y': y, 'w': im.width, 'h': im.height, **meta}
            if preview:
                page.save(os.path.join(preview, f'{kit}-{fname}.png'))
        manifest['atlases'][group] = files

    def save_img(key: str, im: Image.Image, quality: int, extra: dict):
        fname = f'{key}.webp'
        data = webp_bytes(im, quality)
        open(os.path.join(out_dir, fname), 'wb').write(data)
        stats.append((fname, im.size, len(data)))
        manifest['images'][key] = {'file': fname, 'w': im.width, 'h': im.height, **extra}
        if preview:
            im.save(os.path.join(preview, f'{kit}-{key}.png'))

    # 6. world: the authored scene keeps its registration. distant / midground / ground share one canvas (output
    # px, WORLD_SCALE): each is cropped to its opaque rows and remembers its top `y` on that canvas. The runtime
    # stands the canvas on the lane at `laneY` (a row of the ground layer) and mirror-repeats it sideways.
    sky = load('world/sky.png').convert('RGB').resize(SKY_SIZE, Image.Resampling.LANCZOS)
    save_img('sky', sky, LOSSY_WORLD, {'focus': [0.5, 0.3]})
    canvas_w = round(load('world/ground.png').width * WORLD_SCALE)
    canvas_h = round(load('world/ground.png').height * WORLD_SCALE)
    for layer in ('distant', 'midground', 'ground'):
        im = clean_alpha(load(f'world/{layer}.png'), ALPHA_MIN)
        bb = im.getchannel('A').getbbox()
        y0 = bb[1]
        im = clean_alpha(resample(im.crop((0, y0, im.width, im.height)), WORLD_SCALE), 8)
        extra = {'y': round(y0 * WORLD_SCALE, 1), 'canvas': [canvas_w, canvas_h]}
        if layer == 'ground':
            extra['laneY'] = round(cfg['laneY'] * WORLD_SCALE, 1)
        if y0 < 0.05 * im.height / WORLD_SCALE:
            im = fade_top(im, 0.22)  # a layer cut by the canvas top (Primal's canopy) dissolves into the sky
        save_img(layer, im, LOSSY_WORLD, extra)
    # foreground: its own strip, drawn below the lane (never over a troop)
    fg = clean_alpha(load('world/foreground.png'), ALPHA_MIN)
    bb = fg.getchannel('A').getbbox()
    fg = clean_alpha(resample(fg.crop((0, bb[1], fg.width, fg.height)), WORLD_SCALE), 8)
    save_img('foreground', fg, LOSSY_WORLD, {})
    # ground fill below everything: the near rows of the ground layer, mirror-joined both ways (seamless repeat)
    g = load('world/ground.png')
    strip = g.crop((0, g.height - 200, g.width, g.height)).convert('RGB')
    strip = strip.resize((round(strip.width * FILL_SCALE), round(strip.height * FILL_SCALE)), Image.Resampling.LANCZOS)
    tile = Image.new('RGB', (strip.width, strip.height * 2))
    tile.paste(strip, (0, 0))
    tile.paste(strip.transpose(Image.Transpose.FLIP_TOP_BOTTOM), (0, strip.height))
    save_img('fill', mirror_join(tile), LOSSY_WORLD, {'repeat': 'xy'})

    # 7. portraits (DOM UI): upper body of the Storm hero
    for role, key in cfg['units'].items():
        im = clean_alpha(load(f'storm/{key}.png')).crop(cfg['portrait'][key])
        save_img(f'portrait-{role}', resample(im, PORTRAIT_PX / im.width), LOSSY_SPRITES, {})

    with open(os.path.join(out_dir, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1, sort_keys=True)
        f.write('\n')
    total = sum(n for _, _, n in stats)
    for name, size, n in stats:
        print(f'  {name:24s} {size[0]:5d} x {size[1]:<5d} {n / 1024:8.1f} KiB')
    print(f'{kit}: {len(hashes)} sources verified, {total / 1024 / 1024:.2f} MiB in {len(stats)} files -> {out_dir}')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--kit', choices=sorted(ERAS), action='append', required=True)
    ap.add_argument('--src', required=True, help='folder holding <era>/ and file-checksums.csv')
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'art'))
    ap.add_argument('--preview', help='also write PNG copies of every page here (review only)')
    args = ap.parse_args()
    if not features.check('webp'):
        sys.exit('Pillow was built without WebP support')
    if args.preview:
        os.makedirs(args.preview, exist_ok=True)
    for kit in args.kit:
        build_era(kit, args.src, os.path.abspath(args.out), args.preview)


if __name__ == '__main__':
    main()
