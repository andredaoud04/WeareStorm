import type { AgeId, Slot, UnitDefId } from '../contracts';
import type { StageDef } from '../data/stages';
import { unitDef } from '../data/units';
import { KITS, kitForAge, kitUrl } from '../render/kits/ageKits';

/**
 * The skin layer (presentation only): names and pictures follow the art kit bound to each Age, so a Stone Age
 * Clubber is shown as the Flintspear it is drawn as. The data names stay untouched for the sim, saves and logs.
 */

/** The name shown for a troop or Warlord. */
export function displayName(defId: UnitDefId): string {
  const d = unitDef(defId);
  const kit = KITS[kitForAge(d.age)];
  if (!kit) return d.name;
  return d.slot ? kit.units[d.slot] : kit.warlord;
}

/** The name shown for a slot's troop in an Age. */
export function slotName(age: AgeId, slot: Slot): string {
  return KITS[kitForAge(age)]?.units[slot] ?? slot;
}

/** The Warlord's shown name for an Age. */
export function warlordName(age: AgeId): string {
  return KITS[kitForAge(age)]?.warlord ?? age;
}

/** Stage titles: a Warlord stage is named after its (skinned) Warlord. */
export function stageTitle(stage: Pick<StageDef, 'age' | 'title' | 'warlord'>): string {
  return stage.warlord ? warlordName(stage.age) : stage.title;
}

/** The upper-body portrait of an Age's troop (always the player's Storm colours). */
export function portraitUrl(age: AgeId, slot: Slot): string {
  return kitUrl(kitForAge(age), `portrait-${slot}.webp`);
}

/** The STORMGLASS wordmark for an Age (the era packs ship none and use the Eldritch one). */
export function logoUrl(age: AgeId): string {
  return kitUrl(KITS[kitForAge(age)].logo, 'logo.webp');
}
