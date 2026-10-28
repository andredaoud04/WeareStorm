import { mix, shadowOf, lightOf, INK, type AgePalette } from './palette';

/**
 * Backgrounds (ART_BIBLE §5.10): drawn for the actual screen, so any width is covered and nothing stretches.
 * Value hierarchy (§5.3.6): sky < far < mid < lane < bases < troops. Far layers are pushed toward the horizon colour
 * (aerial perspective); only the lane and the foreground props carry ink lines, and those are softer than troops.
 */

export interface Layout {
  w: number;
  h: number;
  groundY: number; // screen y of the lane centre line
  k: number; // pt per wu
}

function rng(seed: number) {
  let a = seed | 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where the volcano sits for this layout (the scene emits its smoke from the crater). */
export function volcanoOf(L: Layout) {
  const height = 0.55 * L.groundY;
  const base = L.groundY - 0.08 * L.groundY;
  const x = L.w * 0.72;
  return { x, base, height, craterY: base - height, craterHalf: 0.085 * height };
}

/** Sky, sun, far ranges and the volcano, mid hills and trees: everything behind the bases. */
export function drawBackdrop(ctx: CanvasRenderingContext2D, L: Layout, p: AgePalette) {
  const { w, groundY: gy, k } = L;
  const r = rng(7);
  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, gy);
  sky.addColorStop(0, p.skyTop);
  sky.addColorStop(0.62, mix(p.skyTop, p.skyHorizon, 0.55));
  sky.addColorStop(1, p.skyHorizon);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, gy + 2);
  // sun at the top-left (the light source of the whole art style)
  const sx = w * 0.18;
  const sy = gy * 0.3;
  const sr = Math.max(26, 70 * k);
  const glow = ctx.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 4);
  glow.addColorStop(0, 'rgba(255,243,196,0.75)');
  glow.addColorStop(1, 'rgba(255,243,196,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, gy);
  ctx.fillStyle = p.sunGlow;
  ctx.beginPath();
  ctx.arc(sx, sy, sr * 1.25, 0, Math.PI * 2);
  ctx.globalAlpha = 0.55;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#FFF8DC';
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.fill();

  // far ranges: two rows of peaks with snow caps, faded toward the horizon
  const ridge = (baseY: number, height: number, color: string, snow: boolean, step: number, seed: number) => {
    const rr = rng(seed);
    const pts: [number, number][] = [];
    let x = -step;
    while (x < w + step * 2) {
      pts.push([x, baseY - height * (0.45 + rr() * 0.55)]);
      x += step * (0.7 + rr() * 0.6);
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-10, gy);
    for (let i = 0; i < pts.length; i++) {
      const [px, py] = pts[i]!;
      const [nx, ny] = pts[i + 1] ?? [w + 20, baseY];
      const vx = (px + nx) / 2;
      const vy = Math.max(py, ny) + height * (0.25 + rr() * 0.2);
      if (i === 0) ctx.lineTo(px, py);
      ctx.quadraticCurveTo(px + (vx - px) * 0.3, py + 4, vx, Math.min(vy, baseY));
      ctx.quadraticCurveTo(nx - (nx - vx) * 0.3, ny + 4, nx, ny);
    }
    ctx.lineTo(w + 10, gy);
    ctx.closePath();
    ctx.fill();
    if (snow) {
      ctx.fillStyle = mix('#FFFFFF', p.skyHorizon, 0.25);
      for (const [px, py] of pts) {
        if (py > baseY - height * 0.75) continue;
        const sw = height * 0.18;
        ctx.beginPath();
        ctx.moveTo(px - sw, py + sw * 0.8);
        ctx.quadraticCurveTo(px - sw * 0.4, py - 2, px, py);
        ctx.quadraticCurveTo(px + sw * 0.4, py - 2, px + sw, py + sw * 0.8);
        ctx.lineTo(px + sw * 0.55, py + sw * 0.55);
        ctx.lineTo(px + sw * 0.2, py + sw * 0.85);
        ctx.lineTo(px - sw * 0.25, py + sw * 0.55);
        ctx.lineTo(px - sw * 0.6, py + sw * 0.9);
        ctx.closePath();
        ctx.fill();
      }
    }
  };
  // ranges scale with the sky so the horizon is never a thin strip under an empty sky
  const H = gy;
  ridge(gy - 0.1 * H, 0.4 * H, mix(p.far, p.skyHorizon, 0.55), true, Math.max(90, 0.36 * w), 11);
  // the volcano: the Stone Age landmark, with a lazy smoke plume (animated puffs are added by the scene)
  const { x: vx, base: vb, height: vh } = volcanoOf(L);
  ctx.fillStyle = mix(shadowOf(p.far, p.shadowTint), p.skyHorizon, 0.38);
  ctx.beginPath();
  const vw = vh * 0.77;
  const cr = vh * 0.085;
  ctx.moveTo(vx - vw, vb);
  ctx.quadraticCurveTo(vx - vw * 0.36, vb - vh * 0.55, vx - cr, vb - vh);
  ctx.lineTo(vx + cr, vb - vh);
  ctx.quadraticCurveTo(vx + vw * 0.36, vb - vh * 0.55, vx + vw, vb);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = mix('#FF7A3C', p.skyHorizon, 0.35);
  ctx.beginPath();
  const u = vh / 430;
  ctx.moveTo(vx - cr, vb - vh);
  ctx.quadraticCurveTo(vx, vb - vh + 18 * u, vx + cr, vb - vh);
  ctx.lineTo(vx + 26 * u, vb - vh + 60 * u);
  ctx.lineTo(vx + 8 * u, vb - vh + 30 * u);
  ctx.lineTo(vx - 14 * u, vb - vh + 74 * u);
  ctx.lineTo(vx - 30 * u, vb - vh + 36 * u);
  ctx.closePath();
  ctx.fill();
  ridge(gy - 0.06 * H, 0.22 * H, mix(p.far, p.skyHorizon, 0.32), false, Math.max(70, 0.26 * w), 23);

  // mid hills with round cartoon trees
  const hill = (baseY: number, amp: number, color: string, seed: number) => {
    const rr = rng(seed);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-10, gy + 40);
    let x = -40;
    ctx.lineTo(x, baseY);
    while (x < w + 80) {
      const nx = x + (140 + rr() * 140) * k * 1.6;
      ctx.quadraticCurveTo((x + nx) / 2, baseY - amp * (0.6 + rr() * 0.6), nx, baseY - amp * rr() * 0.2);
      x = nx;
    }
    ctx.lineTo(w + 10, gy + 40);
    ctx.closePath();
    ctx.fill();
  };
  hill(gy - 70 * k, 90 * k, mix(p.mid, p.skyHorizon, 0.28), 31);
  // trees on the far hill line
  for (let i = 0; i < Math.ceil(w / (90 * k * 1.8)) + 2; i++) {
    const tx = i * 90 * k * 1.8 + r() * 60 * k;
    const ty = gy - (40 + r() * 50) * k;
    tree(ctx, tx, ty, (0.55 + r() * 0.35) * k, p, 0.35, r() > 0.5);
  }
  hill(gy - 26 * k, 60 * k, mix(p.mid, p.near, 0.25), 47);
}

