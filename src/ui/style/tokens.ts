/**
 * Single source of visual tokens (ART_BIBLE §5.13–5.14). Exported to CSS variables at boot and read by Pixi.
 * Changing a value here changes DOM UI and in-canvas art together.
 */
export const color = {
  ink: '#1D1830',
  // deep indigo, matched to the STORMGLASS night sky (M2; was #141B33 / #1E2A4A / #2B3B66)
  night900: '#121331',
  night800: '#1C1E47',
  night700: '#2A2D66',
  paper: '#F7F9FC',
  paperShade: '#DCE3EF',
  blue500: '#2E86F0',
  blue700: '#1C5FC4',
  blue300: '#7DB8FF',
  green500: '#46C25A',
  green700: '#2A8C3B',
  gold400: '#FFCF3D',
  /** Antique gold of the kits' trims: frames around panels that sit on the world. */
  goldAntique: '#C9A44C',
  gold600: '#E39A12',
  purple500: '#8B5CF6',
  purple700: '#5B34C2',
  red500: '#F0533C',
  red700: '#B5321F',
  food500: '#FF9A3D',
  grey400: '#A9B3C5',
  grey600: '#6B7488',
  roleMelee: '#F4A340',
  roleRanged: '#3FC2A0',
  roleTank: '#8A7CF0',
} as const;

export const faction = {
  player: { base: '#2E86F0', shadow: '#1D5FC2', light: '#7DB8FF', glow: '#46E3FF' },
  enemy: { base: '#F0533C', shadow: '#B5321F', light: '#FF9A84', glow: '#FF5A3C' },
} as const;

export const font = {
  display: "'Lilita One', 'Arial Rounded MT Bold', system-ui, sans-serif",
  ui: "'Nunito', system-ui, sans-serif",
} as const;

export const radius = { s: 12, m: 16, l: 20, panel: 24, sheet: 28 } as const;
export const outline = { ui: 3, bar: 2.5 } as const;

export const motion = {
  micro: 90,
  short: 160,
  medium: 260,
  long: 420,
  hero: 900,
  easeOut: 'cubic-bezier(.22,1,.36,1)',
  easeBack: 'cubic-bezier(.34,1.56,.64,1)',
  stagger: 35,
} as const;

/** UI scale from the real viewport width (UX §0): physical sizes stay sensible from SE to iPad. */
export function uiScale(viewportWidth: number): number {
  return Math.min(1.35, Math.max(0.92, viewportWidth / 390));
}

/** Writes tokens as CSS custom properties so stylesheets and components share them. */
export function applyCssTokens(root: HTMLElement) {
  for (const [k, v] of Object.entries(color)) root.style.setProperty(`--c-${k}`, v);
  root.style.setProperty('--font-display', font.display);
  root.style.setProperty('--font-ui', font.ui);
}
