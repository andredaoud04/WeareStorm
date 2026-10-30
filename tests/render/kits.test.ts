import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AGE_ORDER } from '../../src/contracts';
import { AGE_KIT, ICON_KIT, KIT_IDS, KITS, kitForAge, kitUrl } from '../../src/render/kits/ageKits';
import { BASE_STATES, baseState, unitEntry, validateManifest, worldImages, type KitManifest } from '../../src/render/kits/manifest';

const manifest = (kit: string) => JSON.parse(readFileSync(new URL(`../../public/art/${kit}/manifest.json`, import.meta.url), 'utf8')) as KitManifest;

describe('age → kit mapping', () => {
  it('binds every Age to its own kit', () => {
    for (const age of AGE_ORDER) expect(KIT_IDS).toContain(kitForAge(age));
    expect(AGE_ORDER.map((a) => AGE_KIT[a])).toEqual(['primal', 'ancient', 'eldritch', 'gunpowder', 'industrial', 'future']);
    expect(new Set(AGE_ORDER.map(kitForAge)).size).toBe(AGE_ORDER.length);
    expect(KIT_IDS).toHaveLength(AGE_ORDER.length);
  });

  it('builds kit URLs under the public art folder', () => {
    expect(kitUrl('future', 'manifest.json')).toBe('/art/future/manifest.json');
  });
});

describe('base damage states', () => {
  it('switches at 66 % and 33 %, critical above 0, ruins at 0 or once collapsed', () => {
    expect(baseState(1)).toBe('intact');
    expect(baseState(0.661)).toBe('intact');
    expect(baseState(0.66)).toBe('damaged');
    expect(baseState(0.331)).toBe('damaged');
    expect(baseState(0.33)).toBe('critical');
    expect(baseState(0.001)).toBe('critical');
    expect(baseState(0)).toBe('ruins');
    expect(baseState(0.8, true)).toBe('ruins');
  });
});