function tree(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, p: AgePalette, fade: number, pine: boolean) {
  const leaf = mix(p.fgProp, p.skyHorizon, fade);
  const dark = mix(shadowOf(p.fgProp, p.shadowTint), p.skyHorizon, fade);
  const trunk = mix('#8A5A3B', p.skyHorizon, fade);
  ctx.fillStyle = trunk;
  ctx.fillRect(x - 6 * s, y - 40 * s, 12 * s, 42 * s);
  if (pine) {
    for (let i = 0; i < 3; i++) {
      const ty = y - 40 * s - i * 34 * s;
      const tw = (62 - i * 14) * s;
      ctx.fillStyle = i % 2 ? leaf : mix(leaf, dark, 0.35);
      ctx.beginPath();
      ctx.moveTo(x - tw, ty);
      ctx.quadraticCurveTo(x, ty - 70 * s, x + tw, ty);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(x + 6 * s, y - 70 * s, 46 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = leaf;
    ctx.beginPath();
    ctx.arc(x - 4 * s, y - 78 * s, 42 * s, 0, Math.PI * 2);
    ctx.arc(x + 26 * s, y - 64 * s, 26 * s, 0, Math.PI * 2);
    ctx.arc(x - 30 * s, y - 60 * s, 24 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The near ground, the lane and its edges: in front of the hills, behind bases and troops. */
export function drawGround(ctx: CanvasRenderingContext2D, L: Layout, p: AgePalette) {
  const { w, h, groundY: gy, k } = L;
  const r = rng(91);
  ctx.fillStyle = p.near;
  ctx.fillRect(0, gy - 40 * k, w, h - gy + 40 * k);
  // the lane: a packed-earth road, lighter than the troops' mid-tones (§5.3.6)
  const top = gy - 30 * k;
  const bot = gy + 34 * k;
  ctx.fillStyle = p.lane;
  ctx.beginPath();
  ctx.moveTo(0, top);
  for (let x = 0; x <= w; x += 24) ctx.lineTo(x, top + Math.sin(x * 0.05) * 2);
  ctx.lineTo(w, bot);
  for (let x = w; x >= 0; x -= 24) ctx.lineTo(x, bot + Math.sin(x * 0.07 + 1) * 2.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = lightOf(p.lane, 0.18);
  ctx.fillRect(0, top + 3 * k, w, 10 * k);
  ctx.fillStyle = p.laneDark;
  ctx.fillRect(0, bot - 6 * k, w, 6 * k);
  // ruts and pebbles
  for (let i = 0; i < w / 18; i++) {
    const x = r() * w;
    const y = top + (8 + r() * 46) * k;
    ctx.fillStyle = r() > 0.5 ? p.laneDark : lightOf(p.lane, 0.3);
    ctx.beginPath();
    ctx.ellipse(x, y, (3 + r() * 5) * k * 1.6, (2 + r() * 2) * k * 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // grass lips over both lane edges
  for (let x = -10; x < w + 10; x += 14 + r() * 10) {
    grassTuft(ctx, x, top + 4 * k, (0.6 + r() * 0.5) * k * 1.4, mix(p.near, p.fgProp, 0.4));
    if (r() > 0.35) grassTuft(ctx, x + 7, bot + 2 * k, (0.7 + r() * 0.6) * k * 1.4, p.fgProp);
  }
}

function grassTuft(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - 10 * s, y);
  ctx.quadraticCurveTo(x - 9 * s, y - 14 * s, x - 14 * s, y - 22 * s);
  ctx.quadraticCurveTo(x - 4 * s, y - 14 * s, x - 2 * s, y - 6 * s);
  ctx.quadraticCurveTo(x, y - 24 * s, x + 4 * s, y - 30 * s);
  ctx.quadraticCurveTo(x + 6 * s, y - 16 * s, x + 4 * s, y - 6 * s);
  ctx.quadraticCurveTo(x + 10 * s, y - 16 * s, x + 18 * s, y - 20 * s);
  ctx.quadraticCurveTo(x + 12 * s, y - 10 * s, x + 12 * s, y);
  ctx.closePath();
  ctx.fill();
}

/** Foreground strip between the lane and the deck: ferns, rocks, bones and flowers. Never above the lane. */
export function drawForeground(ctx: CanvasRenderingContext2D, L: Layout, p: AgePalette) {
  const { w, h, groundY: gy, k } = L;
  const r = rng(133);
  const y0 = gy + 44 * k;
  if (y0 > h) return;
  // soft stripes of darker grass give the ground depth
  for (let i = 0; i < 3; i++) {
    const yy = y0 + ((h - y0) * (i + 0.6)) / 3.4;
    ctx.fillStyle = mix(p.near, p.fgProp, 0.18 + i * 0.08);
    ctx.beginPath();
    ctx.moveTo(0, yy);
    for (let x = 0; x <= w + 30; x += 30) ctx.lineTo(x, yy + Math.sin(x * 0.03 + i * 2) * 4);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
  }
  for (let x = 0; x < w; x += 9 + r() * 12) grassTuft(ctx, x, y0 + r() * (h - y0), (0.5 + r() * 0.5) * k * 1.4, mix(p.near, p.fgProp, 0.6));
  const line = (c: string) => {
    ctx.strokeStyle = mix(shadowOf(c, p.shadowTint, 0.5), INK, 0.35);
    ctx.lineWidth = Math.max(1.5, 4 * k);
    ctx.lineJoin = 'round';
    ctx.stroke();
  };
  for (let x = -20; x < w + 40; x += (36 + r() * 60) * k * 1.6) {
    const y = y0 + r() * Math.max(10, h - y0 - 10);
    const kind = r();
    if (kind < 0.12) {
      // a bush
      const s = (0.9 + r() * 0.6) * k * 1.7;
      ctx.beginPath();
      ctx.arc(x - 14 * s, y - 12 * s, 14 * s, 0, Math.PI * 2);
      ctx.arc(x + 4 * s, y - 20 * s, 18 * s, 0, Math.PI * 2);
      ctx.arc(x + 20 * s, y - 10 * s, 12 * s, 0, Math.PI * 2);
      ctx.rect(x - 26 * s, y - 12 * s, 56 * s, 12 * s);
      ctx.fillStyle = p.fgProp;
      ctx.fill();
      line(p.fgProp);
      ctx.fillStyle = mix(p.fgProp, '#FFFFFF', 0.25);
      ctx.beginPath();
      ctx.arc(x - 2 * s, y - 28 * s, 6 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#F0533C';
      for (let j = 0; j < 3; j++) {
        ctx.beginPath();
        ctx.arc(x + (j * 12 - 10) * s, y - (14 + (j % 2) * 8) * s, 3 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind < 0.2) {
      // an old bone
      const s = (0.7 + r() * 0.4) * k * 1.7;
      ctx.beginPath();
      ctx.moveTo(x - 18 * s, y - 4 * s);
      ctx.lineTo(x + 18 * s, y - 8 * s);
      ctx.lineWidth = 7 * s;
      ctx.lineCap = 'round';
      ctx.strokeStyle = mix(shadowOf('#F2EAD8', p.shadowTint, 0.5), INK, 0.35);
      ctx.stroke();
      ctx.lineWidth = 4.5 * s;
      ctx.strokeStyle = '#F2EAD8';
      ctx.stroke();
      for (const [bx, by] of [[-18, -4], [18, -8]] as const) {
        ctx.fillStyle = '#F2EAD8';
        ctx.beginPath();
        ctx.arc(x + bx * s, y + (by - 3) * s, 4 * s, 0, Math.PI * 2);
        ctx.arc(x + bx * s, y + (by + 3) * s, 4 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind < 0.4) {
      // rock
      const s = (0.7 + r() * 0.7) * k * 1.7;
      ctx.beginPath();
      ctx.moveTo(x - 22 * s, y);
      ctx.quadraticCurveTo(x - 24 * s, y - 20 * s, x - 4 * s, y - 24 * s);
      ctx.quadraticCurveTo(x + 22 * s, y - 24 * s, x + 24 * s, y);
      ctx.closePath();
      ctx.fillStyle = '#9AA3B5';
      ctx.fill();
      line('#9AA3B5');
      ctx.fillStyle = '#B9C1CF';
      ctx.beginPath();
      ctx.ellipse(x - 6 * s, y - 16 * s, 8 * s, 4 * s, -0.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind < 0.75) {
      // fern
      const s = (0.8 + r() * 0.6) * k * 1.7;
      ctx.fillStyle = p.fgProp;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + i * 14 * s, y - 30 * s, x + i * 24 * s, y - (34 - Math.abs(i) * 8) * s);
        ctx.quadraticCurveTo(x + i * 8 * s, y - 16 * s, x + 3 * s, y);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      // flowers
      const s = (0.8 + r() * 0.5) * k * 1.7;
      for (let i = 0; i < 3; i++) {
        const fx = x + (i - 1) * 12 * s;
        const fy = y - (12 + i * 5) * s;
        ctx.strokeStyle = p.fgProp;
        ctx.lineWidth = 2.5 * s;
        ctx.beginPath();
        ctx.moveTo(fx, y);
        ctx.lineTo(fx, fy);
        ctx.stroke();
        ctx.fillStyle = i === 1 ? '#FFCF3D' : '#FFFFFF';
        ctx.beginPath();
        ctx.arc(fx, fy, 5 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#F4A340';
        ctx.beginPath();
        ctx.arc(fx, fy, 2 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

/** One puffy cartoon cloud (soft shadow underneath, no ink: sky elements stay quiet). */
export function drawCloud(ctx: CanvasRenderingContext2D, w: number, h: number, p: AgePalette, seed: number) {
  const r = rng(seed);
  const puffs: [number, number, number][] = [];
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) puffs.push([w * (0.15 + (0.7 * i) / (n - 1)), h * (0.55 + r() * 0.15 - (i > 0 && i < n - 1 ? 0.15 : 0)), h * (0.22 + r() * 0.18)]);
  const body = (dy: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const [x, y, rad] of puffs) {
      ctx.moveTo(x + rad, y + dy);
      ctx.arc(x, y + dy, rad, 0, Math.PI * 2);
    }
    ctx.rect(w * 0.15, h * 0.55 + dy, w * 0.7, h * 0.22);
    ctx.fill();
  };
  body(h * 0.06, mix('#FFFFFF', p.shadowTint, 0.18));
  body(0, '#FFFFFF');
}
