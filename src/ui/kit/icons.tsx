import { useState } from 'preact/hooks';
import { ICON_KIT, kitUrl, type KitId } from '../../render/kits/ageKits';

/**
 * The icon set. Symbols the art kits draw come from the kit bound to your army's Age (a 4 × 4 sheet built by
 * tools/art/build_kits.py, order ICON_ORDER there); the rest are the original SVGs: filled shapes, a cel shadow, and
 * an ink outline that stays 2.5 pt at any display size (non-scaling stroke), drawn on a 48 × 48 grid. No emoji
 * anywhere in the UI: every symbol is one of these.
 */
const INK = '#1D1830';
const S = `stroke="${INK}" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"`;

const ICONS = {
  coin: `<circle cx="24" cy="24" r="19" fill="#FFCF3D" ${S}/><path d="M24 7a17 17 0 0 1 0 34a19 19 0 0 0 0-34z" fill="#E39A12" opacity=".55"/><circle cx="24" cy="24" r="12.5" fill="none" stroke="#E39A12" stroke-width="2.5"/><path d="M26 13l-8 13h6l-2 9l8-13h-6z" fill="#FFF3C4" ${S}/>`,
  food: `<path d="M29 9c7 0 11 5 11 11c0 8-8 13-15 13l-6 6a4 4 0 1 1-5-2a4 4 0 1 1-2-5l6-6c0-8 4-17 11-17z" fill="#FF9A3D" ${S}/><path d="M29 12c5 0 8 4 8 8c0 5-4 9-9 10c5-4 6-11 1-18z" fill="#C96A1E" opacity=".5"/><path d="M27 14c-3 1-5 4-5 7" fill="none" stroke="#FFE0B8" stroke-width="3" stroke-linecap="round"/>`,
  bolt: `<path d="M28 4L10 28h11l-4 16l20-26H26z" fill="#FFCF3D" ${S}/><path d="M28 4l-2 14h11L17 44l9-18" fill="#E39A12" opacity=".35"/>`,
  storm: `<path d="M14 28a9 9 0 0 1 2-17a12 12 0 0 1 22 3a8 8 0 0 1-1 14z" fill="#DCE3EF" ${S}/><path d="M26 24l-7 11h6l-3 9l9-13h-6l3-7z" fill="#FFCF3D" ${S}/>`,
  skull: `<path d="M24 6c10 0 16 7 16 15c0 6-3 9-6 10v7H14v-7c-3-1-6-4-6-10c0-8 6-15 16-15z" fill="#F7F9FC" ${S}/><circle cx="17.5" cy="22" r="4.5" fill="${INK}"/><circle cx="30.5" cy="22" r="4.5" fill="${INK}"/><path d="M24 27l-2.5 4h5z" fill="${INK}"/><path d="M19 38v-4M24 38v-4M29 38v-4" ${S}/>`,
  crown: `<path d="M7 16l9 8l8-14l8 14l9-8l-4 22H11z" fill="#FFCF3D" ${S}/><path d="M11 32h26v6H11z" fill="#E39A12" ${S}/><circle cx="24" cy="10" r="3" fill="#F0533C" ${S}/>`,
  gear: `<path d="M21 5h6l1 5l4 2l5-3l4 4l-3 5l2 4l5 1v6l-5 1l-2 4l3 5l-4 4l-5-3l-4 2l-1 5h-6l-1-5l-4-2l-5 3l-4-4l3-5l-2-4l-5-1v-6l5-1l2-4l-3-5l4-4l5 3l4-2z" fill="#DCE3EF" ${S}/><circle cx="24" cy="24" r="7" fill="#6B7488" ${S}/>`,
  pause: `<rect x="12" y="10" width="9" height="28" rx="3" fill="#F7F9FC" ${S}/><rect x="27" y="10" width="9" height="28" rx="3" fill="#F7F9FC" ${S}/>`,
  play: `<path d="M15 9l24 15l-24 15z" fill="#F7F9FC" ${S}/>`,
  close: `<path d="M13 13l22 22M35 13L13 35" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><path d="M13 13l22 22M35 13L13 35" stroke="#F7F9FC" stroke-width="4" stroke-linecap="round"/>`,
  lock: `<path d="M16 21v-5a8 8 0 0 1 16 0v5" fill="none" stroke="${INK}" stroke-width="7"/><path d="M16 21v-5a8 8 0 0 1 16 0v5" fill="none" stroke="#A9B3C5" stroke-width="3"/><rect x="11" y="20" width="26" height="21" rx="5" fill="#FFCF3D" ${S}/><circle cx="24" cy="29" r="3" fill="${INK}"/><path d="M24 30v5" ${S}/>`,
  check: `<path d="M9 25l9 9L39 13" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 25l9 9L39 13" fill="none" stroke="#46C25A" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
  home: `<path d="M7 23L24 8l17 15v18H7z" fill="#F7F9FC" ${S}/><path d="M19 41V29h10v12" fill="#2E86F0" ${S}/><path d="M5 24L24 7l19 17" fill="none" stroke="#F0533C" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
  sound: `<path d="M8 19h8l10-8v26l-10-8H8z" fill="#F7F9FC" ${S}/><path d="M31 17a9 9 0 0 1 0 14M35 12a15 15 0 0 1 0 24" fill="none" ${S}/>`,
  music: `<path d="M18 34V12l20-5v22" fill="none" stroke="${INK}" stroke-width="6"/><path d="M18 34V12l20-5v22" fill="none" stroke="#F7F9FC" stroke-width="2.5"/><circle cx="14" cy="35" r="6" fill="#F7F9FC" ${S}/><circle cx="34" cy="30" r="6" fill="#F7F9FC" ${S}/>`,
  flag: `<path d="M12 6v37" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M13 9h22l-5 7l5 7H13z" fill="#F7F9FC" ${S}/>`,
  up: `<path d="M24 6L8 24h10v16h12V24h10z" fill="#46C25A" ${S}/><path d="M24 6l16 18H30v16h-3V21h6z" fill="#2A8C3B" opacity=".45"/>`,
  helmet: `<path d="M8 30a16 16 0 0 1 32 0v6H8z" fill="#9AA3B5" ${S}/><path d="M24 14v22" stroke="${INK}" stroke-width="2.5"/><path d="M6 36h36v5H6z" fill="#6B7488" ${S}/>`,
  heart: `<path d="M24 41S6 30 6 18a9 9 0 0 1 18-3a9 9 0 0 1 18 3c0 12-18 23-18 23z" fill="#F0533C" ${S}/><path d="M13 15a5 5 0 0 0-3 5" stroke="#FFB4A6" stroke-width="3" stroke-linecap="round" fill="none"/>`,
  sword: `<path d="M34 5h9v9L20 37l-9-9z" fill="#DCE3EF" ${S}/><path d="M9 25l14 14M7 41l6-6" ${S}/><path d="M9 25l14 14" stroke="#9B6A3F" stroke-width="5" stroke-linecap="round"/>`,
  shield: `<path d="M24 5l16 6v12c0 10-7 17-16 20C15 40 8 33 8 23V11z" fill="#2E86F0" ${S}/><path d="M24 5v38c9-3 16-10 16-20V11z" fill="#1C5FC4" opacity=".6"/>`,
  wall: `<path d="M6 16h36v26H6z" fill="#C9A27A" ${S}/><path d="M6 24h36M6 33h36M18 16v8M30 16v8M12 24v9M24 24v9M36 24v9M18 33v9M30 33v9" ${S}/><path d="M6 8h8v8H6zM20 8h8v8h-8zM34 8h8v8h-8z" fill="#C9A27A" ${S}/>`,
  melee: `<path d="M30 6c6 0 10 4 10 9c0 4-3 7-6 8L16 41l-7-7l18-18c0-5 0-10 3-10z" fill="#A36B3F" ${S}/><circle cx="32" cy="14" r="2.5" fill="${INK}"/><circle cx="26" cy="19" r="2" fill="${INK}"/>`,
  ranged: `<path d="M12 40c2-14 10-26 26-30" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M12 40c2-14 10-26 26-30" fill="none" stroke="#8A5A3B" stroke-width="3" stroke-linecap="round"/><circle cx="37" cy="11" r="6" fill="#9AA3B5" ${S}/>`,
  tank: `<path d="M24 5l15 5v13c0 10-6 17-15 20C15 40 9 33 9 23V10z" fill="#9AA3B5" ${S}/><path d="M24 12v24M15 19h18" stroke="${INK}" stroke-width="2.5"/>`,
  star: `<path d="M24 5l5.6 12l13 1.5l-9.6 9l2.6 13L24 34l-11.6 6.5l2.6-13l-9.6-9l13-1.5z" fill="#FFCF3D" ${S}/>`,
  speed: `<path d="M8 12l12 12l-12 12M24 12l12 12l-12 12" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 12l12 12l-12 12M24 12l12 12l-12 12" fill="none" stroke="#FFCF3D" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  battle: `<path d="M8 8l22 22M40 8L18 30" stroke="${INK}" stroke-width="8" stroke-linecap="round"/><path d="M8 8l22 22M40 8L18 30" stroke="#DCE3EF" stroke-width="3.5" stroke-linecap="round"/><path d="M27 33l8-8M21 33l-8-8M9 39l7-7M39 39l-7-7" stroke="${INK}" stroke-width="6" stroke-linecap="round"/><path d="M27 33l8-8M21 33l-8-8" stroke="#9B6A3F" stroke-width="2.5" stroke-linecap="round"/>`,
  ages: `<circle cx="24" cy="24" r="18" fill="#8B5CF6" ${S}/><path d="M26 10l-10 16h7l-3 12l11-17h-7z" fill="#FFCF3D" ${S}/>`,
  vibrate: `<rect x="15" y="8" width="18" height="32" rx="4" fill="#F7F9FC" ${S}/><path d="M9 16v16M39 16v16M5 20v8M43 20v8" ${S}/>`,
  motion: `<circle cx="24" cy="24" r="16" fill="#F7F9FC" ${S}/><path d="M16 24h16" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`,
  next: `<path d="M16 10l14 14l-14 14" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 10l14 14l-14 14" fill="none" stroke="#46C25A" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
  numbers: `<rect x="6" y="12" width="36" height="24" rx="8" fill="#F7F9FC" ${S}/><path d="M15 20l3-2v12M26 19h6l-6 11h7" fill="none" ${S}/>`,
} as const;

