import { describe, expect, it } from 'vitest';
import { MAX_AGE, nextAgeInBuild } from '../../src/app/build';
import { migrate, newSave } from '../../src/meta/save';

describe('build limits and saved preferences', () => {
  it('offers the next Age only when this build includes it', () => {
    expect(MAX_AGE).toBe(6); // tests run the full build
    expect(nextAgeInBuild({ ...newSave(), armyAge: 'stone' })).toBe(true);
    expect(nextAgeInBuild({ ...newSave(), armyAge: 'industrial' })).toBe(true);
    expect(nextAgeInBuild({ ...newSave(), armyAge: 'future' })).toBe(false);
  });

  it('remembers the x2 choice and defaults old saves to x1', () => {
    expect(newSave().settings.fast).toBe(false);
    const old = JSON.parse(JSON.stringify(newSave()));
    delete old.settings.fast;
    expect(migrate(old).settings.fast).toBe(false);
    expect(migrate({ ...old, settings: { ...old.settings, fast: true } }).settings.fast).toBe(true);
  });
});
