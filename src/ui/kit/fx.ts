import { reduceMotion } from '../../app/motion';
import { iconHtml } from './icons';

/**
 * DOM one-shot effects (ART_BIBLE §5.14): coin flights, sparkles, floating numbers, confetti. Each is a short-lived
 * element in a click-through layer, animated by the Web Animations API on the compositor (transform / opacity only)
 * and removed when it finishes — no signals, no re-renders. Under Reduce Motion they are skipped; callbacks that
 * would fire on landing fire at once so the UI still settles.
 */

export interface Pt {
  x: number;
  y: number;
}

export function centerOf(el: Element | null | undefined): Pt | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width || r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
}

let layer: HTMLElement | null = null;

export function fxLayer(): HTMLElement {
  if (!layer || !layer.isConnected) layer = document.getElementById('fx'); // App renders it inside #ui
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'fx-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
  }
  return layer;
}

function make(cls: string, html = ''): HTMLElement {
  const el = document.createElement('div');
  el.className = cls;
  if (html) el.innerHTML = html;
  fxLayer().appendChild(el);
  return el;
}

/** CSS px per design point (the UI scale). */
function pt(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 1;
}

const T = (x: number, y: number, s = 1, r = 0) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s}) rotate(${r}deg)`;

export interface CoinOpts {
  delay?: number;
  /** 'pop' = coinPop (arc up, hover 250 ms, ease-in 450 ms to the target); 'toss' = a quick 300 ms arc. */
  style?: 'pop' | 'toss';
  size?: number;
  onLand?: () => void;
}

/** One coin from `from` to `to` (screen px). */
export function flyCoin(from: Pt, to: Pt, o: CoinOpts = {}) {
  if (reduceMotion()) {
    o.onLand?.();
    return;
  }
  const size = (o.size ?? 26) * pt();
  const el = make('fx-coin', iconHtml('coin', size));
  const h = size / 2;
  const [sx, sy, tx, ty] = [from.x - h, from.y - h, to.x - h, to.y - h];
  let frames: Keyframe[];
  let duration: number;
  if ((o.style ?? 'pop') === 'pop') {
    const up = 30 * pt();
    frames = [
      { transform: T(sx, sy, 0.4), offset: 0, easing: 'cubic-bezier(.22,1,.36,1)' },
      { transform: T(sx, sy - up, 1.1), offset: 0.2, easing: 'ease-in-out' },
      { transform: T(sx, sy - up - 5, 1), offset: 0.5, easing: 'cubic-bezier(.55,0,.85,.36)' },
      { transform: T(tx, ty, 0.75), offset: 1 },
    ];
    duration = 900;
  } else {
    // a short arc that bows away from the straight line (upward when it can, toward the screen centre otherwise)
    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    if (ny > 0) [nx, ny] = [-nx, -ny];
    if (Math.abs(ny) < 0.35 && Math.sign(nx) !== Math.sign(innerWidth / 2 - (sx + tx) / 2)) nx = -nx;
    const bow = Math.min(60 * pt(), len * 0.25);
    const mx = (sx + tx) / 2 + nx * bow;
    const my = Math.max(4, (sy + ty) / 2 + ny * bow);
    frames = [
      { transform: T(sx, sy, 0.7), offset: 0, easing: 'cubic-bezier(.22,1,.36,1)' },
      { transform: T(mx, my, 1.05, 90), offset: 0.45, easing: 'cubic-bezier(.55,0,.85,.36)' },
      { transform: T(tx, ty, 0.8, 180), offset: 1 },
    ];
    duration = 320;
  }
  const a = el.animate(frames, { duration, delay: o.delay ?? 0, fill: 'both' });
  a.onfinish = () => {
    el.remove();
    o.onLand?.();
  };
  a.oncancel = () => el.remove();
}

/** `n` coins from one point to another, staggered; `onLand(i)` per coin, `onDone` after the last. */
export function coinBurst(from: Pt, to: Pt, n: number, o: { stagger?: number; style?: 'pop' | 'toss'; onLand?: (i: number) => void; onDone?: () => void } = {}) {
  if (reduceMotion() || n <= 0) {
    o.onDone?.();
    return;
  }
  const spread = 14 * pt();
  for (let i = 0; i < n; i++) {
    const jitter = { x: from.x + (((i * 37) % 7) - 3) * (spread / 3), y: from.y + (((i * 53) % 5) - 2) * (spread / 4) };
    flyCoin(jitter, to, {
      style: o.style ?? 'toss',
      delay: i * (o.stagger ?? 35),
      size: 22,
      onLand: () => {
        o.onLand?.(i);
        if (i === n - 1) o.onDone?.();
      },
    });
  }
}

/** Six star sparkles burst out of a point (purchase, unlock). */
export function sparkles(at: Pt, n = 6, color = '#FFE680') {
  if (reduceMotion()) return;
  const u = pt();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.4;
    const d = (34 + (i % 3) * 10) * u;
    const s = (12 + (i % 2) * 6) * u;
    const el = make('fx-spark', `<svg viewBox="0 0 24 24" width="${s}" height="${s}"><path d="M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z" fill="${color}" stroke="#1D1830" stroke-width="2" stroke-linejoin="round"/></svg>`);
    const x0 = at.x - s / 2;
    const y0 = at.y - s / 2;
    el.animate(
      [
        { transform: T(x0, y0, 0.2), opacity: 1 },
        { transform: T(x0 + Math.cos(a) * d * 0.7, y0 + Math.sin(a) * d * 0.7, 1.15, 45), opacity: 1, offset: 0.45 },
        { transform: T(x0 + Math.cos(a) * d, y0 + Math.sin(a) * d, 0.2, 90), opacity: 0 },
      ],
      { duration: 520, delay: i * 18, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' },
    ).onfinish = () => el.remove();
  }
}

/** A short label that rises and fades ("+10%", "-5", "+12"). */
export function floatText(at: Pt, text: string, tone: 'good' | 'gold' | 'bad' = 'good') {
  const el = make(`fx-float t-display ${tone}`);
  el.textContent = text;
  const rise = reduceMotion() ? 0 : 36 * pt();
  el.animate(
    [
      { transform: `translate(${at.x}px, ${at.y}px) translate(-50%, -50%) scale(.6)`, opacity: 0 },
      { transform: `translate(${at.x}px, ${at.y - rise * 0.3}px) translate(-50%, -50%) scale(1.1)`, opacity: 1, offset: 0.2 },
      { transform: `translate(${at.x}px, ${at.y - rise}px) translate(-50%, -50%) scale(1)`, opacity: 0 },
    ],
    { duration: 900, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' },
  ).onfinish = () => el.remove();
}

const CONFETTI = ['#FFCF3D', '#2E86F0', '#46C25A', '#F0533C', '#8B5CF6', '#3FC2A0', '#FF9A3D', '#F7F9FC'];

/**
 * Confetti (ART_BIBLE §5.11): quads in palette colours burst from a point, flip (scaleX = cos t), fall with gravity
 * and drag. `n` pieces over `ms`; the victory burst uses ~70, an unlock ~28.
 */
export function confetti(at: Pt, n = 70, o: { ms?: number; power?: number } = {}) {
  if (reduceMotion()) return;
  const u = pt();
  const ms = o.ms ?? 2500;
  const power = (o.power ?? 1) * u;
  const g = 900 * u; // px/s²
  const drag = 1.6;
  for (let i = 0; i < n; i++) {
    const r1 = frac(i * 0.6180339);
    const r2 = frac(i * 0.4142135 + 0.3);
    const r3 = frac(i * 0.7320508 + 0.7);
    const ang = -Math.PI / 2 + (r1 - 0.5) * Math.PI * 1.15;
    const v = (380 + r2 * 520) * power;
    const vx = Math.cos(ang) * v;
    const vy = Math.sin(ang) * v;
    const w = (7 + r3 * 5) * u;
    const h = (11 + r2 * 6) * u;
    const el = make('fx-confetti');
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.background = CONFETTI[i % CONFETTI.length]!;
    const steps = 12;
    const frames: Keyframe[] = [];
    const spin = (r3 - 0.5) * 900;
    const flipHz = 2 + r1 * 3;
    for (let k = 0; k <= steps; k++) {
      const t = ((k / steps) * ms) / 1000;
      // velocity decays with drag; gravity pulls down (closed form of dv/dt = -drag·v + g)
      const e = (1 - Math.exp(-drag * t)) / drag;
      const x = at.x + vx * e;
      const y = at.y + vy * e + (g / drag) * (t - e);
      const flip = Math.cos(t * Math.PI * 2 * flipHz);
      frames.push({
        transform: `translate(${(x - w / 2).toFixed(1)}px, ${(y - h / 2).toFixed(1)}px) rotate(${(spin * t).toFixed(0)}deg) scaleX(${flip.toFixed(2)})`,
        opacity: k === steps ? 0 : k > steps * 0.75 ? 0.8 : 1,
      });
    }
    el.animate(frames, { duration: ms, delay: (i % 6) * 12, fill: 'both' }).onfinish = () => el.remove();
  }
}

const frac = (x: number) => x - Math.floor(x);

/** Restarts a one-shot CSS animation class on an element. */
export function replayClass(el: Element | null | undefined, cls: string) {
  if (!el) return;
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}
