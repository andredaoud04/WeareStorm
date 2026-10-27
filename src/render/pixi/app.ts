import { Application, Container } from 'pixi.js';

/**
 * The one WebGL context (TECH §5: never a second one). It fills the screen behind the DOM UI; scenes add their root
 * container to `world` and redraw on `onResize`. Resolution is capped at 2× to keep fill-rate sane on 3× phones.
 */
export interface PixiHost {
  app: Application;
  world: Container;
  width: number;
  height: number;
  onResize(fn: (w: number, h: number) => void): () => void;
}

let host: Promise<PixiHost> | null = null;

export function pixiHost(): Promise<PixiHost> {
  host ??= create();
  return host;
}

async function create(): Promise<PixiHost> {
  const app = new Application();
  await app.init({
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.min(2, globalThis.devicePixelRatio || 1),
    autoDensity: true,
    width: innerWidth,
    height: innerHeight,
    preference: 'webgl',
  });
  const canvas = app.canvas;
  canvas.id = 'world';
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '0', display: 'block' });
  document.body.prepend(canvas);
  const world = new Container();
  app.stage.addChild(world);
  const listeners = new Set<(w: number, h: number) => void>();
  const h: PixiHost = {
    app,
    world,
    width: innerWidth,
    height: innerHeight,
    onResize(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  const resize = () => {
    h.width = innerWidth;
    h.height = innerHeight;
    app.renderer.resize(innerWidth, innerHeight);
    for (const fn of listeners) fn(h.width, h.height);
  };
  addEventListener('resize', resize);
  globalThis.visualViewport?.addEventListener('resize', resize);
  return h;
}
