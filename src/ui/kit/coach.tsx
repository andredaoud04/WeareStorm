import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { uiSound } from '../../app/audio';
import { coachStep, type CoachStep } from '../../app/ftue';
import { Icon, type IconName } from './icons';

/**
 * Nimbus, the storm-cloud coach (GDD §1.5), and the coach mark: a one-line bubble plus a hand that points at a target
 * element (found by its data-testid and re-measured as layouts move). It is click-through everywhere — taps land on
 * the thing it points at — and the target gets `data-coached` so it can pulse.
 */

export function Nimbus({ size = 44, mood = 'happy' }: { size?: number; mood?: 'happy' | 'wow' }) {
  return (
    <svg class="nimbus" width={size} height={size * 0.9} viewBox="0 0 60 54" aria-hidden="true">
      <path d="M33 47l-6 6.5h5l-2.5 6l8-8h-5l2.5-4.5z" fill="#FFCF3D" stroke="#1D1830" stroke-width="2.4" stroke-linejoin="round" transform="translate(0 -9)" />
      <path
        d="M14 41a10 10 0 0 1-2.5-19.7A13 13 0 0 1 35 12.5a10.5 10.5 0 0 1 16.5 9.5A9.6 9.6 0 0 1 48 41z"
        fill="#EEF2FA"
        stroke="#1D1830"
        stroke-width="3"
        stroke-linejoin="round"
      />
      <path d="M12 36.5c4 3 30 3.5 38-1.5c-1 3.4-2.6 5-2 6H14c-1.7-.4-2.4-2.6-2-4.5z" fill="#C3CEE4" />
      <path d="M17 19.5a9 9 0 0 1 9-6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" />
      <ellipse cx="25" cy="28" rx="3.1" ry="3.9" fill="#1D1830" />
      <ellipse cx="37" cy="28" rx="3.1" ry="3.9" fill="#1D1830" />
      <circle cx="26.2" cy="26.6" r="1.1" fill="#fff" />
      <circle cx="38.2" cy="26.6" r="1.1" fill="#fff" />
      <ellipse cx="20" cy="33" rx="3" ry="1.8" fill="#FF9DB0" opacity=".75" />
      <ellipse cx="42" cy="33" rx="3" ry="1.8" fill="#FF9DB0" opacity=".75" />
      {mood === 'wow' ? <ellipse cx="31" cy="35" rx="2.4" ry="2.8" fill="#1D1830" /> : <path d="M27.5 33.5q3.5 3.6 7 0" fill="none" stroke="#1D1830" stroke-width="2.4" stroke-linecap="round" />}
    </svg>
  );
}

/** The pointing hand (fingertip up). Its tip sits at (0.406, 0.177) of its box. */
function Hand() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path
        d="M20 44c-6 0-10-5-10-10v-8a3 3 0 0 1 6 0v-14a3.5 3.5 0 0 1 7 0v10a3.5 3.5 0 0 1 7 0v2a3.5 3.5 0 0 1 7 0v2a3.5 3.5 0 0 1 7 0v8c0 6-5 10-11 10z"
        fill="#F7D0A8"
        stroke="#1D1830"
        stroke-width="2.5"
        stroke-linejoin="round"
      />
      <path d="M17 41c-3-1-4.5-4-4.5-7" fill="none" stroke="#E3A982" stroke-width="2.5" stroke-linecap="round" />
    </svg>
  );
}

interface Anchor {
  x: number;
  y: number;
}

/** The hand box in design points (CSS: --hs). */
const HAND_PT = 52;

