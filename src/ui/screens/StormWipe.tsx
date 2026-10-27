import { useEffect, useRef, useState } from 'preact/hooks';
import { uiSound } from '../../app/audio';
import { session } from '../../app/battleController';
import { reduceMotion } from '../../app/motion';
import { route } from '../../app/store';
import { Icon } from '../kit/icons';

const WIPE_MS = 440;

/**
 * The storm wipe (ART_BIBLE §5.14, Home → Battle; ~380 ms): a band of ink-outlined clouds sweeps off the screen while the next
 * scene is already live behind it, and the world pushes in from 1.06. It plays on every switch into or out of a
 * battle (and battle → next battle). It never delays the switch and is click-through, so a tap is never lost; under
 * Reduce Motion it is a quick fade.
 */
export function StormWipe() {
  const r = route.value;
  const key = r === 'battle' ? `battle:${session.value?.id ?? ''}` : r;
  const prev = useRef(key);
  const from = useRef('');
  const seq = useRef(0);
  const [doneSeq, setDoneSeq] = useState(0);
  if (prev.current !== key) {
    from.current = prev.current;
    prev.current = key;
    if (from.current.startsWith('battle') || key.startsWith('battle')) seq.current += 1;
  }
  const id = seq.current;
  useEffect(() => {
    if (!id) return;
    if (from.current !== 'title') uiSound('sheetOpen', { gain: 0.55 }); // the title tap has its own start sound
    if (!reduceMotion() && key.startsWith('battle')) {
      document.getElementById('world')?.animate([{ transform: 'scale(1.06)' }, { transform: 'none' }], { duration: 600, easing: 'cubic-bezier(.22,1,.36,1)' });
    }
    const t = setTimeout(() => setDoneSeq(id), WIPE_MS);
    return () => clearTimeout(t);
  }, [id]);
  if (!id || doneSeq === id) return null;
  return (
    <div class="wipe" key={id} aria-hidden="true" data-testid="wipe">
      <div class="wipe-band" />
      <div class="wipe-bolt">
        <Icon name="bolt" size={90} />
      </div>
    </div>
  );
}
