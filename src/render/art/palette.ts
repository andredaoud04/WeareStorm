import type { AgeId, Side } from '../../contracts';

/** Art palette (ART_BIBLE §5.4–5.5). Hex strings; the painter resolves faction tokens at bake time. */

export const INK = '#1D1830';

export const MAT = {
  skin: ['#F7D0A8', '#E0A77C', '#A9704E'],
  hair: ['#3B2A22', '#6B4428', '#E0B25A'],
  fur: '#C9A27A',
  furDark: '#A57C55',
  leather: '#8A5A3B',
  wood: '#A36B3F',
  woodLight: '#C48A55',
  bone: '#F2EAD8',
  stone: '#9AA3B5',
  stoneLight: '#B9C1CF',
  stoneDark: '#7A8396',
  iron: '#9AA3B5',
  clothWhite: '#F4F1EA',
  gold: '#F5C542',
  eyeWhite: '#FFFFFF',
  pupil: '#1D1830',
  mouth: '#7A2E3B',
  tongue: '#F0707A',
  mammoth: '#9B6A4A',
  mammothDark: '#7C5238',
  mammothLight: '#B98763',
  tusk: '#F6EEDC',
} as const;

export interface FactionPalette {
  base: string;
  shadow: string;
  light: string;
}

export const FACTION: Record<Side, FactionPalette> = {
  player: { base: '#2E86F0', shadow: '#1D5FC2', light: '#7DB8FF' },
  enemy: { base: '#F0533C', shadow: '#B5321F', light: '#FF9A84' },
};

export interface AgePalette {
  skyTop: string;
  skyHorizon: string;
  sunGlow: string;
  far: string;
  mid: string;
  near: string;
  lane: string;
  laneDark: string;
  fgProp: string;
  accentA: string;
  accentB: string;
  shadowTint: string;
  ambient: string;
}

export const AGE_PALETTE: Record<AgeId, AgePalette> = {
  stone: { skyTop: '#6EC6F5', skyHorizon: '#FFE6B0', sunGlow: '#FFF3C4', far: '#A7C4E0', mid: '#79BF5A', near: '#5DA845', lane: '#EBC793', laneDark: '#C4955F', fgProp: '#3F8F3C', accentA: '#E8C85A', accentB: '#9B6A3F', shadowTint: '#4B3D7A', ambient: '#FFFFFF' },
  ancient: { skyTop: '#58B9F0', skyHorizon: '#FFE2A6', sunGlow: '#FFF7D6', far: '#E9C88E', mid: '#C9A46A', near: '#EBCB8B', lane: '#D7A863', laneDark: '#B9874B', fgProp: '#4FA36B', accentA: '#2BB3A6', accentB: '#C9883A', shadowTint: '#6A4A8E', ambient: '#FFE9B8' },
  medieval: { skyTop: '#5DAEF2', skyHorizon: '#DDF2FF', sunGlow: '#FFFFFF', far: '#8FA9D6', mid: '#6CB352', near: '#58A146', lane: '#C29A6B', laneDark: '#9C7650', fgProp: '#3D8B3F', accentA: '#E6E1D3', accentB: '#5B6B8F', shadowTint: '#3E4A86', ambient: '#FFFFFF' },
  gunpowder: { skyTop: '#4F8FD9', skyHorizon: '#FFC98A', sunGlow: '#FFE0A3', far: '#3FA3C6', mid: '#8DB860', near: '#A9B86A', lane: '#CDA978', laneDark: '#A9845A', fgProp: '#6E9E4A', accentA: '#C8664A', accentB: '#F2EAD8', shadowTint: '#5A3F7E', ambient: '#E8E2D8' },
  industrial: { skyTop: '#6F7FA6', skyHorizon: '#F6B884', sunGlow: '#FFD39A', far: '#8C8FA8', mid: '#7C8B6A', near: '#8A8461', lane: '#7E6B57', laneDark: '#5E4E40', fgProp: '#5E6B4B', accentA: '#B5553F', accentB: '#8E9AAC', shadowTint: '#3F3A66', ambient: '#FFB36B' },
  future: { skyTop: '#1B2350', skyHorizon: '#FF8CC6', sunGlow: '#9FD8FF', far: '#3A3F8C', mid: '#2E3A74', near: '#3A4E8C', lane: '#5A6FB0', laneDark: '#2C3A6E', fgProp: '#2B3366', accentA: '#E9EEF8', accentB: '#6DF0FF', shadowTint: '#1E1B4A', ambient: '#9FF3FF' },
};

// ---------------------------------------------------------------------------------------------------------------
// Colour maths

export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Shadow tone (ART_BIBLE §5.3.2): the base multiplied by the Age's shadow tint at `amount` (30 %). */
export function shadowOf(base: string, tint: string, amount = 0.3): string {
  const [r, g, b] = hexToRgb(base);
  const [tr, tg, tb] = hexToRgb(tint);
  const m = (c: number, t: number) => c * (1 - amount + amount * (t / 255)) * (1 - amount * 0.35);
  return rgbToHex(m(r, tr), m(g, tg), m(b, tb));
}

/** Highlight tone (§5.3.3): the base lightened 28 % toward warm white. */
export function lightOf(base: string, amount = 0.28): string {
  const [r, g, b] = hexToRgb(base);
  return rgbToHex(r + (255 - r) * amount, g + (246 - g) * amount, b + (224 - b) * amount);
}

/** Inner line tone (§5.2): the material's own dark tone, never pure ink. */
export function lineOf(base: string): string {
  const [r, g, b] = hexToRgb(base);
  return rgbToHex(r * 0.62, g * 0.58, b * 0.66);
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}