export function Coach({ step }: { step: CoachStep | null }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [shift, setShift] = useState<number | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setAnchor(null);
    setShift(null);
    if (!step) return;
    let target: Element | null = null;
    const measure = () => {
      const el = document.querySelector(`[data-testid="${step.target}"]`);
      if (el !== target) {
        target?.removeAttribute('data-coached');
        target = el;
        el?.setAttribute('data-coached', '');
      }
      const r = el?.getBoundingClientRect();
      if (!r || !r.width) {
        setAnchor(null);
        return;
      }
      const a =
        step.place === 'left'
          ? { x: Math.round(r.left), y: Math.round(r.top + r.height / 2) }
          : { x: Math.round(r.left + r.width / 2), y: Math.round(step.place === 'above' ? r.top : r.bottom) };
      // breathing targets wobble a pixel or two; only follow real moves
      setAnchor((p) => (p && Math.abs(p.x - a.x) < 4 && Math.abs(p.y - a.y) < 4 ? p : a));
    };
    measure();
    const t = setInterval(measure, 200);
    addEventListener('resize', measure);
    return () => {
      clearInterval(t);
      removeEventListener('resize', measure);
      target?.removeAttribute('data-coached');
    };
  }, [step]);

  // keep the bubble on screen: centred on the target (or beside the hand), clamped to a 10 px margin
  useLayoutEffect(() => {
    const b = bubble.current;
    if (!b || !anchor || !step || step.bubble) return;
    const w = b.offsetWidth;
    const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 1;
    const hand = HAND_PT * u;
    let left = anchor.x - w / 2;
    if (step.side) left = anchor.x > innerWidth / 2 ? anchor.x - hand * 0.55 - w : anchor.x + hand * 0.55;
    left = Math.max(10, Math.min(innerWidth - 10 - w, left));
    setShift(Math.round(left - anchor.x));
  }, [anchor?.x, step?.id, step?.text, step?.target]);

  if (!step || !anchor) return null;
  const cls = ['coach', step.place, step.hand ? 'with-hand' : 'no-hand', step.side ? 'side' : ''].join(' ');
  const line = step.text && (
    <>
      <Nimbus size={40} />
      <span>{step.text}</span>
    </>
  );
  return (
    <>
      <div class={cls} style={{ transform: `translate(${anchor.x}px, ${anchor.y}px)` }} data-testid="coach" data-step={step.id} aria-live="polite">
        {step.hand && (
          <div class="coach-hand">
            <Hand />
          </div>
        )}
        {!step.hand && step.text && <i class="coach-tail" />}
        {line && !step.bubble && (
          <div class="coach-bubble" ref={bubble} style={{ left: `${shift ?? -9999}px`, visibility: shift === null ? 'hidden' : undefined }}>
            {line}
          </div>
        )}
      </div>
      {line && step.bubble && <div class={`coach-bubble detached ${step.bubble}`}>{line}</div>}
    </>
  );
}

/** The app-wide coach: whatever step the FTUE selects for the current screen. */
export function CoachLayer() {
  const step = coachStep.value;
  // Pop once per step and app session: Battle 1's deploy hand comes and goes with the card's READY state.
  const heard = useRef(new Set<string>());
  useEffect(() => {
    const id = step?.id;
    if (id && step?.text && !heard.current.has(id)) {
      heard.current.add(id);
      uiSound('toastPop', { gain: 0.7 });
    }
  }, [step?.id]);
  return (
    <div class="coach-layer">
      {/* keyed by target too: one step can move between screens ("back" on Army, then on the Hub) */}
      <Coach key={step ? `${step.id}:${step.target}` : 'none'} step={step} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------

export interface BannerSpec {
  id: number;
  title: string;
  sub?: string;
  tone: 'blue' | 'red' | 'gold';
  icon?: IconName;
}

/**
 * A momentary ribbon (≤ 1.2 s) that slides across the sky: stage intros, the Warlord's entrance. Click-through and
 * placed above the lane, so it never covers the deck or the Stormcall ring.
 */
export function Banner({ b }: { b: BannerSpec }) {
  return (
    <div class={`banner ${b.tone}`} data-testid="banner" role="status">
      <div class="banner-band">
        <div class="banner-title t-display">
          {b.icon && <Icon name={b.icon} size={34} />}
          {b.title}
        </div>
        {b.sub && <div class="banner-sub t-display">{b.sub}</div>}
      </div>
    </div>
  );
}

export const BANNER_MS = 1200;
