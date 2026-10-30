import { Assets, Rectangle, Texture, type TextureSource } from 'pixi.js';
import { kitUrl, type KitId } from './ageKits';
import { validateManifest, worldImages, type KitManifest } from './manifest';

/**
 * Loads a kit's manifest and texture pages on demand (only the kits the current and next Age need) and slices the
 * frames. Sprites are pre-scaled by the art tool to ~2× their on-screen size, so a phone draws them at ~0.5–0.9×:
 * plain bilinear filtering (no mipmaps) keeps them as crisp as nearest sampling without its dropped/doubled pixels
 * and shimmer on moving troops; trilinear mipmapping was visibly soft (comparison in public/art/README.md).
 */
export interface Kit {
  id: KitId;
  manifest: KitManifest;
  frame(name: string): Texture;
  image(key: string): Texture;
}

const loaded = new Map<KitId, Kit>();
const pending = new Map<KitId, Promise<Kit>>();
const listeners = new Set<(k: Kit) => void>();

export function getKit(id: KitId): Kit | null {
  return loaded.get(id) ?? null;
}

/** Called once per kit when it finishes loading (scenes swap their placeholders in). */
export function onKitLoaded(fn: (k: Kit) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function loadKit(id: KitId): Promise<Kit> {
  const have = loaded.get(id);
  if (have) return Promise.resolve(have);
  let p = pending.get(id);
  if (!p) {
    p = load(id).then(
      (k) => {
        loaded.set(id, k);
        pending.delete(id);
        for (const fn of listeners) fn(k);
        return k;
      },
      (e) => {
        pending.delete(id); // a later call may retry (e.g. after a flaky network)
        throw e;
      },
    );
    pending.set(id, p);
  }
  return p;
}

/** Fire-and-forget preload; failures are reported once as warnings (the game keeps its fallbacks). */
export function preloadKits(ids: Iterable<KitId>) {
  for (const id of new Set(ids)) loadKit(id).catch((e) => console.warn(`art kit ${id} failed to load`, e));
}

async function load(id: KitId): Promise<Kit> {
  const res = await fetch(kitUrl(id, 'manifest.json'));
  if (!res.ok) throw new Error(`manifest ${id}: HTTP ${res.status}`);
  const manifest = (await res.json()) as KitManifest;
  const errs = validateManifest(manifest);
  if (errs.length) throw new Error(`manifest ${id}: ${errs.slice(0, 3).join('; ')}`);

  // ?sample=nearest|trilinear switches the sprite atlases' sampling (for the sampling comparison only)
  const mode = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('sample') : null;
  const sprite = { scaleMode: mode === 'nearest' ? 'nearest' : 'linear', autoGenerateMipmaps: mode === 'trilinear' } as const;
  const jobs: Promise<void>[] = [];
  const pages: Record<string, TextureSource[]> = {};
  for (const [group, list] of Object.entries(manifest.atlases)) {
    pages[group] = [];
    list.forEach((pg, i) => {
      jobs.push(
        Assets.load<Texture>({ alias: `${id}:${pg.file}`, src: kitUrl(id, pg.file), data: sprite }).then((t) => {
          pages[group]![i] = t.source;
        }),
      );
    });
  }
  const images: Record<string, Texture> = {};
  for (const key of worldImages(manifest)) {
    const im = manifest.images[key]!;
    // far layers are drawn well below their size on small phones: mipmaps keep them from shimmering
    const mip = key === 'horizon' || key === 'distant';
    const data = im.repeat ? { scaleMode: 'linear', addressMode: 'repeat' } : { scaleMode: 'linear', autoGenerateMipmaps: mip };
    jobs.push(
      Assets.load<Texture>({ alias: `${id}:${im.file}`, src: kitUrl(id, im.file), data }).then((t) => {
        images[key] = t;
      }),
    );
  }
  await Promise.all(jobs);

  const cache = new Map<string, Texture>();
  return {
    id,
    manifest,
    frame(name) {
      let t = cache.get(name);
      if (!t) {
        const f = manifest.frames[name];
        if (!f) throw new Error(`kit ${id}: no frame ${name}`);
        t = new Texture({ source: pages[f.atlas]![f.page]!, frame: new Rectangle(f.x, f.y, f.w, f.h), label: `${id}:${name}` });
        cache.set(name, t);
      }
      return t;
    },
    image(key) {
      const t = images[key];
      if (!t) throw new Error(`kit ${id}: no image ${key}`);
      return t;
    },
  };
}
