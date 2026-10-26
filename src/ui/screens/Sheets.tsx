import { useState } from 'preact/hooks';
import { clearSave } from '../../app/storage';
import { save, sheet } from '../../app/store';
import { Button, Sheet } from '../kit/kit';
import { Toggles } from './BattleHud';

/** Settings (UX §7). Reset needs two confirmations. */
export function SettingsSheet() {
  const [confirm, setConfirm] = useState(0);
  return (
    <Sheet title="SETTINGS" onClose={() => (sheet.value = null)} testId="settings-sheet">
      <div class="sheet-col">
        <Toggles set={save.value.settings} />
        <Button
          tone={confirm ? 'red' : 'dark'}
          label={confirm === 0 ? 'Reset Progress' : confirm === 1 ? 'Really reset?' : 'Tap again to erase'}
          testId="reset"
          onPress={() => {
            if (confirm < 2) setConfirm(confirm + 1);
            else {
              clearSave();
              location.reload();
            }
          }}
        />
        <Button tone="blue" label="Done" onPress={() => (sheet.value = null)} testId="settings-done" />
        <div class="version">We Are Storm · build {import.meta.env.VITE_BUILD ?? 'dev'}</div>
      </div>
    </Sheet>
  );
}