export type IconName = keyof typeof ICONS;

/** Kit sheet cells, in the order the art tool packs them. */
export const KIT_ICON_ORDER = ['credits', 'food', 'stormcall', 'battle', 'army', 'ages', 'walls', 'melee', 'ranged', 'tank', 'boss', 'crown', 'settings', 'pause', 'speed', 'locked'] as const;

/** UI icon → kit icon. Anything not listed keeps its SVG. */
export const KIT_ICON: Partial<Record<IconName, (typeof KIT_ICON_ORDER)[number]>> = {
  coin: 'credits',
  food: 'food',
  storm: 'stormcall',
  bolt: 'stormcall',
  battle: 'battle',
  helmet: 'army',
  ages: 'ages',
  wall: 'walls',
  melee: 'melee',
  ranged: 'ranged',
  tank: 'tank',
  skull: 'boss',
  crown: 'crown',
  gear: 'settings',
  pause: 'pause',
  speed: 'speed',
  lock: 'locked',
};


function kitStyle(name: IconName, size: number, kit: KitId): string | null {
  const k = KIT_ICON[name];
  if (!k) return null;
  const i = KIT_ICON_ORDER.indexOf(k);
  const x = ((i % 4) * 100) / 3;
  const y = (Math.floor(i / 4) * 100) / 3;
  return `--s:${size}px;background-image:url(${kitUrl(kit, 'icons.webp')});background-position:${x}% ${y}%`;
}

/** The raw markup of an icon, for elements built outside Preact (coin flights, sparkles). */
export function iconHtml(name: IconName, size: number): string {
  const st = kitStyle(name, size, ICON_KIT);
  if (st) return `<span class="icon kit-icon" style="${st}" aria-hidden="true"></span>`;
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">${ICONS[name]}</svg>`;
}

export function Icon({ name, size = 28, class: cls = '' }: { name: IconName; size?: number; class?: string }) {
  const st = kitStyle(name, size, ICON_KIT);
  if (st) return <span class={`icon kit-icon ${cls}`} style={st} aria-hidden="true" />;
  return (
    <svg
      class={`icon ${cls}`}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      // static, trusted SVG strings authored in this file
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}

/**
 * A troop portrait (an upper-body crop of the kit's hero sprite). If the image cannot load, the role icon stands in.
 */
export function Portrait({ src, fallback, class: cls = '', size = 56 }: { src: string; fallback: IconName; class?: string; size?: number }) {
  const [broken, setBroken] = useState<string | null>(null);
  if (broken === src) return <Icon name={fallback} size={size} />;
  return <img class={`bust ${cls}`} src={src} alt="" draggable={false} onError={() => setBroken(src)} />;
}
