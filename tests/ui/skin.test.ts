import { describe, expect, it } from 'vitest';
import { AGE_ORDER, type Slot } from '../../src/contracts';
import { stageDef } from '../../src/data/stages';
import { rosterOf, unitDef, warlordOf } from '../../src/data/units';
import { displayName, logoUrl, portraitUrl, slotName, stageTitle, warlordName } from '../../src/ui/skin';

describe('display-name skin', () => {
  it('shows the kit names for troops and Warlords; the data names are untouched', () => {
    expect(displayName('stone.clubber')).toBe('Flintspear');
    expect(displayName('medieval.knight')).toBe('Obsidian Warden');
    expect(displayName('gunpowder.bombardier')).toBe('Grenadier');
    expect(displayName('future.titan')).toBe('Heavy');
    expect(displayName(warlordOf('stone').id)).toBe('Primal Warlord');
    expect(displayName(warlordOf('industrial').id)).toBe('Industrial Warlord');
    expect(unitDef('stone.clubber').name).toBe('Clubber');
    expect(rosterOf('ancient').ranged.name).toBe('Javelineer');
  });

  it('names every slot of every Age, each Age with its own troops', () => {
    const want: Record<string, [string, string, string, string]> = {
      stone: ['Flintspear', 'Slinghunter', 'Boneguard', 'Primal Warlord'],
      ancient: ['Longspear', 'Warbow', 'Bronze Guard', 'Ancient Warlord'],
      medieval: ['Riftblade', 'Voidseer', 'Obsidian Warden', 'Hollow Regent'],
      gunpowder: ['Musketeer', 'Grenadier', 'Sabre Guard', 'Gunpowder Warlord'],
      industrial: ['Trench Raider', 'Rifleman', 'Heavy Gunner', 'Industrial Warlord'],
      future: ['Rifleman', 'Marksman', 'Heavy', 'Siege Commander'],
    };
    for (const age of AGE_ORDER) {
      const [melee, ranged, tank, boss] = want[age]!;
      expect((['melee', 'ranged', 'tank'] as Slot[]).map((s) => slotName(age, s))).toEqual([melee, ranged, tank]);
      expect((['melee', 'ranged', 'tank'] as Slot[]).map((s) => displayName(rosterOf(age)[s].id))).toEqual([melee, ranged, tank]);
      expect(warlordName(age)).toBe(boss);
      expect(displayName(warlordOf(age).id)).toBe(boss);
    }
  });

  it('names Warlord stages after the skinned Warlord, other stages keep their titles', () => {
    expect(stageTitle(stageDef(5))).toBe('Primal Warlord');
    expect(stageTitle(stageDef(15))).toBe('Hollow Regent');
    expect(stageTitle(stageDef(30))).toBe('Siege Commander');
    expect(stageTitle(stageDef(4))).toBe(stageDef(4).title);
  });

  it('points portraits at the Age kit; the era packs share the Eldritch wordmark', () => {
    expect(portraitUrl('stone', 'tank')).toBe('/art/primal/portrait-tank.webp');
    expect(portraitUrl('gunpowder', 'ranged')).toBe('/art/gunpowder/portrait-ranged.webp');
    expect(portraitUrl('future', 'melee')).toBe('/art/future/portrait-melee.webp');
    expect(logoUrl('industrial')).toBe('/art/eldritch/logo.webp');
    expect(logoUrl('future')).toBe('/art/future/logo.webp');
  });
});
