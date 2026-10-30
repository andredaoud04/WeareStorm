import { Container, Sprite } from 'pixi.js';
import type { Side } from '../../contracts';
import type { Kit } from './loader';
import { BASE_STATES, baseState, factionOf, type BaseState } from './manifest';
import { BASE_HEIGHT } from './sizes';

/**
 * A base (Rift Citadel, Citadel or an era fortress): four damage states drawn at one common scale on one ground line (each state's
 * ground anchor and width normalisation were applied by the art tool, so nothing is rescaled here). Hits shake and
 * brighten it; a state change crossfades; the collapse sinks the last standing state into the ruins. Local frame:
 * the base's ground anchor at (0, 0), facing +x (the scene mirrors the enemy's).
 */
export class KitBase {
  readonly root = new Container();
  private body = new Container();
  private sprites = new Map<BaseState, Sprite>();
  private glow = new Sprite();
  private state: BaseState = 'intact';
  private prev: BaseState | null = null;
  private swapT = 1; // 0..1 crossfade progress
  private t = 0;
  private hitUntil = 0;
  private collapse = -1; // ms since the collapse began
  /** World units per texture pixel. */
  readonly scale: number;
  /** Visible width of the intact state, wu. */
  readonly width: number;
  /** Visible height of the intact state, wu (BASE_HEIGHT for the atlas kits; the wide era forts are lower). */
  readonly height: number;
  onStateChange: ((s: BaseState) => void) | null = null;

  constructor(kit: Kit, readonly side: Side) {
    const m = kit.manifest;
    this.scale = BASE_HEIGHT / m.baseRefHeight;
    const f = factionOf(side);
    for (const st of BASE_STATES) {
      const name = m.bases[`${f}.${st}`]!;
      const fr = m.frames[name]!;
      const s = new Sprite(kit.frame(name));
      s.anchor.set(fr.ax / fr.w, fr.ay / fr.h);
      s.scale.set(this.scale);
      s.visible = st === 'intact';
      this.sprites.set(st, s);
      this.body.addChild(s);
    }
    const intact = m.frames[m.bases[`${f}.intact`]!]!;
    this.width = intact.w * this.scale;
    this.height = intact.h * this.scale;
    // hit flash: the current state drawn again additively
    this.glow.blendMode = 'add';
    this.glow.alpha = 0;
    this.body.addChild(this.glow);
    this.root.addChild(this.body);
  }

  hit(heavy = false) {
    this.hitUntil = this.t + (heavy ? 140 : 90);
  }

  startCollapse() {
    if (this.collapse < 0) this.collapse = 0;
  }

  get current(): BaseState {
    return this.state;
  }

  /** @param hp the base's health fraction 0..1 */
  update(dt: number, hp: number) {
    this.t += dt;
    const next = baseState(hp, this.collapse >= 0 && this.collapse > 420);
    if (next !== this.state) {
      this.prev = this.state;
      this.state = next;
      this.swapT = 0;
      this.onStateChange?.(next);
    }
    // crossfade (the collapse into ruins is slower and sinks the old state)
    const sinking = this.state === 'ruins';
    if (this.swapT < 1) this.swapT = Math.min(1, this.swapT + dt / (sinking ? 650 : 260));
    for (const [st, s] of this.sprites) {
      if (st === this.state) {
        s.visible = true;
        s.alpha = this.prev ? Math.min(1, this.swapT * 1.6) : 1;
        s.y = 0;
      } else if (st === this.prev && this.swapT < 1) {
        s.visible = true;
        s.alpha = 1 - this.swapT;
        s.y = sinking ? this.swapT * this.swapT * this.height * 0.25 : 0;
      } else s.visible = false;
    }
    // the collapse: a violent shudder before the ruins land
    let shake = 0;
    if (this.collapse >= 0) {
      this.collapse += dt;
      const c = this.collapse;
      if (c < 900) shake = Math.sin(c / 18) * (1 - c / 900) * 9;
    }
    const hitting = this.t < this.hitUntil;
    if (hitting) shake += Math.sin(this.t / 11) * 5;
    this.body.x = shake;
    const cur = this.sprites.get(this.state)!;
    this.glow.texture = cur.texture;
    this.glow.anchor.copyFrom(cur.anchor);
    this.glow.scale.copyFrom(cur.scale);
    this.glow.alpha = hitting ? 0.32 : Math.max(0, this.glow.alpha - dt / 200);
    this.glow.visible = this.glow.alpha > 0;
  }

  destroy() {
    this.root.destroy({ children: true });
  }
}
