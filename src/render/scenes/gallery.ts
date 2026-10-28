import { Container, Graphics, Text } from 'pixi.js';
import type { Side } from '../../contracts';
import { RigLibrary, UnitArt } from '../art/unitArt';
import { pixiHost } from '../pixi/app';

/**
 * Art gallery / contact sheet (ART_BIBLE §5.16): every Stone troop in both factions across its key poses, on a
 * neutral card, at close-up scale. `?scene=gallery[&ids=a,b]&pose=...`. Used for builder and QA rubric scoring.
 */
const POSES = ['idle', 'walk', 'windup', 'strike', 'hit', 'cheer'] as const;

export async function showGallery(ids = ['stone.clubber', 'stone.slinger', 'stone.rockhide', 'stone.grumbo']) {
  const host = await pixiHost();
  const root = new Container();
  host.app.stage.addChild(root); // above the world, which is hidden on the title route
  const w = host.width;
  const h = host.height;
  const bg = new Graphics().rect(0, 0, w, h).fill(0xeef2f8);
  root.addChild(bg);
  const rows: { id: string; side: Side }[] = [];
  for (const id of ids) for (const side of ['player', 'enemy'] as const) rows.push({ id, side });
  const cellW = w / POSES.length;
  const cellH = h / rows.length;
  const lib = new RigLibrary();
  const bigRows = rows.map((r) => (r.id.endsWith('grumbo') ? 2.2 : r.id.endsWith('rockhide') ? 1.25 : 1));
  const unit = Math.min(cellW / 230, cellH / (200 * 1.05));
  lib.setScale(unit * (globalThis.devicePixelRatio || 1) * 1.2);
  const arts: { art: UnitArt; pose: (typeof POSES)[number] }[] = [];
  rows.forEach((r, ri) => {
    POSES.forEach((pose, pi) => {
      const card = new Graphics().roundRect(pi * cellW + 4, ri * cellH + 4, cellW - 8, cellH - 8, 12).fill(ri % 2 ? 0xe2e8f2 : 0xf7f9fc);
      root.addChild(card);
      const art = new UnitArt(lib, r.id, r.side, ri * 10 + pi + 1);
      const k = unit / bigRows[ri]!;
      art.root.position.set(pi * cellW + cellW / 2, ri * cellH + cellH - 14);
      art.root.scale.set(r.side === 'enemy' ? -k : k, k);
      root.addChild(art.root);
      arts.push({ art, pose });
      if (ri === 0) {
        const t = new Text({ text: pose, style: { fontFamily: 'Nunito', fontWeight: '900', fontSize: 12, fill: 0x6b7488 } });
        t.position.set(pi * cellW + 10, 8);
        root.addChild(t);
      }
    });
  });
  // drive each sample into its pose with the same calls the battle uses
  for (const { art, pose } of arts) {
    if (pose === 'walk') for (let i = 0; i < 9; i++) art.update(16, 'walk', 0, 105);
    else if (pose === 'windup') {
      art.onAttackStart(0, 10);
      art.update(16, 'windup', 9.4, 0);
    } else if (pose === 'strike') {
      art.onAttackStart(0, 10);
      art.update(16, 'windup', 10, 0);
      art.update(40, 'recover', 10.8, 0);
    } else if (pose === 'hit') {
      art.update(16, 'idle', 0, 0);
      art.onHit(true);
      art.update(16, 'idle', 0, 0);
    } else if (pose === 'cheer') {
      art.cheer();
      art.update(300, 'idle', 0, 0);
    } else art.update(16, 'idle', 0, 0);
  }
  document.body.dataset.gallery = 'ready';
}
