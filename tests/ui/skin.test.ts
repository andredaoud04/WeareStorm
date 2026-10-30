import { describe, expect, it } from 'vitest';
import { stageDef } from '../../src/data/stages';
import { rosterOf, unitDef, warlordOf } from '../../src/data/units';
import { displayName, portraitUrl, slotName, stageTitle, warlordName } from '../../src/ui/skin';

describe('display-name skin', () => {
  it('shows the kit names for troops and Warlords; the data names are untouched', () => {
    expect(displayName('stone.clubber')).toBe('Riftblade');
    expect(displayName('medieval.knight')).toBe('Obsidian Warden');
    expect(displayName('gunpowder.bombardier')).toBe('Marksman');
    expect(displayName('future.titan')).toBe('Heavy');
    expect(displayName(warlordOf('stone').id)).toBe('Hollow Regent');
    expect(displayName(warlordOf('industrial').id)).toBe('Siege Commander');
    expect(unitDef('stone.clubber').name).toBe('Clubber');
    expect(rosterOf('ancient').ranged.name).toBe('Javelineer');
  });

  it('names Warlord stages after the skinned Warlord, other stages keep their titles', () => {
    expect(stageTitle(stageDef(5))).toBe('Hollow Regent');
    expect(stageTitle(stageDef(30))).toBe('Siege Commander');
    expect(stageTitle(stageDef(4))).toBe(stageDef(4).title);
    expect(warlordName('medieval')).toBe('Hollow Regent');
    expect(slotName('future', 'melee')).toBe('Rifleman');
  });

  it('points portraits at the Age kit', () => {
    expect(portraitUrl('stone', 'tank')).toBe('/art/eldritch/portrait-tank.webp');
    expect(portraitUrl('future', 'melee')).toBe('/art/future/portrait-melee.webp');
  });
});