describe('kit manifests (public/art)', () => {
  for (const kit of KIT_IDS) {
    it(`${kit}: validates, has every unit, base state, effect and icon the game draws`, () => {
      const m = manifest(kit);
      expect(validateManifest(m)).toEqual([]);
      expect(m.kit).toBe(kit);
      for (const role of ['melee', 'ranged', 'tank'] as const)
        for (const f of ['storm', 'ember'] as const) {
          const e = unitEntry(m, role, f);
          const fr = m.frames[e.frame]!;
          expect(fr.nominalH).toBeGreaterThan(100);
          expect(fr.muzzle).toHaveLength(2);
          expect(m.frames[e.white]!.w).toBe(fr.w); // the flash silhouette matches the sprite
        }
      expect(unitEntry(m, 'warlord', 'storm').frame).toBe('unit/boss'); // Warlords are Ember-only
      for (const f of ['storm', 'ember']) for (const st of BASE_STATES) expect(m.frames[m.bases[`${f}.${st}`]!]).toBeTruthy();
      for (const fx of ['hit', 'impact', 'dust', 'poof', 'projectile', 'coin', 'strike', 'scorch', 'swoosh']) expect(m.frames[`fx/${fx}`]).toBeTruthy();
      expect(m.baseAlignmentApplied).toBe(true);
      if (m.world !== 'layers') expect(Object.keys(m.sources)).toHaveLength(32);
      for (const h of Object.values(m.sources)) expect(h).toMatch(/^[0-9a-f]{64}$/);
      for (const k of worldImages(m)) expect(m.images[k]).toBeTruthy();
      for (const slot of ['melee', 'ranged', 'tank']) expect(m.images[`portrait-${slot}`]).toBeTruthy();
      for (const pages of Object.values(m.atlases)) for (const p of pages) expect(Math.max(p.w, p.h)).toBeLessThanOrEqual(2048);
    });
  }

  it('the shared icon sheet order matches the UI', () => {
    // icons.tsx pulls in Preact; read its order constant textually instead
    const src = readFileSync(new URL('../../src/ui/kit/icons.tsx', import.meta.url), 'utf8');
    const order = JSON.parse(src.match(/KIT_ICON_ORDER = (\[[^\]]+\])/)![1]!.replace(/'/g, '"'));
    expect(manifest(ICON_KIT).images.icons!.order).toEqual(order);
  });

  it('era packs record the sha256 of all 118 pack sources', () => {
    const all = ['primal', 'ancient', 'gunpowder', 'industrial'].flatMap((k) => Object.keys(manifest(k).sources).map((p) => `${k}/${p}`));
    expect(new Set(all).size).toBe(118);
  });

  it('era packs: layered world on one canvas, debris parts, a styled projectile, one base scale', () => {
    for (const kit of ['primal', 'ancient', 'gunpowder', 'industrial']) {
      const m = manifest(kit);
      expect(m.world).toBe('layers');
      const g = m.images.ground!;
      expect(g.laneY).toBeGreaterThan(g.y!); // the lane row lies inside the painted ground layer
      expect(g.laneY).toBeLessThan(g.y! + g.h);
      for (const k of ['distant', 'midground']) expect(m.images[k]!.canvas).toEqual(g.canvas);
      expect(m.images.fill!.repeat).toBe('xy');
      for (const role of ['melee', 'ranged', 'tank'] as const) expect(unitEntry(m, role, 'storm').debris.length).toBeGreaterThan(0);
      expect(m.frames['fx/projectile']!.size).toBeGreaterThan(0);
      // every damage state stands on the intact state's ground line: anchors sit on each frame's bottom row
      for (const f of ['storm', 'ember']) for (const st of BASE_STATES) {
        const fr = m.frames[m.bases[`${f}.${st}`]!]!;
        expect(Math.abs(fr.ay - fr.h)).toBeLessThan(2);
      }
    }
  });

  it('a soldier is the same nominal size in every Age; tanks larger, the Warlord ~2.4×', () => {
    for (const kit of KIT_IDS) {
      const m = manifest(kit);
      const nominal = (role: 'melee' | 'ranged' | 'tank' | 'warlord') => m.frames[unitEntry(m, role, 'ember').frame]!.nominalH!;
      expect(nominal('melee')).toBe(240);
      expect(nominal('ranged')).toBe(240);
      expect(nominal('tank')).toBe(360);
      expect(nominal('warlord')).toBe(600);
    }
  });

  it('flags a broken manifest', () => {
    const m = manifest('eldritch');
    const bad: KitManifest = { ...m, schema: 2, units: { ...m.units, 'melee.storm': undefined as never }, frames: { ...m.frames, 'fx/hit': { ...m.frames['fx/hit']!, x: 99999 } } };
    const errs = validateManifest(bad);
    expect(errs.some((e) => e.includes('schema'))).toBe(true);
    expect(errs.some((e) => e.includes('melee.storm'))).toBe(true);
    expect(errs.some((e) => e.includes('fx/hit'))).toBe(true);
  });

  it('names come from one table per kit', () => {
    expect(KITS.eldritch.units).toEqual({ melee: 'Riftblade', ranged: 'Voidseer', tank: 'Obsidian Warden' });
    expect(KITS.future.warlord).toBe('Siege Commander');
    expect(KITS.primal.units).toEqual({ melee: 'Flintspear', ranged: 'Slinghunter', tank: 'Boneguard' });
    expect(KITS.industrial.warlord).toBe('Industrial Warlord');
    for (const kit of KIT_IDS) expect(manifest(KITS[kit].logo).images.logo).toBeTruthy(); // every title has a wordmark
  });

  it('every manifest unit is drawn from the design the name table promises', () => {
    for (const kit of ['primal', 'ancient', 'gunpowder', 'industrial'] as const) {
      const m = manifest(kit);
      for (const slot of ['melee', 'ranged', 'tank'] as const) {
        const design = unitEntry(m, slot, 'storm').name.replace(/_/g, ' ');
        expect(KITS[kit].units[slot].toLowerCase()).toBe(design);
      }
    }
  });
});
