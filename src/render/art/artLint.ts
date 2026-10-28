import { hexToRgb, AGE_PALETTE } from './palette';
import { paintRigCanvas } from './portraits';
import { STONE_RIGS } from './rigs';

/**
 * Measured art gates (ART_BIBLE §5.16 step 5), computed in the browser from the real painter:
 *  - faction colour covers ≥ 20 % of each troop's silhouette (GDD §2.14, §5.3 rule 7)
 *  - the lane is ≥ 0.20 lighter (relative luminance) than the troops' mid-tone (value hierarchy, §5.3 rule 6)
 */
export interface ArtLintRow {
  id: string;
  factionShare: number;
  midTone: number;
  laneGap: number;
}

const KEY = '#FF00FF';
const lum = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

export function artLint(): ArtLintRow[] {
  const rows: ArtLintRow[] = [];
  const [lr, lg, lb] = hexToRgb(AGE_PALETTE.stone.lane);
  const laneL = lum(lr, lg, lb);
  for (const [id, make] of Object.entries(STONE_RIGS)) {
    const spec = make('player');
    const keyed = paintRigCanvas(spec, 'player', 2, KEY);
    const normal = paintRigCanvas(spec, 'player', 2);
    const kd = keyed.getContext('2d')!.getImageData(0, 0, keyed.width, keyed.height).data;
    const nd = normal.getContext('2d')!.getImageData(0, 0, normal.width, normal.height).data;
    let opaque = 0;
    let faction = 0;
    const lums: number[] = [];
    for (let i = 0; i < kd.length; i += 4) {
      if (kd[i + 3]! < 200) continue;
      opaque++;
      const r = kd[i]!;
      const g = kd[i + 1]!;
      const b = kd[i + 2]!;
      if (r > 120 && b > 120 && g < 110 && Math.abs(r - b) < 70) faction++;
      // mid-tone: luminance of non-ink pixels in the normal render
      const nr = nd[i]!;
      const ng = nd[i + 1]!;
      const nb = nd[i + 2]!;
      const L = lum(nr, ng, nb);
      if (L > 0.12) lums.push(L);
    }
    lums.sort((a, b) => a - b);
    const mid = lums[Math.floor(lums.length / 2)] ?? 0;
    rows.push({ id, factionShare: opaque ? faction / opaque : 0, midTone: mid, laneGap: laneL - mid });
  }
  return rows;
}
