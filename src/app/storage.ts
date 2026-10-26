import { migrate, newSave, parseSave, type SaveV1 } from '../meta/save';

/**
 * Save persistence (TECH §6). Two keys: the live save and the last good copy. A save that fails to parse is kept
 * under a quarantine key instead of being overwritten, so a bug can never silently wipe a player's progress.
 */
const KEY = 'wearestorm.save.v1';
const BACKUP = 'wearestorm.save.v1.bak';
const QUARANTINE = 'wearestorm.save.v1.broken';

function store(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // private mode / blocked storage: play without persistence
  }
}

export function loadSave(): SaveV1 {
  const ls = store();
  if (!ls) return newSave();
  const main = ls.getItem(KEY);
  const parsed = parseSave(main);
  if (parsed) return parsed;
  if (main) {
    try {
      ls.setItem(QUARANTINE, main);
    } catch {
      /* storage full: keep going */
    }
  }
  return parseSave(ls.getItem(BACKUP)) ?? newSave();
}

export function writeSave(save: SaveV1): void {
  const ls = store();
  if (!ls) return;
  const text = JSON.stringify(migrate(save));
  try {
    const prev = ls.getItem(KEY);
    if (prev && parseSave(prev)) ls.setItem(BACKUP, prev);
    ls.setItem(KEY, text);
  } catch {
    /* quota exceeded: the in-memory save is still authoritative for this session */
  }
}

export function clearSave(): void {
  const ls = store();
  if (!ls) return;
  for (const k of [KEY, BACKUP, QUARANTINE]) ls.removeItem(k);
}
