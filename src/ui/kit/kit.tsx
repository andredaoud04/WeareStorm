import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { toasts } from '../../app/store';
import { Icon, type IconName } from './icons';

/** Counts a displayed number toward `value` with an ease-out (ART_BIBLE §5.14 rule 2: every number animates). */
export function useCountUp(value: number, ms = 600): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const shownRef = useRef(value);
  shownRef.current = shown;
  useEffect(() => {
    from.current = shownRef.current;
    if (from.current === value) return;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      // rAF timestamps can be earlier than the performance.now() taken above: clamp, or the first frame goes negative
      const f = Math.max(0, Math.min(1, (now - start) / ms));
      const e = 1 - Math.pow(1 - f, 3);
      setShown(Math.round(from.current + (value - from.current) * e));
      if (f < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

export interface ButtonProps {
  size?: 'l' | 'm' | 's';
  tone?: 'blue' | 'green' | 'gold' | 'purple' | 'red' | 'dark' | 'grey';
  icon?: IconName;
  iconOnly?: boolean;
  disabled?: boolean;
  highlight?: boolean;
  label?: string;
  sub?: string;
  onPress?: () => void;
  class?: string;
  testId?: string;
  ariaLabel?: string;
  children?: ComponentChildren;
}

/** Lipped cartoon button: pressed state on pointerdown, action on release inside the button (UX §0). */
export function Button(p: ButtonProps) {
  const [nope, setNope] = useState(false);
  const cls = ['btn', p.size ?? 'm', p.tone ?? 'blue', p.iconOnly ? 'icon-only' : '', p.highlight ? 'hl' : '', nope ? 'nope' : '', p.class ?? ''].join(' ');
  const isz = p.size === 'l' ? 34 : p.size === 's' ? 22 : 28;
  return (
    <button
      class={cls}
      data-testid={p.testId}
      aria-label={p.ariaLabel ?? p.label}
      aria-disabled={p.disabled || undefined}
      onClick={() => {
        if (p.disabled) {
          setNope(true);
          setTimeout(() => setNope(false), 260);
          return;
        }
        p.onPress?.();
      }}
      style={p.disabled ? { ['--face' as string]: 'var(--c-grey400)', ['--lipc' as string]: 'var(--c-grey600)' } : undefined}
    >
      {p.icon && <Icon name={p.icon} size={isz} />}
      {p.label && (
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <span class="lbl">{p.label}</span>
          {p.sub && <span class="sub">{p.sub}</span>}
        </span>
      )}
      {p.children}
      {p.highlight && !p.disabled && <span class="shine" />}
    </button>
  );
}

/** Currency pill with the icon overhanging the left edge; bumps and floats a delta when the value changes. */
export function Pill({ icon, value, testId }: { icon: IconName; value: number; testId?: string }) {
  const shown = useCountUp(value);
  const prev = useRef(value);
  const [bump, setBump] = useState(0);
  const [delta, setDelta] = useState<number | null>(null);
  useEffect(() => {
    const d = value - prev.current;
    prev.current = value;
    if (!d) return;
    setBump((b) => b + 1);
    setDelta(d);
    const t = setTimeout(() => setDelta(null), 900);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <div class={`pill ${bump ? (bump % 2 ? 'bumpA' : 'bumpB') : ''}`} data-testid={testId}>
      <Icon name={icon} size={42} />
      <span class="num">{shown}</span>
      {delta !== null && delta > 0 && <span class="delta">+{delta}</span>}
    </div>
  );
}

/** HP / progress bar with a damage ghost that lingers then shrinks. */
export function Bar({ value, max, kind = '', large }: { value: number; max: number; kind?: string; large?: boolean }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div class={`bar ${kind} ${large ? 'l' : ''}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div class="ghost" style={{ width: `${pct}%` }} />
      <div class="fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Panel({ title, tone = '', children, class: cls = '', style }: { title?: string; tone?: string; children: ComponentChildren; class?: string; style?: Record<string, string | number> }) {
  return (
    <div class={`panel ${cls}`} style={style}>
      {title && (
        <div class={`band ${tone}`}>
          <span class="lbl">{title}</span>
        </div>
      )}
      {children}
    </div>
  );
}

export function Sheet({ title, onClose, children, testId }: { title?: string; onClose?: () => void; children: ComponentChildren; testId?: string }) {
  return (
    <>
      <div class="scrim" onClick={onClose} />
      <div class="sheet" role="dialog" aria-label={title} data-testid={testId}>
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </>
  );
}

export function Toasts() {
  return (
    <div class="toasts" aria-live="polite">
      {toasts.value.map((t) => (
        <div key={t.id} class={`toast ${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export interface TabDef {
  id: string;
  label: string;
  icon: IconName;
  badge?: number | 'glow' | null;
}

export function TabBar({ tabs, active, onSelect }: { tabs: TabDef[]; active: string; onSelect: (id: string) => void }) {
  // a 5-slot grid with the v1 tabs centred (two slots reserved for later systems)
  return (
    <nav class="tabbar" aria-label="Main">
      <span />
      {tabs.map((t) => (
        <button key={t.id} class={`tab ${t.id === active ? 'on' : ''}`} data-testid={`tab-${t.id}`} onClick={() => onSelect(t.id)} aria-current={t.id === active ? 'page' : undefined}>
          <Icon name={t.icon} size={t.id === active ? 34 : 30} />
          <span class="lbl">{t.label}</span>
          {t.badge === 'glow' ? <span class="badge glow">!</span> : t.badge ? <span class="badge">{t.badge}</span> : null}
        </button>
      ))}
      <span />
    </nav>
  );
}
