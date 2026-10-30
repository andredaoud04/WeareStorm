import { Assets, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import type { Role, Side } from '../../contracts';
import { KIT_IDS, KITS, kitUrl, type KitId } from '../kits/ageKits';
import { KitBase } from '../kits/kitBase';
import { KitUnit } from '../kits/kitUnit';
import { loadKit, type Kit } from '../kits/loader';
import { BASE_STATES } from '../kits/manifest';
import { pixiHost } from '../pixi/app';

/**
 * The owner's contact sheet: every kit sprite as the game draws it.
 * `?scene=gallery[&kit=primal|ancient|eldritch|gunpowder|industrial|future]`.
 * Per kit: the three troops in both factions across idle / walk / windup / strike / hit / death, the mounted Warlord,
 * the base in its four damage states on one shared ground line (both factions), the effects (with the era
 * projectile), wisps/clouds, props, the death-debris parts and the shared icon sheet. Poses are driven by the same
 * calls the battle uses.
 */
const POSES = ['idle', 'walk', 'windup', 'strike', 'hit', 'death'] as const;
type Pose = (typeof POSES)[number];
const COL_W = 960;
const ROWS = { title: 50, unit: 170, boss: 250, base: 250, fx: 130, prop: 110, cloud: 110, part: 90, icon: 70 };
const COL_H = ROWS.title + ROWS.unit * 6 + ROWS.boss + ROWS.base * 2 + ROWS.fx + ROWS.prop + ROWS.cloud + ROWS.part + ROWS.icon * 2 + 40;
const BG = 0x0d1124;
const CARD = [0x1f2642, 0x262e4f];
const LABEL = { fontFamily: 'Nunito', fontWeight: '900', fontSize: 13, fill: 0x9aa6c8 } as const;

export async function showGallery(only?: string) {
  const host = await pixiHost();
  const ids = KIT_IDS.filter((k) => !only || k === only);
  const kits = await Promise.all(ids.map((k) => loadKit(k)));
  // only the shared icon kit ships an icon sheet (ICON_KIT); the other columns leave that row empty
  const icons = await Promise.all(
    kits.map((k) => (k.manifest.images.icons ? Assets.load<Texture>({ src: kitUrl(k.id, 'icons.webp'), data: { scaleMode: 'linear', autoGenerateMipmaps: true } }) : null)),
  );
  const root = new Container();
  host.app.stage.addChild(root); // above the world, which is hidden on the title route
  const w = host.width;
  const h = host.height;
  root.addChild(new Graphics().rect(0, 0, w, h).fill(BG));
  const scale = Math.min(w / (COL_W * kits.length + 20 * (kits.length - 1)), h / COL_H);
  kits.forEach((kit, i) => {
    const col = new Container();
    col.position.set(i * (COL_W + 20) * scale, 0);
    col.scale.set(scale);
    root.addChild(col);
    drawKit(col, kit, icons[i] ?? null);
  });
  document.body.dataset.gallery = 'ready';
}

function drawKit(col: Container, kit: Kit, icons: Texture | null) {
  const m = kit.manifest;
  const label = (s: string, x: number, y: number, size = 13) => {
    const t = new Text({ text: s, style: { ...LABEL, fontSize: size } });
    t.position.set(x, y);
    col.addChild(t);
  };
  const card = (x: number, y: number, cw: number, ch: number, i: number) => col.addChild(new Graphics().roundRect(x + 3, y + 3, cw - 6, ch - 6, 10).fill(CARD[i % 2]!));
  label(`${m.title.toUpperCase()}  ·  ${KITS[kit.id as KitId].units.melee} / ${KITS[kit.id as KitId].units.ranged} / ${KITS[kit.id as KitId].units.tank}`, 8, 12, 20);
  let y = ROWS.title;

  // troops × factions × poses
  const cw = COL_W / POSES.length;
  POSES.forEach((p, i) => label(p, i * cw + 10, y - 16));
  for (const role of ['melee', 'ranged', 'tank'] as Role[]) {
    for (const side of ['player', 'enemy'] as Side[]) {
      POSES.forEach((pose, i) => {
        card(i * cw, y, cw, ROWS.unit, i + (side === 'enemy' ? 1 : 0));
        const u = new KitUnit(kit, role, side, 11 + i);
        posed(u, pose);
        const k = (ROWS.unit * 0.72) / u.height;
        u.root.position.set(i * cw + cw / 2, y + ROWS.unit - 16);
        u.root.scale.set(side === 'enemy' ? -k : k, k);
        col.addChild(u.root);
      });
      label(`${role} · ${side === 'player' ? 'storm' : 'ember'}`, 10, y + 8, 11);
      y += ROWS.unit;
    }
  }

  // the Warlord
  const bw = COL_W / 4;
  (['idle', 'windup', 'strike', 'hit'] as Pose[]).forEach((pose, i) => {
    card(i * bw, y, bw, ROWS.boss, i);
    const u = new KitUnit(kit, 'warlord', 'enemy', 3);
    posed(u, pose);
    const lb = u.root.getLocalBounds();
    const k = Math.min((ROWS.boss * 0.72) / u.height, (bw * 0.92) / lb.width);
    u.root.position.set(i * bw + bw / 2, y + ROWS.boss - 14);
    u.root.scale.set(-k, k);
    col.addChild(u.root);
    label(`warlord · ${pose}`, i * bw + 10, y + 8, 11);
  });
  y += ROWS.boss;

  // bases: four states per faction on one ground line
  for (const side of ['player', 'enemy'] as Side[]) {
    const gy = y + ROWS.base - 18;
    BASE_STATES.forEach((st, i) => {
      card(i * bw, y, bw, ROWS.base, i);
      const b = new KitBase(kit, side);
      const hp = { intact: 1, damaged: 0.5, critical: 0.2, ruins: 0 }[st];
      b.update(16, hp);
      b.update(2000, hp);
      const k = Math.min((ROWS.base * 0.8) / b.height, (bw * 0.94) / b.width); // the era forts are wide and low
      b.root.position.set(i * bw + bw / 2, gy);
      b.root.scale.set(side === 'enemy' ? -k : k, k);
      col.addChild(b.root);
      label(`${side === 'player' ? 'storm' : 'ember'} · ${st}`, i * bw + 10, y + 8, 11);
    });
    col.addChild(new Graphics().moveTo(0, gy).lineTo(COL_W, gy).stroke({ width: 1, color: 0x46e3ff, alpha: 0.6 }));
    y += ROWS.base;
  }

  // effects, props, wisps
  const strip = (names: string[], rowH: number, title: string, fit = 0.8) => {
    const sw = COL_W / names.length;
    names.forEach((n, i) => {
      card(i * sw, y, sw, rowH, i);
      const f = m.frames[n];
      if (!f) return;
      const s = new Sprite(kit.frame(n));
      s.anchor.set(0.5);
      const k = Math.min((sw * fit) / f.w, (rowH * fit) / f.h);
      s.scale.set(k);
      s.position.set(i * sw + sw / 2, y + rowH / 2 + 6);
      col.addChild(s);
      label(n.slice(n.indexOf('/') + 1), i * sw + 8, y + 6, 10);
    });
    label(title, COL_W - 60, y + rowH - 18, 10);
    y += rowH;
  };
  strip(Object.keys(m.frames).filter((n) => n.startsWith('fx/')), ROWS.fx, 'effects');
  strip(Object.keys(m.frames).filter((n) => n.startsWith('prop/')), ROWS.prop, 'props');
  strip(Object.keys(m.frames).filter((n) => n.startsWith('cloud/')), ROWS.cloud, 'wisps', 0.9);
  strip(Object.keys(m.frames).filter((n) => n.startsWith('part/')), ROWS.part, 'death debris', 0.85);

  // icon sheet
  const order = icons ? (m.images.icons?.order ?? []) : [];
  const cell = m.images.icons?.cell ?? 128;
  const iw = COL_W / 8;
  order.forEach((n, i) => {
    const x = (i % 8) * iw;
    const yy = y + Math.floor(i / 8) * ROWS.icon;
    card(x, yy, iw, ROWS.icon, i);
    const t = new Texture({ source: icons!.source, frame: new Rectangle((i % 4) * cell, Math.floor(i / 4) * cell, cell, cell) });
    const s = new Sprite(t);
    s.anchor.set(0.5);
    s.scale.set((ROWS.icon * 0.78) / cell);
    s.position.set(x + iw / 2, yy + ROWS.icon / 2);
    col.addChild(s);
    label(n, x + 6, yy + 4, 9);
  });
}

/** Drives a troop into a pose through the battle's own calls. */
function posed(u: KitUnit, pose: Pose) {
  switch (pose) {
    case 'walk':
      for (let i = 0; i < 7; i++) u.update(16, 'walk', 0, 105);
      break;
    case 'windup':
      u.onAttackStart(0, 10);
      u.update(16, 'windup', 9.4, 0);
      break;
    case 'strike':
      u.onAttackStart(0, 10);
      u.update(16, 'windup', 10, 0);
      u.update(50, 'recover', 10.8, 0);
      break;
    case 'hit':
      u.update(16, 'idle', 0, 0);
      u.onHit(true);
      u.update(16, 'idle', 0, 0);
      break;
    case 'death':
      u.onDeath();
      for (let i = 0; i < 10; i++) u.update(25, 'idle', 0, 0);
      break;
    default:
      u.update(16, 'idle', 0, 0);
  }
}
