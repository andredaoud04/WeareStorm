import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AGE_ORDER } from '../../src/contracts';
import { AGE_KIT, KIT_IDS, KITS, kitForAge, kitUrl } from '../../src/render/kits/ageKits';
import { BASE_STATES, baseState, unitEntry, validateManifest, type KitManifest } from '../../src/render/kits/manifest';

const manifest = (kit: string) => JSON.parse(readFileSync(new URL(`../../public/art/${kit}/manifest.json`, import.meta.url), 'utf8')) as KitManifest;

describe('age → kit mapping', () => {
  it('binds every Age to a kit: the early Ages to Eldritch, the late ones to Future', () => {
    for (const age of AGE_ORDER) expect(KIT_IDS).toContain(kitForAge(age));
    expect(AGE_ORDER.map((a) => AGE_KIT[a])).toEqual(['eldritch', 'eldritch', 'eldritch', 'future', 'future', 'future']);
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
      expect(Object.keys(m.sources)).toHaveLength(32);
      for (const pages of Object.values(m.atlases)) for (const p of pages) expect(Math.max(p.w, p.h)).toBeLessThanOrEqual(2048);
    });

    it(`${kit}: the icon sheet order matches the UI's`, async () => {
      // icons.tsx pulls in Preact signals and the store; read its order constant textually instead
      const src = readFileSync(new URL('../../src/ui/kit/icons.tsx', import.meta.url), 'utf8');
      const order = JSON.parse(src.match(/KIT_ICON_ORDER = (\[[^\]]+\])/)![1]!.replace(/'/g, '"'));
      expect(manifest(kit).images.icons!.order).toEqual(order);
    });
  }

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
  });
});
